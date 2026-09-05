import { mkdir, writeFile } from "node:fs/promises";
import process from "node:process";

const startedAt = new Date();
const baseUrlRaw = process.env.ORBIT_ACCEPTANCE_BASE_URL ?? "";
const targetClass = process.env.ORBIT_ACCEPTANCE_TARGET_CLASS ?? "";
const expectedSha = process.env.ORBIT_ACCEPTANCE_EXPECTED_SHA ?? "";
const verifiedDeploymentSha = process.env.ORBIT_ACCEPTANCE_VERIFIED_DEPLOYMENT_SHA ?? "";
const sessionCookie = process.env.ORBIT_ACCEPTANCE_SESSION_COOKIE ?? "";
const outputDir = process.env.ORBIT_ACCEPTANCE_OUTPUT_DIR ?? "artifacts/acceptance";

const publicChecks = [
  { name: "login", path: "/login", expected: [200] },
  { name: "privacy", path: "/orbit/privacy", expected: [200] },
  { name: "account-delete", path: "/account/delete", expected: [200] },
  { name: "health", path: "/api/health/production", expected: [200] },
];

const protectedChecks = [
  { name: "founder-command", path: "/dashboard" },
  { name: "lead", path: "/dashboard/leads" },
  { name: "relay", path: "/dashboard/mail" },
  { name: "foundry", path: "/dashboard/foundry" },
  { name: "content", path: "/dashboard/content" },
  { name: "apex", path: "/dashboard/carriers" },
];

const report = {
  schemaVersion: 1,
  runner: "founder-acceptance-runner",
  startedAt: startedAt.toISOString(),
  completedAt: null,
  target: {
    baseUrl: baseUrlRaw || null,
    targetClass: targetClass || null,
    expectedSha: expectedSha || null,
    verifiedDeploymentSha: verifiedDeploymentSha || null,
  },
  mode: sessionCookie ? "authenticated-http" : "preflight",
  status: "running",
  blockers: [],
  checks: [],
  nextAction: null,
};

function addBlocker(code, message) {
  report.blockers.push({ code, message });
}

function assertSafeTarget() {
  if (!baseUrlRaw) {
    addBlocker("BASE_URL_MISSING", "Set ORBIT_ACCEPTANCE_BASE_URL to the exact non-production Preview URL.");
    return null;
  }

  let parsed;
  try {
    parsed = new URL(baseUrlRaw);
  } catch {
    addBlocker("BASE_URL_INVALID", "ORBIT_ACCEPTANCE_BASE_URL is not a valid absolute URL.");
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    addBlocker("TARGET_NOT_HTTPS", "Remote acceptance targets must use HTTPS.");
  }

  if (targetClass !== "preview" && targetClass !== "local") {
    addBlocker(
      "TARGET_CLASS_UNPROVEN",
      "Set ORBIT_ACCEPTANCE_TARGET_CLASS=preview (or local). The runner fails closed rather than assuming a target is non-production.",
    );
  }

  if (targetClass === "preview") {
    if (!expectedSha) {
      addBlocker("EXPECTED_SHA_MISSING", "Set ORBIT_ACCEPTANCE_EXPECTED_SHA to the exact release checkpoint under acceptance.");
    }
    if (!verifiedDeploymentSha) {
      addBlocker(
        "DEPLOYMENT_SHA_PROOF_MISSING",
        "Set ORBIT_ACCEPTANCE_VERIFIED_DEPLOYMENT_SHA from independently inspected Vercel deployment metadata before running Preview acceptance.",
      );
    }
    if (expectedSha && verifiedDeploymentSha && expectedSha !== verifiedDeploymentSha) {
      addBlocker(
        "DEPLOYMENT_SHA_MISMATCH",
        `Preview deployment SHA ${verifiedDeploymentSha} does not match expected release SHA ${expectedSha}.`,
      );
    }
  }

  return parsed;
}

