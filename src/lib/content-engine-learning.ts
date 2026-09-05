import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { localDate } from "@/lib/content-engine";

type MetricRow = {
  content_id: string;
  captured_at: string;
  reach: number | string;
  engagements: number | string;
  clicks: number | string;
  leads: number | string;
};

type DraftRow = {
  id: string;
  channel: string;
  goal: string;
  format: string;
};

type PublicationRow = {
  content_id: string;
  published_at: string | null;
};

type Aggregate = {
  items: Set<string>;
  reach: number;
  engagements: number;
  clicks: number;
  leads: number;
};

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function metricDelta(latest: MetricRow, baseline: MetricRow | null): MetricRow {
  return {
    content_id: latest.content_id,
    captured_at: latest.captured_at,
    reach: Math.max(0, numeric(latest.reach) - numeric(baseline?.reach)),
    engagements: Math.max(0, numeric(latest.engagements) - numeric(baseline?.engagements)),
    clicks: Math.max(0, numeric(latest.clicks) - numeric(baseline?.clicks)),
    leads: Math.max(0, numeric(latest.leads) - numeric(baseline?.leads)),
  };
}

function hasObservedMovement(metric: MetricRow) {
  return numeric(metric.reach) + numeric(metric.engagements) + numeric(metric.clicks) + numeric(metric.leads) > 0;
}

function addMetric(target: Aggregate, contentId: string, metric: MetricRow) {
  target.items.add(contentId);
  target.reach += numeric(metric.reach);
  target.engagements += numeric(metric.engagements);
  target.clicks += numeric(metric.clicks);
  target.leads += numeric(metric.leads);
}

function score(value: Aggregate) {
  return value.leads * 25 + value.clicks * 4 + value.engagements + value.reach * 0.015;
}

