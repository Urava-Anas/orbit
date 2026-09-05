#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);

function arg(name, fallback = null) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

function runGit(args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const detail = (result.stderr || result.stdout || "git command failed").trim();
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }

  return {
    status: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function git(args) {
  return runGit(args).stdout;
}

function parseNameStatus(raw) {
  if (!raw) return [];
  return raw.split("\n").filter(Boolean).map((line) => {
    const parts = line.split("\t");
    const status = parts[0];
    return {
      status,
      path: parts.at(-1),
      previousPath: parts.length > 2 ? parts[1] : null,
    };
  });
}

function parseTree(raw) {
  if (!raw) return [];
  return raw.split("\n").filter(Boolean).map((line) => {
    const [meta, path] = line.split("\t");
    const [, type, object] = meta.split(/\s+/);
    return { type, object, path };
  });
}

function pathsFor(change) {
  return [change.path, change.previousPath].filter(Boolean);
}

function byPath(changes) {
  const map = new Map();
  for (const change of changes) {
    for (const path of pathsFor(change)) map.set(path, change);
  }
  return map;
}

function unique(values) {
  return [...new Set(values)].sort();
}

function classify(path) {
  const rules = [
    ["relay", /(^|\/)(mail|relay)(\/|\.|$)|src\/lib\/relay/i],
    ["foundry", /foundry/i],
    ["content", /content-engine|(^|\/)content(\/|\.|$)/i],
    ["apex", /apex|carrier/i],
    ["leads", /(^|\/)leads?(\/|\.|$)|lead-engine/i],
    ["auth-security", /(^|\/)(auth|security)(\/|\.|$)|rls|permission/i],
    ["database", /^supabase\/(migrations|tests|functions)\//i],
    ["ci-tooling", /^\.github\/workflows\/|^scripts\/|^tests\/|package(-lock)?\.json$/i],
    ["shared-config", /(^|\/)(\.env\.example|next\.config\.[^/]+|package(-lock)?\.json)$/i],
    ["shared-navigation", /AppNavigation|(^|\/)navigation/i],
    ["shared-ui", /^src\/(app|components)\//i],
  ];
  const matches = rules.filter(([, regex]) => regex.test(path)).map(([name]) => name);
  return matches.length ? matches : ["other"];
}

function domainCounts(paths) {
  const counts = {};
  for (const path of paths) {
    for (const domain of classify(path)) counts[domain] = (counts[domain] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function parseMergeConflicts(output) {
  const conflicts = [];
  for (const line of output.split("\n")) {
    const match = line.match(/CONFLICT \([^)]*\): .*? in (.+)$/);
    if (match) conflicts.push(match[1].trim());
  }
  return unique(conflicts);
}

const baseRef = arg("--base", process.env.ORBIT_CONVERGENCE_BASE || "origin/main");
const rcRef = arg("--rc", process.env.ORBIT_CONVERGENCE_RC || "HEAD");
const candidateRef = arg("--candidate", process.env.ORBIT_CONVERGENCE_CANDIDATE);

if (!candidateRef) {
  console.error("Missing --candidate <ref> (or ORBIT_CONVERGENCE_CANDIDATE).\nUsage: node scripts/rc-convergence-auditor.mjs --base origin/main --rc HEAD --candidate <branch-or-sha>");
  process.exit(64);
}

for (const ref of [baseRef, rcRef, candidateRef]) {
  runGit(["rev-parse", "--verify", `${ref}^{commit}`]);
}

const baseSha = git(["rev-parse", baseRef]);
const rcSha = git(["rev-parse", rcRef]);
const candidateSha = git(["rev-parse", candidateRef]);
const forkPoint = git(["merge-base", rcRef, candidateRef]);
const baseToRcMergeBase = git(["merge-base", baseRef, rcRef]);

const candidateChanges = parseNameStatus(git(["diff", "--name-status", "--find-renames", `${forkPoint}..${candidateRef}`]));
const rcChangesSinceFork = parseNameStatus(git(["diff", "--name-status", "--find-renames", `${forkPoint}..${rcRef}`]));
const candidateMap = byPath(candidateChanges);
const rcMap = byPath(rcChangesSinceFork);

const candidatePaths = unique(candidateChanges.flatMap(pathsFor));
const rcPaths = unique(rcChangesSinceFork.flatMap(pathsFor));
const sharedPaths = candidatePaths.filter((path) => rcMap.has(path));
const candidateOnlyPaths = candidatePaths.filter((path) => !rcMap.has(path));

const sharedFiles = sharedPaths.map((path) => ({
  path,
  candidateStatus: candidateMap.get(path)?.status || null,
  rcStatus: rcMap.get(path)?.status || null,
  domains: classify(path),
}));

const candidateDeletions = candidateChanges
  .filter((change) => change.status.startsWith("D"))
  .map((change) => change.path)
  .sort();
const deletionsTouchingRc = candidateDeletions.filter((path) => rcMap.has(path));
const candidateMigrations = candidatePaths.filter((path) => /^supabase\/migrations\/.*\.sql$/i.test(path));
const sharedConfigOrNavigation = sharedPaths.filter((path) => classify(path).some((domain) => domain === "shared-config" || domain === "shared-navigation"));

const rcMigrationTree = parseTree(git(["ls-tree", "-r", rcRef, "--", "supabase/migrations"]));
const rcMigrationPathsByBlob = new Map();
for (const item of rcMigrationTree) {
  if (item.type !== "blob" || !/\.sql$/i.test(item.path)) continue;
  const paths = rcMigrationPathsByBlob.get(item.object) || [];
  paths.push(item.path);
  rcMigrationPathsByBlob.set(item.object, paths);
}

const duplicateMigrationBlobs = [];
for (const path of candidateMigrations) {
  const candidateBlob = git(["rev-parse", `${candidateRef}:${path}`]);
  const rcMatches = (rcMigrationPathsByBlob.get(candidateBlob) || []).filter((rcPath) => rcPath !== path);
  if (rcMatches.length) {
    duplicateMigrationBlobs.push({ candidatePath: path, rcPaths: rcMatches.sort(), blob: candidateBlob });
  }
}

const mergeTree = runGit(["merge-tree", "--write-tree", rcRef, candidateRef], { allowFailure: true });
const mergeOutput = [mergeTree.stdout, mergeTree.stderr].filter(Boolean).join("\n");
const mergeConflicts = parseMergeConflicts(mergeOutput);

const baseAncestorOfRc = runGit(["merge-base", "--is-ancestor", baseRef, rcRef], { allowFailure: true }).status === 0;

let risk = "low";
if (candidateMigrations.length || sharedConfigOrNavigation.length || candidateDeletions.length) risk = "medium";
if (mergeConflicts.length || deletionsTouchingRc.length || duplicateMigrationBlobs.length || !baseAncestorOfRc) risk = "high";

const recommendation = mergeConflicts.length
  ? "reconcile-conflicts"
  : duplicateMigrationBlobs.length
    ? "drop-duplicate-migration-files-and-review-shared"
    : sharedPaths.length
      ? "overlay-domain-files-and-review-shared"
      : "clean-overlay-candidate";

const summary = {
  baseRef,
  baseSha,
  rcRef,
  rcSha,
  candidateRef,
  candidateSha,
  forkPoint,
  baseToRcMergeBase,
  baseAncestorOfRc,
  candidateChangedFiles: candidateChanges.length,
  rcChangedFilesSinceFork: rcChangesSinceFork.length,
  candidateOnlyFiles: candidateOnlyPaths,
  sharedFiles,
  sharedConfigOrNavigation,
  candidateDeletions,
  deletionsTouchingRc,
  candidateMigrations,
  duplicateMigrationBlobs,
  mergeConflicts,
  mergeTreeClean: mergeTree.status === 0,
  candidateDomains: domainCounts(candidatePaths),
  sharedDomains: domainCounts(sharedPaths),
  risk,
  recommendation,
};

console.log(JSON.stringify(summary, null, 2));

const human = [
  "RC Convergence Auditor",
  `RC: ${rcSha.slice(0, 12)} | Candidate: ${candidateSha.slice(0, 12)} | Fork: ${forkPoint.slice(0, 12)}`,
  `Candidate files: ${candidateChanges.length} | RC-since-fork: ${rcChangesSinceFork.length} | Shared: ${sharedPaths.length}`,
  `Merge conflicts: ${mergeConflicts.length} | Candidate deletions: ${candidateDeletions.length} | Migrations: ${candidateMigrations.length}`,
  `Duplicate migration blobs: ${duplicateMigrationBlobs.length}`,
  `Risk: ${risk.toUpperCase()} | Recommendation: ${recommendation}`,
];
console.error(`\n${human.join("\n")}\n`);

if (!baseAncestorOfRc) process.exit(2);
