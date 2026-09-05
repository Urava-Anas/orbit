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

test("Instagram copy and generated visual must both be reviewable before approval", async () => {
  const [actions, today, publishGuard, atomicEdit] = await Promise.all([
    read("src/app/(app)/dashboard/content/actions.ts"),
    read("src/app/(app)/dashboard/content/page.tsx"),
    read("supabase/migrations/20260824012000_content_engine_publish_guardrails.sql"),
    read("supabase/migrations/20260824015000_content_engine_atomic_review_edit.sql"),
  ]);

  assert.match(actions, /readyGeneratedImageIds/);
  assert.match(actions, /approval is locked until its generated visual is ready/);
  assert.match(actions, /promoteApprovedAssetForPublishing/);
  assert.match(actions, /edit_content_review_item/);
  assert.match(atomicEdit, /update public\.content_assets as a/);
  assert.match(atomicEdit, /a\.status in \('pending', 'generating', 'ready'\)/);
  assert.match(atomicEdit, /update public\.content_publications as p/);
  assert.match(today, /\/api\/content-assets\/\$\{asset\.id\}/);
  assert.match(today, /Review every visual|Visual ready for review|generated visual/i);
  assert.match(publishGuard, /Instagram requires an approved public image/);
});

test("automatic Meta delivery remains isolated to verified Instagram and Facebook rails", async () => {
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

test("LinkedIn member publishing is verified, text-format faithful and isolated from TikTok", async () => {
  const [start, callback, publisher, worker, migration] = await Promise.all([
    read("src/app/api/integrations/oauth/[provider]/start/route.ts"),
    read("src/app/api/integrations/oauth/[provider]/callback/route.ts"),
    read("src/lib/content-engine-linkedin.ts"),
    read("src/app/api/internal/content-engine-linkedin-worker/route.ts"),
    read("supabase/migrations/20260824017000_content_engine_connection_and_linkedin_rails.sql"),
  ]);

  assert.match(start, /openid profile email w_member_social/);
  assert.match(callback, /linkedin\.publish\.member/);
  assert.match(callback, /kind:\s*"linkedin_member"/);
  assert.match(publisher, /https:\/\/api\.linkedin\.com\/rest\/posts/);
  assert.match(publisher, /X-Restli-Protocol-Version/);
  assert.match(publisher, /x-restli-id/);
  assert.match(publisher, /LinkedIn automatic delivery currently supports text posts only/);
  assert.match(worker, /claim_content_linkedin_publications/);
  assert.match(worker, /CONTENT_PUBLISHING_ENABLED/);
  assert.match(worker, /linkedinConnectionReady/);
  assert.match(worker, /linkedinTextFormat/);
  assert.match(migration, /connection\.provider = 'linkedin'/);
  assert.match(migration, /linkedin\.publish\.member/);
  assert.match(migration, /lower\(trim\(draft\.format\)\) in \('post', 'text', 'text post'\)/);
  assert.doesNotMatch(worker, /publishTikTokJob/);
});

test("OAuth ledger accepts content providers while TikTok automatic publishing remains fail closed", async () => {
  const [integration, start, callback, migration] = await Promise.all([
    read("src/lib/integration-connections.ts"),
    read("src/app/api/integrations/oauth/[provider]/start/route.ts"),
    read("src/app/api/integrations/oauth/[provider]/callback/route.ts"),
    read("supabase/migrations/20260824017000_content_engine_connection_and_linkedin_rails.sql"),
  ]);

  assert.match(integration, /\| "tiktok"/);
  assert.match(integration, /TIKTOK_CLIENT_KEY/);
  assert.match(start, /user\.info\.basic,video\.publish,video\.upload/);
  assert.match(callback, /open\.tiktokapis\.com\/v2\/oauth\/token/);
  assert.match(callback, /tiktok\.publish/);
  assert.match(callback, /tiktok\.upload/);
  assert.match(migration, /'google_search_console'/);
  assert.match(migration, /'google_analytics'/);
  assert.match(migration, /'meta'/);
  assert.match(migration, /'linkedin'/);
  assert.match(migration, /'tiktok'/);
  assert.match(migration, /TikTok automatic publishing is gated/);
  assert.doesNotMatch(migration, /claim_content_tiktok_publications/);
});

test("Google measurement sources feed privacy-filtered aggregate learning through a read-only worker identity", async () => {
  const [signals, worker, migration] = await Promise.all([
    read("src/lib/content-engine-google-signals.ts"),
    read("src/app/api/internal/content-engine-source-signals/route.ts"),
    read("supabase/migrations/20260824017500_content_engine_google_signal_sources.sql"),
  ]);

  assert.match(signals, /webmasters\/v3\/sites/);
  assert.match(signals, /analyticsdata\.googleapis\.com\/v1beta\/properties/);
  assert.match(signals, /aggregate_only:\s*true/);
  assert.match(signals, /grant_type:\s*"refresh_token"/);
  assert.match(signals, /signalType:\s*"search"/);
  assert.match(signals, /signalType:\s*"traffic"/);
  assert.match(signals, /function safeSearchPhrase/);
  assert.match(signals, /function safePagePath/);
  assert.match(signals, /impressions < 5/);
  assert.match(signals, /EMAILISH/);
  assert.match(signals, /LONG_DIGIT_RUN/);
  assert.match(signals, /privacy_filter:\s*"minimum_5_impressions_no_email_or_long_digit_identifiers"/);
  assert.match(signals, /privacy_filter:\s*"path_only_no_query_string_no_email_or_long_digit_identifiers"/);
  assert.match(worker, /source_signals/);
  assert.match(worker, /read_only_intelligence/);
  assert.match(migration, /orbit_content_engine_signal_worker_secret/);
  assert.match(migration, /'search'/);
  assert.match(migration, /'traffic'/);
  assert.doesNotMatch(worker, /claim_content_publications|publishInstagramJob|publishFacebookJob|publishLinkedInJob/);
});

test("unsupported provider metrics are skipped rather than fabricated", async () => {
  const metrics = await read("src/app/api/internal/content-engine-metrics/route.ts");
  assert.match(metrics, /draft\?\.channel !== "instagram"/);
  assert.match(metrics, /No verified insights adapter exists for this channel yet/);
  assert.match(metrics, /captureInstagramMediaInsights/);
});

test("provider-confirmed evidence cannot be manufactured by authenticated workspace admins", async () => {
  const [provenance, impact] = await Promise.all([
    read("supabase/migrations/20260824016500_content_engine_provider_provenance.sql"),
    read("src/app/(app)/dashboard/content/impact/page.tsx"),
  ]);

  assert.match(provenance, /Only the publishing worker may confirm provider delivery/);
  assert.match(provenance, /revoke insert, update, delete, truncate on table public\.content_metric_snapshots from anon, authenticated/);
  assert.match(provenance, /publication_published/);
  assert.match(impact, /latestMetricByContent/);
  assert.match(impact, /provider-confirmed|Provider-confirmed/i);
});

test("learning ranks observed period movement instead of cumulative lifetime counters", async () => {
  const learning = await read("src/lib/content-engine-learning.ts");

  assert.match(learning, /function metricDelta/);
  assert.match(learning, /publishedWithinWindow/);
  assert.match(learning, /if \(!publishedWithinWindow && group\.length < 2\) continue/);
  assert.match(learning, /const baseline = publishedWithinWindow \? null : group\[0\]/);
  assert.match(learning, /observed_7_day_metric_delta/);
  assert.doesNotMatch(learning, /snapshot_policy:\s*"latest_per_content"/);
});
