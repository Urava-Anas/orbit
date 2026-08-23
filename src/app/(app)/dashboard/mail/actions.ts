"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWorkspace } from "@/lib/workspace";
import {
  removeMailboxCredential,
  storeMailboxCredential,
  syncNamecheapMailbox,
  testNamecheapMailbox,
} from "@/lib/relay/namecheap";

function clean(value: FormDataEntryValue | null, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

function emailList(value: string) {
  return value
    .split(/[;,]/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
}

function requireMailboxAdmin(role: string | null | undefined) {
  if (!role || !["owner", "admin", "founder"].includes(role)) {
    redirect("/dashboard/mail?error=Workspace%20admin%20access%20is%20required");
  }
}

async function mailboxForWorkspace(
  supabase: Awaited<ReturnType<typeof requireWorkspace>>["supabase"],
  workspaceId: string,
  mailboxId: string,
) {
  if (!mailboxId) return null;
  const { data } = await supabase
    .from("orbit_mailboxes")
    .select("id,address,status,outbound_enabled,inbound_enabled")
    .eq("workspace_id", workspaceId)
    .eq("id", mailboxId)
    .maybeSingle();
  return data ?? null;
}

export async function connectNamecheapMailbox(formData: FormData) {
  const { supabase, workspace, role } = await requireWorkspace();
  requireMailboxAdmin(role);

  const email = clean(formData.get("email"), 320).toLowerCase();
  const displayName = clean(formData.get("display_name"), 120);
  const password = clean(formData.get("password"), 500);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
    redirect("/dashboard/mail?view=connectors&connect=1&error=Enter%20a%20valid%20mailbox%20and%20password");
  }

  const test = await testNamecheapMailbox(email, password);
  if (!test.ok) {
    redirect(`/dashboard/mail?view=connectors&connect=1&error=${encodeURIComponent(test.error ?? "Namecheap authentication failed")}`);
  }

  const { data: existing } = await supabase
    .from("orbit_mailboxes")
    .select("id,is_primary")
    .eq("workspace_id", workspace.id)
    .eq("address", email)
    .maybeSingle();

  let mailboxId = existing?.id ?? null;
  if (!mailboxId) {
    const { count } = await supabase
      .from("orbit_mailboxes")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id);
    const { data: created, error } = await supabase
      .from("orbit_mailboxes")
      .insert({
        workspace_id: workspace.id,
        address: email,
        display_name: displayName || email.split("@")[0],
        provider: "namecheap_private_email",
        status: "connected",
        inbound_enabled: true,
        outbound_enabled: true,
        connection_health: "healthy",
        last_connection_test_at: new Date().toISOString(),
        last_error: null,
        is_primary: (count ?? 0) === 0,
      })
      .select("id")
      .single();
    if (error || !created) {
      redirect("/dashboard/mail?view=connectors&error=Relay%20could%20not%20create%20the%20mailbox");
    }
    mailboxId = created.id;
  } else {
    const { error } = await supabase
      .from("orbit_mailboxes")
      .update({
        display_name: displayName || email.split("@")[0],
        provider: "namecheap_private_email",
        status: "connected",
        inbound_enabled: true,
        outbound_enabled: true,
        connection_health: "healthy",
        last_connection_test_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", mailboxId)
      .eq("workspace_id", workspace.id);
    if (error) redirect("/dashboard/mail?view=connectors&error=Relay%20could%20not%20update%20the%20mailbox");
  }

  try {
    await storeMailboxCredential({ mailboxId, email, password });
  } catch (error) {
    const admin = createAdminClient();
    await admin?.from("orbit_mailboxes").update({
      status: "error",
      connection_health: "failed",
      inbound_enabled: false,
      outbound_enabled: false,
      last_error: error instanceof Error ? error.message.slice(0, 1000) : "Credential storage failed.",
    }).eq("id", mailboxId).eq("workspace_id", workspace.id);
    redirect("/dashboard/mail?view=connectors&error=Relay%20could%20not%20store%20the%20mailbox%20credential%20securely");
  }

  let imported = 0;
  try {
    const result = await syncNamecheapMailbox({ workspaceId: workspace.id, mailboxId });
    imported = result.imported;
  } catch {
    // Authentication was already verified. A first-sync failure remains visible
    // as connection health in Relay and can be retried without re-entering the password.
  }

  revalidatePath("/dashboard/mail");
  redirect(`/dashboard/mail?view=mail&mailbox=${mailboxId}&notice=${encodeURIComponent(`Mailbox connected. ${imported} new message${imported === 1 ? "" : "s"} synced.`)}`);
}

export async function syncRelayMailbox(formData: FormData) {
  const { supabase, workspace, role } = await requireWorkspace();
  requireMailboxAdmin(role);
  const mailboxId = clean(formData.get("mailbox_id"), 80);
  const mailbox = await mailboxForWorkspace(supabase, workspace.id, mailboxId);
  if (!mailbox) redirect("/dashboard/mail?error=Mailbox%20not%20found");

  let imported = 0;
  try {
    const result = await syncNamecheapMailbox({ workspaceId: workspace.id, mailboxId });
    imported = result.imported;
  } catch (error) {
    redirect(`/dashboard/mail?view=mail&mailbox=${mailboxId}&error=${encodeURIComponent(error instanceof Error ? error.message : "Mailbox sync failed")}`);
  }

  revalidatePath("/dashboard/mail");
  redirect(`/dashboard/mail?view=mail&mailbox=${mailboxId}&notice=${encodeURIComponent(`${imported} new message${imported === 1 ? "" : "s"} synced.`)}`);
}

export async function disconnectRelayMailbox(formData: FormData) {
  const { supabase, workspace, role } = await requireWorkspace();
  requireMailboxAdmin(role);
  const mailboxId = clean(formData.get("mailbox_id"), 80);
  const mailbox = await mailboxForWorkspace(supabase, workspace.id, mailboxId);
  if (!mailbox) redirect("/dashboard/mail?view=connectors&error=Mailbox%20not%20found");

  await removeMailboxCredential(mailboxId).catch(() => undefined);
  await supabase.from("orbit_mailboxes").update({
    status: "disconnected",
    inbound_enabled: false,
    outbound_enabled: false,
    connection_health: "unknown",
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("id", mailboxId).eq("workspace_id", workspace.id);

  revalidatePath("/dashboard/mail");
  redirect(`/dashboard/mail?view=connectors&mailbox=${mailboxId}&notice=Mailbox%20disconnected.%20Synced%20history%20was%20kept.`);
}

export async function saveMailDraft(formData: FormData) {
  const { supabase, workspace, user } = await requireWorkspace();
  const to = emailList(clean(formData.get("to"), 1500));
  const subject = clean(formData.get("subject"), 240) || "(no subject)";
  const body = clean(formData.get("body"), 20000);
  const mailboxId = clean(formData.get("mailbox_id"), 80);

  const mailbox = await mailboxForWorkspace(supabase, workspace.id, mailboxId);
  if (!mailbox) redirect("/dashboard/mail?error=Mailbox%20is%20not%20configured");

  const { data: thread, error: threadError } = await supabase
    .from("orbit_mail_threads")
    .insert({
      workspace_id: workspace.id,
      mailbox_id: mailbox.id,
      subject,
      normalized_subject: subject.toLowerCase().replace(/^re:\s*/i, ""),
      participant_emails: to,
      folder: "drafts",
      is_unread: false,
    })
    .select("id")
    .single();
  if (threadError || !thread) redirect(`/dashboard/mail?mailbox=${mailbox.id}&error=${encodeURIComponent("Could not save draft")}`);

  const { error } = await supabase.from("orbit_mail_messages").insert({
    workspace_id: workspace.id,
    mailbox_id: mailbox.id,
    thread_id: thread.id,
    direction: "draft",
    from_address: mailbox.address,
    to_addresses: to,
    subject,
    body_text: body,
    status: "draft",
    authority_level: "amber",
    created_by: user.id,
  });
  if (error) redirect(`/dashboard/mail?mailbox=${mailbox.id}&error=${encodeURIComponent("Could not save draft")}`);

  revalidatePath("/dashboard/mail");
  redirect(`/dashboard/mail?view=mail&folder=drafts&mailbox=${mailbox.id}&notice=Draft%20saved`);
}

export async function requestMailSend(formData: FormData) {
  const { supabase, workspace, user } = await requireWorkspace();
  const to = emailList(clean(formData.get("to"), 1500));
  const subject = clean(formData.get("subject"), 240) || "(no subject)";
  const body = clean(formData.get("body"), 20000);
  const mailboxId = clean(formData.get("mailbox_id"), 80);
  if (!to.length || !body) redirect(`/dashboard/mail?compose=1&mailbox=${mailboxId}&error=Recipient%20and%20message%20are%20required`);

  const mailbox = await mailboxForWorkspace(supabase, workspace.id, mailboxId);
  if (!mailbox) redirect("/dashboard/mail?error=Mailbox%20is%20not%20configured");

  const authority = clean(formData.get("authority"), 20) === "red" ? "red" : "amber";
  const messageStatus = mailbox.status === "connected" && mailbox.outbound_enabled ? "pending_approval" : "draft";

  const { data: thread } = await supabase.from("orbit_mail_threads").insert({
    workspace_id: workspace.id,
    mailbox_id: mailbox.id,
    subject,
    normalized_subject: subject.toLowerCase().replace(/^re:\s*/i, ""),
    participant_emails: to,
    folder: messageStatus === "draft" ? "drafts" : "sent",
    is_unread: false,
  }).select("id").single();
  if (!thread) redirect(`/dashboard/mail?mailbox=${mailbox.id}&error=Could%20not%20create%20message`);

  await supabase.from("orbit_mail_messages").insert({
    workspace_id: workspace.id,
    mailbox_id: mailbox.id,
    thread_id: thread.id,
    direction: messageStatus === "draft" ? "draft" : "outbound",
    from_address: mailbox.address,
    to_addresses: to,
    subject,
    body_text: body,
    status: messageStatus,
    authority_level: authority,
    created_by: user.id,
  });

  revalidatePath("/dashboard/mail");
  if (messageStatus === "draft") {
    redirect(`/dashboard/mail?view=mail&folder=drafts&mailbox=${mailbox.id}&notice=Mailbox%20is%20not%20connected.%20Message%20saved%20as%20a%20draft.`);
  }
  redirect(`/dashboard/mail?view=mail&folder=sent&mailbox=${mailbox.id}&notice=Message%20queued%20for%20approved%20sending`);
}
