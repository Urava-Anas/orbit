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

function clean(value: FormDataEntryValue | null, max = 200) {
  return String(value ?? "").trim().slice(0, max);
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
