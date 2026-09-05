import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const auditorPath = path.resolve("scripts/rc-convergence-auditor.mjs");

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function write(cwd, relativePath, content) {
  const target = path.join(cwd, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function commitAll(cwd, message) {
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "-m", message]);
  return git(cwd, ["rev-parse", "HEAD"]);
}

function runAuditor(cwd, { base, rc, candidate }) {
  const stdout = execFileSync(process.execPath, [auditorPath, "--base", base, "--rc", rc, "--candidate", candidate], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(stdout);
}

function makeRepo() {
  const cwd = mkdtempSync(path.join(tmpdir(), "orbit-convergence-"));
  git(cwd, ["init", "-b", "main"]);
  git(cwd, ["config", "user.email", "ci@orbit.test"]);
  git(cwd, ["config", "user.name", "Orbit CI"]);
  write(cwd, "shared.txt", "base\n");
  write(cwd, "base-only.txt", "base\n");
  const base = commitAll(cwd, "base");
  return { cwd, base };
}

test("classifies shared files, duplicate migration history and merge conflicts without mutating the worktree", () => {
  const { cwd, base } = makeRepo();

  git(cwd, ["checkout", "-b", "rc"]);
  write(cwd, "shared.txt", "rc\n");
  write(cwd, "rc-only.txt", "rc\n");
  write(cwd, "supabase/migrations/20260101000000_existing.sql", "select 1;\n");
  commitAll(cwd, "rc work");

  git(cwd, ["checkout", "-b", "candidate", base]);
  write(cwd, "shared.txt", "candidate\n");
  write(cwd, "candidate-only.txt", "candidate\n");
  write(cwd, "supabase/migrations/20260102000000_candidate.sql", "select 1;\n");
  commitAll(cwd, "candidate work");

  const before = git(cwd, ["status", "--porcelain"]);
  const report = runAuditor(cwd, { base, rc: "rc", candidate: "candidate" });
  const after = git(cwd, ["status", "--porcelain"]);

  assert.equal(before, "");
  assert.equal(after, "");
  assert.equal(report.forkPoint, base);
  assert.equal(report.baseAncestorOfRc, true);
  assert.ok(report.candidateOnlyFiles.includes("candidate-only.txt"));
  assert.ok(report.candidateMigrations.includes("supabase/migrations/20260102000000_candidate.sql"));
  assert.ok(report.sharedFiles.some((item) => item.path === "shared.txt"));
  assert.ok(report.mergeConflicts.includes("shared.txt"));
  assert.equal(report.duplicateMigrationBlobs.length, 1);
  assert.equal(report.duplicateMigrationBlobs[0].candidatePath, "supabase/migrations/20260102000000_candidate.sql");
  assert.deepEqual(report.duplicateMigrationBlobs[0].rcPaths, ["supabase/migrations/20260101000000_existing.sql"]);
  assert.equal(report.mergeTreeClean, false);
  assert.equal(report.recommendation, "reconcile-conflicts");
  assert.equal(report.risk, "high");
});

test("identifies a clean additive candidate without manufacturing conflicts", () => {
  const { cwd, base } = makeRepo();

  git(cwd, ["checkout", "-b", "rc"]);
  write(cwd, "rc-only.txt", "rc\n");
  commitAll(cwd, "rc work");

  git(cwd, ["checkout", "-b", "candidate-clean", base]);
  write(cwd, "candidate-only.txt", "candidate\n");
  commitAll(cwd, "candidate work");

  const report = runAuditor(cwd, { base, rc: "rc", candidate: "candidate-clean" });

  assert.equal(report.sharedFiles.length, 0);
  assert.equal(report.mergeConflicts.length, 0);
  assert.equal(report.duplicateMigrationBlobs.length, 0);
  assert.equal(report.mergeTreeClean, true);
  assert.equal(report.recommendation, "clean-overlay-candidate");
  assert.ok(report.candidateOnlyFiles.includes("candidate-only.txt"));
});

test("recommends removing duplicate migration files even when file paths do not overlap", () => {
  const { cwd, base } = makeRepo();

  git(cwd, ["checkout", "-b", "rc"]);
  write(cwd, "supabase/migrations/20260101000000_existing.sql", "select 42;\n");
  commitAll(cwd, "existing migration");

  git(cwd, ["checkout", "-b", "candidate-duplicate", base]);
  write(cwd, "supabase/migrations/20260102000000_renumbered.sql", "select 42;\n");
  commitAll(cwd, "renumbered migration");

  const report = runAuditor(cwd, { base, rc: "rc", candidate: "candidate-duplicate" });

  assert.equal(report.sharedFiles.length, 0);
  assert.equal(report.mergeConflicts.length, 0);
  assert.equal(report.duplicateMigrationBlobs.length, 1);
  assert.equal(report.recommendation, "drop-duplicate-migration-files-and-review-shared");
  assert.equal(report.risk, "high");
});
