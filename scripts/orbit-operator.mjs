#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const command = argv[0] || "snapshot";

function arg(name, fallback = null) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function safeGit(args, fallback = "") {
  try {
    return git(args);
  } catch {
    return fallback;
  }
}

const baseRef = arg("--base", process.env.ORBIT_OPERATOR_BASE_REF || "origin/main");
const headRef = arg("--head", process.env.ORBIT_OPERATOR_HEAD_REF || "HEAD");
const allowDeletions = process.env.ORBIT_OPERATOR_ALLOW_DELETIONS === "1";

const headSha = safeGit(["rev-parse", headRef], "unknown");
const baseSha = safeGit(["rev-parse", baseRef], "unknown");
const mergeBase = safeGit(["merge-base", baseRef, headRef], "unknown");
const ancestryOk = safeGit(["merge-base", "--is-ancestor", baseRef, headRef], "__failed__") !== "__failed__";

const rawDiff = safeGit(["diff", "--name-status", `${baseRef}...${headRef}`]);
const changes = rawDiff
  ? rawDiff.split("\n").filter(Boolean).map((line) => {
      const parts = line.split("\t");
      const status = parts[0];
      return {
        status,
        path: parts.at(-1),
        previousPath: parts.length > 2 ? parts[1] : null,
      };
    })
  : [];

const domainRules = [
  ["relay", /(^|\/)(mail|relay)(\/|\.|$)|src\/lib\/relay/i],
  ["foundry", /foundry/i],
  ["content", /content-engine|(^|\/)content(\/|\.|$)/i],
  ["apex", /apex|carrier/i],
  ["leads", /(^|\/)leads?(\/|\.|$)|lead-engine/i],
  ["auth-security", /(^|\/)(auth|security)(\/|\.|$)|rls|permission/i],
  ["database", /^supabase\/(migrations|tests|functions)\//i],
  ["ci-tooling", /^\.github\/workflows\/|^scripts\/|package(-lock)?\.json$/i],
  ["shared-ui", /^src\/(app|components)\//i],
];

function classify(path) {
  const matches = domainRules.filter(([, regex]) => regex.test(path)).map(([name]) => name);
  return matches.length ? matches : ["other"];
}

const domains = {};
for (const change of changes) {
  for (const domain of classify(change.path)) {
    domains[domain] ??= [];
    domains[domain].push(change.path);
  }
}

const deleted = changes.filter((change) => change.status.startsWith("D"));
const renamed = changes.filter((change) => change.status.startsWith("R"));
const migrations = changes.filter((change) => /^supabase\/migrations\/.*\.sql$/i.test(change.path));
const workflows = changes.filter((change) => /^\.github\/workflows\//i.test(change.path));
const packageFiles = changes.filter((change) => /^package(-lock)?\.json$/i.test(change.path));
const authFiles = changes.filter((change) => /(^|\/)auth(\/|\.|$)|security|rls|permission/i.test(change.path));
const externalEffectFiles = changes.filter((change) => /mail\/actions|publish|webhook|billing|payment|deployment/i.test(change.path));

const changedPaths = changes.map((change) => change.path);
let conflictMarkers = [];
if (changedPaths.length) {
  for (const path of changedPaths) {
    if (!existsSync(path)) continue;
    try {
      const content = readFileSync(path, "utf8");
      if (/^(<<<<<<< |=======|>>>>>>> )/m.test(content)) conflictMarkers.push(path);
    } catch {
      // Binary/unreadable files are ignored by this text-only guard.
    }
  }
}

const failures = [];
if (!ancestryOk) failures.push(`Base ${baseRef} is not an ancestor of ${headRef}; release history must be reconciled explicitly.`);
if (deleted.length && !allowDeletions) failures.push(`${deleted.length} tracked file deletion(s) detected. RC deletions require explicit ORBIT_OPERATOR_ALLOW_DELETIONS=1.`);
if (conflictMarkers.length) failures.push(`Unresolved merge conflict markers detected in ${conflictMarkers.length} changed file(s).`);

let risk = "low";
if (migrations.length || workflows.length || packageFiles.length || authFiles.length || externalEffectFiles.length) risk = "high";
else if ((domains["shared-ui"]?.length || 0) > 0 || renamed.length) risk = "medium";
if (failures.length) risk = "blocked";

const summary = {
  command,
  baseRef,
  baseSha,
  headRef,
  headSha,
  mergeBase,
  ancestryOk,
  risk,
  changedFiles: changes.length,
  additionsOrModifications: changes.filter((change) => !change.status.startsWith("D")).length,
  deletions: deleted.map((change) => change.path),
  renames: renamed.map((change) => ({ from: change.previousPath, to: change.path })),
  migrations: migrations.map((change) => change.path),
  workflows: workflows.map((change) => change.path),
  packageFiles: packageFiles.map((change) => change.path),
  authOrSecurityFiles: authFiles.map((change) => change.path),
  externalEffectFiles: externalEffectFiles.map((change) => change.path),
  domains: Object.fromEntries(Object.entries(domains).map(([name, paths]) => [name, paths.length])),
  failures,
};

function markdown() {
  const rows = Object.entries(summary.domains)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `| ${name} | ${count} |`)
    .join("\n");

  return [
    "## Orbit Operator Guard",
    "",
    `- Base: \`${baseRef}\` → \`${baseSha.slice(0, 12)}\``,
    `- Head: \`${headRef}\` → \`${headSha.slice(0, 12)}\``,
    `- Changed files: **${changes.length}**`,
    `- Risk: **${risk.toUpperCase()}**`,
    `- File deletions: **${deleted.length}**`,
    `- New/changed migrations: **${migrations.length}**`,
    `- Auth/security-sensitive files: **${authFiles.length}**`,
    `- External-effect-sensitive files: **${externalEffectFiles.length}**`,
    "",
    "| Domain | Changed files |",
    "| --- | ---: |",
    rows || "| none | 0 |",
    "",
    failures.length ? `### Blocking findings\n${failures.map((item) => `- ${item}`).join("\n")}` : "**Guard result: PASS**",
    "",
  ].join("\n");
}

const md = markdown();
console.log(JSON.stringify(summary, null, 2));
console.error(`\n${md}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
}

if (command === "guard" && failures.length) process.exit(2);
if (!["guard", "snapshot"].includes(command)) {
  console.error(`Unknown command: ${command}. Use guard or snapshot.`);
  process.exit(64);
}