async function runCheck(base, check, authenticated = false) {
  const headers = {};
  if (authenticated) headers.cookie = sessionCookie;

  const started = Date.now();
  try {
    const response = await fetch(new URL(check.path, base), {
      redirect: "manual",
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    const location = response.headers.get("location");
    const result = {
      name: check.name,
      path: check.path,
      authenticated,
      status: response.status,
      location,
      durationMs: Date.now() - started,
      passed: false,
      note: null,
    };

    if (authenticated) {
      result.passed = response.status === 200 && !(location ?? "").includes("/login");
      if (!result.passed) result.note = "Protected route was not directly usable with the supplied non-production session.";
    } else {
      result.passed = check.expected.includes(response.status);
      if (!result.passed) result.note = `Expected ${check.expected.join("/")}.`;
    }

    report.checks.push(result);
    return result;
  } catch (error) {
    const result = {
      name: check.name,
      path: check.path,
      authenticated,
      status: null,
      location: null,
      durationMs: Date.now() - started,
      passed: false,
      note: error instanceof Error ? error.message : String(error),
    };
    report.checks.push(result);
    return result;
  }
}

function renderMarkdown() {
  const lines = [
    "# Orbit Founder Acceptance Report",
    "",
    `- Status: **${report.status}**`,
    `- Mode: \`${report.mode}\``,
    `- Target: \`${report.target.baseUrl ?? "not provided"}\``,
    `- Target class: \`${report.target.targetClass ?? "not provided"}\``,
    `- Expected SHA: \`${report.target.expectedSha ?? "not provided"}\``,
    `- Independently verified deployment SHA: \`${report.target.verifiedDeploymentSha ?? "not provided"}\``,
    `- Started: ${report.startedAt}`,
    `- Completed: ${report.completedAt}`,
    "",
    "## Checks",
    "",
    "| Check | Route | Auth | Result | HTTP | Note |",
    "| --- | --- | --- | --- | ---: | --- |",
  ];

  for (const check of report.checks) {
    lines.push(
      `| ${check.name} | \`${check.path}\` | ${check.authenticated ? "yes" : "no"} | ${check.passed ? "PASS" : "FAIL"} | ${check.status ?? "-"} | ${(check.note ?? "").replaceAll("|", "\\|")} |`,
    );
  }

  lines.push("", "## Blockers", "");
  if (report.blockers.length === 0) lines.push("- None recorded.");
  for (const blocker of report.blockers) lines.push(`- **${blocker.code}:** ${blocker.message}`);
  lines.push("", "## Next deterministic action", "", report.nextAction ?? "None.", "");
  return lines.join("\n");
}

async function persistReport() {
  report.completedAt = new Date().toISOString();
  await mkdir(outputDir, { recursive: true });
  await writeFile(`${outputDir}/report.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(`${outputDir}/report.md`, renderMarkdown(), "utf8");
}

const parsedBase = assertSafeTarget();

if (parsedBase && report.blockers.length === 0) {
  for (const check of publicChecks) await runCheck(parsedBase, check, false);

  const failedPublic = report.checks.some((check) => !check.passed);
  if (failedPublic) {
    addBlocker("PUBLIC_PREFLIGHT_FAILED", "At least one public/health preflight check failed. Do not spend authenticated acceptance capacity yet.");
  }

  if (!sessionCookie) {
    addBlocker(
      "NONPROD_SESSION_MISSING",
      "Public preflight can run, but authenticated acceptance requires ORBIT_ACCEPTANCE_SESSION_COOKIE from an isolated non-production session. Never provide a production session.",
    );
  } else if (!failedPublic) {
    for (const check of protectedChecks) await runCheck(parsedBase, check, true);
    if (report.checks.some((check) => check.authenticated && !check.passed)) {
      addBlocker("AUTHENTICATED_JOURNEY_FAILED", "One or more protected Orbit surfaces failed authenticated acceptance.");
    }
  }
}

if (report.blockers.length === 0) {
  report.status = "passed";
  report.nextAction = "Run independent browser QA/release verification against the same Preview deployment; do not infer production readiness from this report alone.";
} else {
  report.status = report.checks.some((check) => !check.passed) ? "failed" : "blocked";
  report.nextAction = report.blockers[0]?.message ?? "Resolve the first recorded blocker, then rerun from the same checkpoint.";
}

await persistReport();
console.log(renderMarkdown());
process.exitCode = report.status === "passed" ? 0 : 2;
