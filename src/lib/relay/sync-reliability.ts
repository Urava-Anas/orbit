import "server-only";

import { createClient } from "@/lib/supabase/server";
import { syncNamecheapMailbox } from "./namecheap-vault";

const STALE_SYNC_MS = 2 * 60 * 1000;
const SYNC_BATCH_SIZE = 10;

export type ReliableRelaySyncResult = {
  imported: number;
  cursor: number;
  possiblyMore: boolean;
  recoveredStaleClaim: boolean;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Relay mailbox sync failed.";
}

function isHardConnectionFailure(message: string) {
  return /credential|authentication|authenticate|password|login|not configured|not available/i.test(message);
}

/**
 * Serialize manual/initial Relay sync attempts around the existing IMAP importer.
 *
 * Reliability contract:
 * - only one fresh sync claim may own a mailbox at a time;
 * - a claim abandoned for more than STALE_SYNC_MS can be recovered using the
 *   observed `updated_at` value as an optimistic checkpoint;
 * - transient transport/storage failures keep the authenticated mailbox
 *   connected but mark it degraded and retryable;
 * - credential/auth failures fail closed and require reconnect;
 * - the importer remains the authority for the durable UID cursor and unique
 *   provider-message dedupe constraint.
 */
export async function syncRelayMailboxReliably(input: {
  workspaceId: string;
  mailboxId: string;
}): Promise<ReliableRelaySyncResult> {
  const supabase = await createClient();
  const observedAt = Date.now();

  const { data: observed, error: observeError } = await supabase
    .from("orbit_mailboxes")
    .select("id,status,connection_health,updated_at")
    .eq("workspace_id", input.workspaceId)
    .eq("id", input.mailboxId)
    .maybeSingle();

  if (observeError || !observed) {
    throw new Error("Relay mailbox was not found in this workspace.");
  }

  if (observed.status === "disconnected" || observed.status === "error") {
    throw new Error("Relay mailbox must be reconnected before it can sync.");
  }

  const observedUpdatedAt = new Date(observed.updated_at).getTime();
  const staleSync =
    observed.status === "syncing" &&
    Number.isFinite(observedUpdatedAt) &&
    observedAt - observedUpdatedAt >= STALE_SYNC_MS;

  if (observed.status === "syncing" && !staleSync) {
    throw new Error("Relay sync is already running for this mailbox. No duplicate sync was started.");
  }

  if (observed.status !== "connected" && !staleSync) {
    throw new Error("Relay mailbox is not ready to sync.");
  }

  const claimAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("orbit_mailboxes")
    .update({
      status: "syncing",
      connection_health: observed.connection_health === "failed" ? "degraded" : observed.connection_health,
      updated_at: claimAt,
    })
    .eq("workspace_id", input.workspaceId)
    .eq("id", input.mailboxId)
    .eq("status", observed.status)
    .eq("updated_at", observed.updated_at)
    .select("id,status,updated_at")
    .maybeSingle();

  if (claimError || !claimed || claimed.status !== "syncing") {
    throw new Error("Relay mailbox state changed before sync could start. No duplicate sync was started.");
  }

  try {
    const result = await syncNamecheapMailbox(input);
    return {
      imported: result.imported,
      cursor: result.cursor,
      possiblyMore: result.imported >= SYNC_BATCH_SIZE,
      recoveredStaleClaim: staleSync,
    };
  } catch (error) {
    const message = errorMessage(error).slice(0, 1000);
    const hardFailure = isHardConnectionFailure(message);
    const recoveryState: Record<string, unknown> = {
      status: hardFailure ? "error" : "connected",
      connection_health: hardFailure ? "failed" : "degraded",
      last_error: message,
      updated_at: new Date().toISOString(),
    };
    if (hardFailure) {
      recoveryState.inbound_enabled = false;
      recoveryState.outbound_enabled = false;
    }

    await supabase
      .from("orbit_mailboxes")
      .update(recoveryState)
      .eq("workspace_id", input.workspaceId)
      .eq("id", input.mailboxId)
      .eq("status", "syncing");

    throw new Error(
      hardFailure
        ? `${message} Reconnect this mailbox before retrying.`
        : `${message} Relay kept the last verified sync checkpoint; retry will resume safely.`,
    );
  }
}
