import "server-only";

export type ContentQualityItem = {
  channel: string;
  format: string;
  title: string;
  hook?: string;
  body: string;
  cta: string;
  media_brief: string;
  scheduled_time: string;
  proof_index: number | null;
};

export type ContentQualityReport = {
  passed: true;
  checks: string[];
};

function normalized(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSimilarity(left: string, right: string) {
  const a = new Set(normalized(left).split(" ").filter((token) => token.length > 2));
  const b = new Set(normalized(right).split(" ").filter((token) => token.length > 2));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

export function validateGeneratedContentBatch({
  items,
  targetCount,
  proofCount,
}: {
  items: ContentQualityItem[];
  targetCount: number;
  proofCount: number;
}): ContentQualityReport {
  const issues: string[] = [];

  if (items.length !== targetCount) {
    issues.push(`Expected ${targetCount} content items but received ${items.length}.`);
  }

  const scheduleTimes = items.map((item) => item.scheduled_time);
  if (new Set(scheduleTimes).size !== scheduleTimes.length) {
    issues.push("Two or more content items share the same scheduled time.");
  }

  const bodies = items.map((item) => normalized(item.body));
  if (new Set(bodies).size !== bodies.length) issues.push("The batch contains duplicated post copy.");

  const titles = items.map((item) => normalized(item.title));
  if (new Set(titles).size !== titles.length) issues.push("The batch contains duplicated content titles.");

  const hooks = items.map((item) => normalized(item.hook ?? "")).filter(Boolean);
  if (hooks.length > 1 && new Set(hooks).size !== hooks.length) issues.push("The batch repeats the same hook across multiple pieces.");

  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      if (tokenSimilarity(items[left].body, items[right].body) >= 0.82) {
        issues.push(`Items ${left + 1} and ${right + 1} are too similar to be useful as distinct posts.`);
      }
    }
  }

  const channels = new Set(items.map((item) => item.channel));
  if (targetCount >= 4 && channels.size < 3) issues.push("The batch is too concentrated on too few platforms.");

  const channelCounts = items.reduce<Record<string, number>>((counts, item) => {
    counts[item.channel] = (counts[item.channel] ?? 0) + 1;
    return counts;
  }, {});
  const maxPerChannel = Math.max(2, Math.ceil(targetCount * 0.6));
  if (Object.values(channelCounts).some((count) => count > maxPerChannel)) {
    issues.push("Too much of the batch is concentrated on one platform.");
  }

  const placeholderPattern = /\b(?:lorem ipsum|tbd|todo|insert (?:name|link|number|metric|client)|your company here)\b/i;

  items.forEach((item, index) => {
    const position = index + 1;
    if (item.proof_index !== null && (item.proof_index < 0 || item.proof_index >= proofCount)) {
      issues.push(`Item ${position} references proof that is not in the approved proof set.`);
    }
    if (proofCount === 0 && item.proof_index !== null) {
      issues.push(`Item ${position} references proof when no approved proof exists.`);
    }
    if (!item.cta.trim()) issues.push(`Item ${position} has no clear call to action.`);
    if ((item.channel === "instagram" || item.channel === "tiktok") && !item.media_brief.trim()) {
      issues.push(`Item ${position} needs a media brief for ${item.channel}.`);
    }
    if (item.channel === "linkedin" && item.format.toLowerCase().includes("carousel")) {
      issues.push(`Item ${position} uses an unsupported organic LinkedIn carousel format.`);
    }
    const hashtags = `${item.body} ${item.cta}`.match(/#[a-z0-9_]+/gi) ?? [];
    if (hashtags.length > 8) issues.push(`Item ${position} uses too many hashtags.`);
    if (placeholderPattern.test(`${item.title} ${item.body} ${item.cta} ${item.media_brief}`)) {
      issues.push(`Item ${position} contains placeholder text.`);
    }
  });

  if (issues.length) {
    throw new Error(`Generated batch failed Orbit quality checks: ${[...new Set(issues)].join(" ")}`);
  }

  return {
    passed: true,
    checks: [
      "exact_batch_size",
      "unique_schedule_times",
      "unique_copy",
      "unique_hooks",
      "near_duplicate_copy",
      "platform_mix",
      "proof_references_valid",
      "clear_cta",
      "required_media_briefs",
      "supported_formats",
      "hashtag_limit",
      "no_placeholders",
    ],
  };
}
