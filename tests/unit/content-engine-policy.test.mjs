import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Content Engine keeps founder approval and two independent publishing kill switches", async () => {
  const [actions, worker, migration] = await Promise.all([
    read("src/app/(app)/dashboard/content/actions.ts"),
    read("src/app/api/internal/content-engine-worker/route.ts"),
    read("supabase/migrations/20260824012000_content_engine_publish_guardrails.sql"),
  ]);

  assert.match(actions, /approval_required:\s*true/);
  assert.match(actions, /CONTENT_PUBLISHING_ENABLED/);
  assert.match(actions, /publishing_enabled/);
  assert.match(worker, /CONTENT_PUBLISHING_ENABLED/);
  assert.match(worker, /publishing_enabled/);
  assert.match(migration, /draft_status <> 'approved'/);
  assert.match(migration, /profile\.publishing_enabled = true/);
});

test("automatic Meta delivery is limited to verified Instagram and Facebook rails", async () => {
  const [actions, worker, migration, oauth] = await Promise.all([
    read("src/app/(app)/dashboard/content/actions.ts"),
    read("src/app/api/internal/content-engine-worker/route.ts"),
    read("supabase/migrations/20260824012000_content_engine_publish_guardrails.sql"),
    read("src/app/api/integrations/oauth/[provider]/start/route.ts"),
  ]);

  assert.match(actions, /channel === "instagram" \|\| channel === "facebook"/);
  assert.match(actions, /instagram\.publish/);
  assert.match(actions, /facebook\.publish/);
  assert.match(worker, /publishInstagramJob/);
  assert.match(worker, /publishFacebookJob/);
  assert.match(migration, /draft\.channel in \('instagram', 'facebook'\)/);
  assert.match(oauth, /pages_manage_posts/);
  assert.match(oauth, /instagram_content_publish/);
  assert.doesNotMatch(worker, /publishLinkedInJob|publishTikTokJob/);
});

test("unsupported provider metrics are skipped rather than fabricated", async () => {
  const metrics = await read("src/app/api/internal/content-engine-metrics/route.ts");
  assert.match(metrics, /draft\?\.channel !== "instagram"/);
  assert.match(metrics, /No verified insights adapter exists for this channel yet/);
  assert.match(metrics, /captureInstagramMediaInsights/);
});
