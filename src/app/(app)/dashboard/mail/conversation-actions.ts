"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";

const relayFolders = new Set([
  "inbox",
  "outbox",
  "sent",
  "drafts",
  "archive",
  "spam",
  "trash",
]);

const relayThreadFlags = new Set(["is_starred", "is_unread"]);

function clean(value: FormDataEntryValue | null, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function parseBoolean(value: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

/**
 * Move one Relay thread between folders without deleting messages.
 *
 * Reversibility contract:
 * - the caller must submit the observed current folder as `from_folder`;
 * - the update is guarded by that prior value, so stale UI cannot overwrite a newer move;
 * - rollback is the same action with the folders swapped;
 * - the mutation is scoped to the authenticated workspace + mailbox + thread.
 */
export async function moveRelayThread(formData: FormData) {
  const { supabase, workspace } = await requireWorkspace();
  const mailboxId = clean(formData.get("mailbox_id"), 80);
  const threadId = clean(formData.get("thread_id"), 80);
  const fromFolder = clean(formData.get("from_folder"), 30).toLowerCase();
  const toFolder = clean(formData.get("to_folder"), 30).toLowerCase();

  if (!mailboxId || !threadId || !relayFolders.has(fromFolder) || !relayFolders.has(toFolder)) {
    redirect("/dashboard/mail?error=Relay%20could%20not%20validate%20that%20conversation%20move");
  }

  if (fromFolder === toFolder) {
    redirect(`/dashboard/mail?view=mail&folder=${fromFolder}&mailbox=${mailboxId}`);
  }

  const { data: thread } = await supabase
    .from("orbit_mail_threads")
    .select("id,folder")
    .eq("workspace_id", workspace.id)
    .eq("mailbox_id", mailboxId)
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) {
    redirect(`/dashboard/mail?view=mail&folder=${fromFolder}&mailbox=${mailboxId}&error=Conversation%20not%20found`);
  }

  if (thread.folder !== fromFolder) {
    redirect(`/dashboard/mail?view=mail&folder=${thread.folder}&mailbox=${mailboxId}&error=Conversation%20changed%20since%20this%20view%20loaded.%20Nothing%20was%20overwritten.`);
  }

  const { data: moved, error } = await supabase
    .from("orbit_mail_threads")
    .update({
      folder: toFolder,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspace.id)
    .eq("mailbox_id", mailboxId)
    .eq("id", threadId)
    .eq("folder", fromFolder)
    .select("id,folder")
    .maybeSingle();

  if (error || !moved || moved.folder !== toFolder) {
    redirect(`/dashboard/mail?view=mail&folder=${fromFolder}&mailbox=${mailboxId}&error=Conversation%20move%20was%20not%20verified`);
  }

  revalidatePath("/dashboard/mail");
  redirect(
    `/dashboard/mail?view=mail&folder=${toFolder}&mailbox=${mailboxId}&notice=${encodeURIComponent(
      `Conversation moved from ${fromFolder} to ${toFolder}. Rollback: move it back to ${fromFolder}.`,
    )}`,
  );
}

/**
 * Toggle one reversible Relay thread flag with an optimistic prior-state guard.
 *
 * Reversibility contract:
 * - only is_starred and is_unread are allowed;
 * - the caller submits the observed prior value and requested next value;
 * - the update is scoped to workspace + mailbox + thread + folder + prior flag value;
 * - rollback is the same action with expected/next swapped.
 */
export async function setRelayThreadFlag(formData: FormData) {
  const { supabase, workspace } = await requireWorkspace();
  const mailboxId = clean(formData.get("mailbox_id"), 80);
  const threadId = clean(formData.get("thread_id"), 80);
  const folder = clean(formData.get("folder"), 30).toLowerCase();
  const field = clean(formData.get("field"), 30);
  const expected = parseBoolean(clean(formData.get("expected"), 10).toLowerCase());
  const next = parseBoolean(clean(formData.get("next"), 10).toLowerCase());

  if (
    !mailboxId ||
    !threadId ||
    !relayFolders.has(folder) ||
    !relayThreadFlags.has(field) ||
    expected === null ||
    next === null ||
    expected === next
  ) {
    redirect("/dashboard/mail?error=Relay%20could%20not%20validate%20that%20conversation%20state%20change");
  }

  const { data: thread } = await supabase
    .from("orbit_mail_threads")
    .select("id,folder,is_starred,is_unread")
    .eq("workspace_id", workspace.id)
    .eq("mailbox_id", mailboxId)
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) {
    redirect(`/dashboard/mail?view=mail&folder=${folder}&mailbox=${mailboxId}&error=Conversation%20not%20found`);
  }

  const current = field === "is_starred" ? thread.is_starred : thread.is_unread;
  if (thread.folder !== folder || current !== expected) {
    redirect(
      `/dashboard/mail?view=mail&folder=${thread.folder}&mailbox=${mailboxId}&thread=${threadId}&error=Conversation%20state%20changed%20since%20this%20view%20loaded.%20Nothing%20was%20overwritten.`,
    );
  }

  const { data: updated, error } = await supabase
    .from("orbit_mail_threads")
    .update({
      [field]: next,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspace.id)
    .eq("mailbox_id", mailboxId)
    .eq("id", threadId)
    .eq("folder", folder)
    .eq(field, expected)
    .select("id,folder,is_starred,is_unread")
    .maybeSingle();

  const verified = field === "is_starred" ? updated?.is_starred : updated?.is_unread;
  if (error || !updated || verified !== next) {
    redirect(
      `/dashboard/mail?view=mail&folder=${folder}&mailbox=${mailboxId}&thread=${threadId}&error=Conversation%20state%20change%20was%20not%20verified`,
    );
  }

  const label = field === "is_starred" ? "starred" : next ? "unread" : "read";
  revalidatePath("/dashboard/mail");
  redirect(
    `/dashboard/mail?view=mail&folder=${folder}&mailbox=${mailboxId}&thread=${threadId}&notice=${encodeURIComponent(
      `Conversation marked ${label}. Rollback: restore ${field} to ${expected}.`,
    )}`,
  );
}
