"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";

function clean(value: FormDataEntryValue | null, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

function emailList(value: string) {
  return value.split(/[;,]/).map((item) => item.trim().toLowerCase()).filter((item) => item.includes("@"));
}

export async function saveMailDraft(formData: FormData) {
  const { supabase, workspace, user } = await requireWorkspace();
  const to = emailList(clean(formData.get("to"), 1500));
  const subject = clean(formData.get("subject"), 240) || "(no subject)";
  const body = clean(formData.get("body"), 20000);

  const { data: mailbox, error: mailboxError } = await supabase
    .from("orbit_mailboxes")
    .select("id,address")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (mailboxError || !mailbox) redirect("/dashboard/mail?error=Mailbox%20is%20not%20configured");

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
  if (threadError || !thread) redirect(`/dashboard/mail?error=${encodeURIComponent("Could not save draft")}`);

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
  if (error) redirect(`/dashboard/mail?error=${encodeURIComponent("Could not save draft")}`);

  revalidatePath("/dashboard/mail");
  redirect("/dashboard/mail?folder=drafts&notice=Draft%20saved");
}

export async function requestMailSend(formData: FormData) {
  const { supabase, workspace, user } = await requireWorkspace();
  const to = emailList(clean(formData.get("to"), 1500));
  const subject = clean(formData.get("subject"), 240) || "(no subject)";
  const body = clean(formData.get("body"), 20000);
  if (!to.length || !body) redirect("/dashboard/mail?compose=1&error=Recipient%20and%20message%20are%20required");

  const { data: mailbox } = await supabase
    .from("orbit_mailboxes")
    .select("id,address,status,outbound_enabled")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!mailbox) redirect("/dashboard/mail?error=Mailbox%20is%20not%20configured");

  const authority = clean(formData.get("authority"), 20) === "red" ? "red" : "amber";
  const messageStatus = mailbox.status === "connected" && mailbox.outbound_enabled ? "pending_approval" : "draft";

  const { data: thread } = await supabase.from("orbit_mail_threads").insert({
    workspace_id: workspace.id, mailbox_id: mailbox.id, subject,
    normalized_subject: subject.toLowerCase().replace(/^re:\s*/i, ""), participant_emails: to,
    folder: messageStatus === "draft" ? "drafts" : "sent", is_unread: false,
  }).select("id").single();
  if (!thread) redirect("/dashboard/mail?error=Could%20not%20create%20message");

  await supabase.from("orbit_mail_messages").insert({
    workspace_id: workspace.id, mailbox_id: mailbox.id, thread_id: thread.id,
    direction: messageStatus === "draft" ? "draft" : "outbound", from_address: mailbox.address,
    to_addresses: to, subject, body_text: body, status: messageStatus,
    authority_level: authority, created_by: user.id,
  });

  revalidatePath("/dashboard/mail");
  if (messageStatus === "draft") {
    redirect("/dashboard/mail?folder=drafts&notice=Mailbox%20connector%20is%20not%20active%20yet.%20Message%20saved%20safely%20as%20a%20draft.");
  }
  redirect("/dashboard/mail?folder=sent&notice=Message%20queued%20for%20approved%20sending");
}