function confidence(value: Aggregate) {
  const sample = Math.min(value.items.size, 8) / 8;
  const activity = Math.min(1, (value.engagements + value.clicks * 2 + value.leads * 8) / 80);
  return Math.max(0.35, Math.min(0.92, 0.35 + sample * 0.35 + activity * 0.22));
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function deriveContentLearnings({
  supabase,
  workspaceId,
  timezone,
  now = new Date(),
}: {
  supabase: SupabaseClient;
  workspaceId: string;
  timezone: string;
  now?: Date;
}) {
  const learnedOn = localDate(timezone, now);
  const { data: existing } = await supabase
    .from("content_learning_notes")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("learned_on", learnedOn)
    .in("signal_type", ["performance", "topic"])
    .limit(1);
  if (existing?.length) return { status: "existing" as const, inserted: 0 };

  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: metricRows, error: metricError } = await supabase
    .from("content_metric_snapshots")
    .select("content_id,captured_at,reach,engagements,clicks,leads")
    .eq("workspace_id", workspaceId)
    .gte("captured_at", since)
    .order("captured_at", { ascending: true });
  if (metricError) throw new Error("Content performance could not be loaded for learning.");

  const snapshots = (metricRows ?? []) as MetricRow[];
  if (!snapshots.length) return { status: "no_data" as const, inserted: 0 };

  const snapshotsByContent = new Map<string, MetricRow[]>();
  for (const snapshot of snapshots) {
    const group = snapshotsByContent.get(snapshot.content_id) ?? [];
    group.push(snapshot);
    snapshotsByContent.set(snapshot.content_id, group);
  }
  const contentIds = [...snapshotsByContent.keys()];

  const [draftResult, publicationResult] = await Promise.all([
    supabase
      .from("content_drafts")
      .select("id,channel,goal,format")
      .eq("workspace_id", workspaceId)
      .in("id", contentIds),
    supabase
      .from("content_publications")
      .select("content_id,published_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "published")
      .in("content_id", contentIds),
  ]);
  if (draftResult.error) throw new Error("Content metadata could not be loaded for learning.");
  if (publicationResult.error) throw new Error("Content publication timing could not be loaded for learning.");

  const drafts = (draftResult.data ?? []) as DraftRow[];
  const publications = (publicationResult.data ?? []) as PublicationRow[];
  const draftById = new Map(drafts.map((item) => [item.id, item]));
  const publishedAtByContent = new Map(publications.map((item) => [item.content_id, item.published_at]));

  const periodMetrics: MetricRow[] = [];
  for (const [contentId, group] of snapshotsByContent) {
    const latest = group[group.length - 1];
    const publishedAt = publishedAtByContent.get(contentId);
    const publishedWithinWindow = Boolean(publishedAt && publishedAt >= since);

    // For a post published during the window, its lifetime counter is also its in-window counter.
    // For older posts, require at least two observations and learn only from movement between them.
    if (!publishedWithinWindow && group.length < 2) continue;
    const baseline = publishedWithinWindow ? null : group[0];
    const delta = metricDelta(latest, baseline);
    if (hasObservedMovement(delta)) periodMetrics.push(delta);
  }

  if (!periodMetrics.length) return { status: "no_data" as const, inserted: 0 };

  const byChannel = new Map<string, Aggregate>();
  const byGoal = new Map<string, Aggregate>();

  for (const metric of periodMetrics) {
    const draft = draftById.get(metric.content_id);
    if (!draft) continue;
    const channel = byChannel.get(draft.channel) ?? { items: new Set<string>(), reach: 0, engagements: 0, clicks: 0, leads: 0 };
    const goal = byGoal.get(draft.goal) ?? { items: new Set<string>(), reach: 0, engagements: 0, clicks: 0, leads: 0 };
    addMetric(channel, metric.content_id, metric);
    addMetric(goal, metric.content_id, metric);
    byChannel.set(draft.channel, channel);
    byGoal.set(draft.goal, goal);
  }

  const topChannel = [...byChannel.entries()].sort((a, b) => score(b[1]) - score(a[1]))[0];
  const topGoal = [...byGoal.entries()].sort((a, b) => score(b[1]) - score(a[1]))[0];
  const notes: Array<Record<string, unknown>> = [];

  if (topChannel) {
    const [channel, value] = topChannel;
    notes.push({
      workspace_id: workspaceId,
      learned_on: learnedOn,
      signal_type: "performance",
      insight: `${humanize(channel)} produced the strongest observed weighted gain over the last 7 days across ${value.items.size} measured content item${value.items.size === 1 ? "" : "s"}.`,
      action: `Keep ${humanize(channel)} in tomorrow's mix and test one variation of the strongest concept instead of simply increasing volume.`,
      confidence: confidence(value),
      source_metrics: {
        window_days: 7,
        snapshot_policy: "observed_delta; zero baseline only for posts published inside window",
        dimension: "channel",
        value: channel,
        measured_items: value.items.size,
        reach_gain: value.reach,
        engagement_gain: value.engagements,
        click_gain: value.clicks,
        lead_gain: value.leads,
        weighted_score: score(value),
      },
      created_by: null,
    });
  }

  if (topGoal) {
    const [goal, value] = topGoal;
    notes.push({
      workspace_id: workspaceId,
      learned_on: learnedOn,
      signal_type: "topic",
      insight: `${humanize(goal)} content produced the strongest observed objective-level gain over the last 7 days.`,
      action: `Give ${humanize(goal)} one deliberate slot in the next daily strategy while preserving a balanced mix of other objectives.`,
      confidence: confidence(value),
      source_metrics: {
        window_days: 7,
        snapshot_policy: "observed_delta; zero baseline only for posts published inside window",
        dimension: "goal",
        value: goal,
        measured_items: value.items.size,
        reach_gain: value.reach,
        engagement_gain: value.engagements,
        click_gain: value.clicks,
        lead_gain: value.leads,
        weighted_score: score(value),
      },
      created_by: null,
    });
  }

  if (!notes.length) return { status: "no_data" as const, inserted: 0 };
  const { data: inserted, error: insertError } = await supabase.from("content_learning_notes").insert(notes).select("id");
  if (insertError) throw new Error("Content learning notes could not be saved.");

  const { error: auditError } = await supabase.from("content_review_events").insert(
    (inserted ?? []).map((note) => ({
      workspace_id: workspaceId,
      batch_id: null,
      content_id: null,
      event_type: "learning_recorded",
      actor_id: null,
      details: { learning_note_id: note.id, learned_on: learnedOn, source: "observed_7_day_metric_delta" },
    })),
  );
  if (auditError) console.error("Content learning was saved but its audit event could not be appended", auditError);

  return { status: "inserted" as const, inserted: inserted?.length ?? 0 };
}
