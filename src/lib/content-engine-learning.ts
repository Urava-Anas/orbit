import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { localDate } from "@/lib/content-engine";

type MetricRow = {
  content_id: string;
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

type Aggregate = {
  items: Set<string>;
  reach: number;
  engagements: number;
  clicks: number;
  leads: number;
};

function numeric(value: number | string | null | undefined) {
  return Number(value || 0);
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
    .in("signal_type", ["performance", "timing"])
    .limit(1);
  if (existing?.length) return { status: "existing" as const, inserted: 0 };

  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: metricRows, error: metricError } = await supabase
    .from("content_metric_snapshots")
    .select("content_id,reach,engagements,clicks,leads")
    .eq("workspace_id", workspaceId)
    .gte("captured_at", since);
  if (metricError) throw new Error("Content performance could not be loaded for learning.");

  const metrics = (metricRows ?? []) as MetricRow[];
  if (!metrics.length) return { status: "no_data" as const, inserted: 0 };

  const contentIds = [...new Set(metrics.map((item) => item.content_id))];
  const { data: draftRows, error: draftError } = await supabase
    .from("content_drafts")
    .select("id,channel,goal,format")
    .eq("workspace_id", workspaceId)
    .in("id", contentIds);
  if (draftError) throw new Error("Content metadata could not be loaded for learning.");

  const drafts = (draftRows ?? []) as DraftRow[];
  const draftById = new Map(drafts.map((item) => [item.id, item]));
  const byChannel = new Map<string, Aggregate>();
  const byGoal = new Map<string, Aggregate>();

  for (const metric of metrics) {
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
      insight: `${humanize(channel)} produced the strongest weighted response over the last 7 days across ${value.items.size} measured content item${value.items.size === 1 ? "" : "s"}.`,
      action: `Keep ${humanize(channel)} in tomorrow's mix and test one variation of the strongest concept instead of simply increasing volume.`,
      confidence: confidence(value),
      source_metrics: {
        window_days: 7,
        dimension: "channel",
        value: channel,
        measured_items: value.items.size,
        reach: value.reach,
        engagements: value.engagements,
        clicks: value.clicks,
        leads: value.leads,
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
      signal_type: "timing",
      insight: `${humanize(goal)} content is currently the strongest objective by measured response over the last 7 days.`,
      action: `Give ${humanize(goal)} one deliberate slot in the next daily strategy while preserving a balanced mix of other objectives.`,
      confidence: confidence(value),
      source_metrics: {
        window_days: 7,
        dimension: "goal",
        value: goal,
        measured_items: value.items.size,
        reach: value.reach,
        engagements: value.engagements,
        clicks: value.clicks,
        leads: value.leads,
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
      details: { learning_note_id: note.id, learned_on: learnedOn, source: "7_day_metric_rollup" },
    })),
  );
  if (auditError) console.error("Content learning was saved but its audit event could not be appended", auditError);

  return { status: "inserted" as const, inserted: inserted?.length ?? 0 };
}
