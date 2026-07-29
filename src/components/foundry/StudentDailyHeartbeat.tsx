"use client";

import { useEffect } from "react";

type DailyCheckpoint =
  | "portal_opened"
  | "task_opened"
  | "feedback_viewed";

export function StudentDailyHeartbeat({
  checkpoints,
}: {
  checkpoints: DailyCheckpoint[];
}) {
  const checkpointKey = checkpoints.join(",");

  useEffect(() => {
    if (!checkpointKey) return;
    const controller = new AbortController();
    void fetch("/api/foundry/daily-check", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkpoints: checkpointKey.split(",") }),
      cache: "no-store",
      keepalive: true,
      signal: controller.signal,
    }).catch(() => {
      // This telemetry is deliberately non-blocking for the student.
    });
    return () => controller.abort();
  }, [checkpointKey]);

  return null;
}
