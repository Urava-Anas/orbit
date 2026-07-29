"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const founderTables = [
  "foundry_students",
  "foundry_classes",
  "foundry_attendance",
  "foundry_tasks",
  "foundry_task_assignments",
  "foundry_submissions",
  "foundry_progress_events",
  "foundry_skill_scores",
  "foundry_notifications",
] as const;

const studentTables = [
  "foundry_students",
  "foundry_classes",
  "foundry_attendance",
  "foundry_task_assignments",
  "foundry_submissions",
  "foundry_progress_events",
  "foundry_skill_scores",
  "foundry_notifications",
] as const;

export function FoundryRealtime({
  role,
  workspaceId,
}: {
  role: "founder" | "student";
  workspaceId: string;
}) {
  const router = useRouter();
  const refreshTimer = useRef<number | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const tables = role === "founder" ? founderTables : studentTables;
    const channel = supabase.channel(`foundry-${role}-${workspaceId}`);

    const refresh = () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        router.refresh();
      }, 250);
    };

    for (const table of tables) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `workspace_id=eq.${workspaceId}`,
        },
        refresh,
      );
    }

    channel.subscribe((status) => {
      setConnected(status === "SUBSCRIBED");
    });

    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [role, router, workspaceId]);

  return (
    <span
      aria-live="polite"
      className={role === "founder" ? "foundry-live-pill" : "student-live-pill"}
      title="Foundry data updates without a page reload"
    >
      <i aria-hidden="true" className={connected ? "" : "is-connecting"} />
      {connected ? "Live sync" : "Connecting…"}
    </span>
  );
}
