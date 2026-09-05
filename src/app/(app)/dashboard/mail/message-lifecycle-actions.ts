"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { sendNamecheapMessage } from "@/lib/relay/namecheap";

function clean(value: FormDataEntryValue | null, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

function emailList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[;,]/)
        .map((item) => item.trim().toLowerCase())
        .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)),
    ),
  );
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
    .select("id,address,status,outbound_enabled")
    .eq("workspace_id", workspaceId)
    .eq("id", mailboxId)
    .maybeSingle();
  return data ?? null;
}

async function threadForWorkspace(
  supabase: Awaited<ReturnType<typeof requireWorkspace>>["supabase"],
  workspaceId: string,
  mailboxId: string,
  threadId: string,
) {
  if (!threadId) return null;
  const { data } = await supabase
    .from("orbit_mail_threads")
    .select("id,folder,subject")
    .eq("workspace_id", workspaceId)
    .eq("mailbox_id", mailboxId)
    .eq("id", threadId)
    .maybeSingle();
  return data ?? null;
}

async function latestReplyTarget(
  supabase: Awaited<ReturnType<typeof requireWorkspace>>["supabase"],
  workspaceId: string,
  mailboxId: string,
  threadId: string,
) {
  const { data } = await supabase
    .from("orbit_mail_messages")
    .select("internet_message_id")
    .eq("workspace_id", workspaceId)
    .eq("mailbox_id", mailboxId)
    .eq("thread_id", threadId)
    .not("internet_message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.internet_message_id ?? null;
}

async function createThread(input: {
  supabase: Awaited<ReturnType<typeof requireWorkspace>>["supabase"];
  workspaceId: string;
  mailboxId: string;
  subject: string;
  to: string[];
  folder: "drafts" | "outbox";
}) {
  const { data, error } = await input.supabase
    .from("orbit_mail_threads")
    .insert({
      workspace_id: input.workspaceId,
      mailbox_id: input.mailboxId,
      subject: input.subject,
      normalized_subject: input.subject.toLowerCase().replace(/^re:\s*/i, ""),
      participant_emails: input.to,
      folder: input.folder,
      is_unread: false,
    })
    .select("id,folder,subject")
    .single();
  if (error || !data) return null;
  return data;
}

async function updateThreadOperationalState(input: {
  supabase: Awaited<ReturnType<typeof requireWorkspace>>["supabase"];
  workspaceId: string;
  mailboxId: string;
  threadId: string;
  folder: "drafts" | "outbox";
  to: string[];
}) {
  const now = new Date().toISOString();
  const { data, error } = await input.supabase
    .from("orbit_mail_threads")
    .update({
      folder: input.folder,
      participant_emails: input.to,
      is_unread: false,
      latest_message_at: now,
      updated_at: now,
    })
    .eq("workspace_id", input.workspaceId)
    .eq("mailbox_id", input.mailboxId)
    .eq("id", input.threadId)
    .select("id,folder")
    .maybeSingle();
  return !error && data?.folder === input.folder;
}

function composeError(mailboxId: string, threadId: string, message: string) {
  const thread = threadId ? `&thread=${encodeURIComponent(threadId)}` : "";
  return `/dashboard/mail?view=mail&compose=1&mailbox=${encodeURIComponent(mailboxId)}${thread}&error=${encodeURIComponent(message)}`;
}

export async function saveRelayDraft(formData: FormData) {
  const { supabase, workspace, user } = await requireWorkspace();
  const mailboxId = clean(formData.get("mailbox_id"), 80);
  const requestedThreadId = clean(formData.get("thread_id"), 80);
  const draftMessageId = clean(formData.get("draft_message_id"), 80);
  const expectedDraftUpdatedAt = clean(formData.get("draft_expected_updated_at"), 80);
  const to = emailList(clean(formData.get("to"), 1500));
  const subject = clean(formData.get("subject"), 240) || "(no subject)";
  const body = clean(formData.get("body"), 20000);
  const authority = clean(formData.get("authority"), 20) === "red" ? "red" : "amber";

  const mailbox = await mailboxForWorkspace(supabase, workspace.id, mailboxId);
  if (!mailbox) redirect("/dashboard/mail?error=Mailbox%20is%20not%20configured");

  let thread = requestedThreadId
    ? await threadForWorkspace(supabase, workspace.id, mailbox.id, requestedThreadId)
    : null;
  if (requestedThreadId && !thread) {
    redirect(composeError(mailbox.id, requestedThreadId, "Relay refused a draft thread identity mismatch."));
  }
  if (!thread) {
    thread = await createThread({
      supabase,
      workspaceId: workspace.id,
      mailboxId: mailbox.id,
      subject,
      to,
      folder: "drafts",
    });
  }
  if (!thread) redirect(composeError(mailbox.id, requestedThreadId, "Could not create the draft conversation."));

  const replyTarget = await latestReplyTarget(supabase, workspace.id, mailbox.id, thread.id);
  const now = new Date().toISOString();

  if (draftMessageId) {
    if (!expectedDraftUpdatedAt) {
      redirect(composeError(mailbox.id, thread.id, "Relay could not prove the draft checkpoint. Nothing was overwritten."));
    }
    const { data: draft } = await supabase
      .from("orbit_mail_messages")
      .select("id,status,direction,updated_at")
      .eq("workspace_id", workspace.id)
      .eq("mailbox_id", mailbox.id)
      .eq("thread_id", thread.id)
      .eq("id", draftMessageId)
      .maybeSingle();
    if (!draft || draft.status !== "draft" || draft.direction !== "draft" || draft.updated_at !== expectedDraftUpdatedAt) {
      redirect(composeError(mailbox.id, thread.id, "Draft changed since this editor loaded. Nothing was overwritten."));
    }

    const { data: updated, error } = await supabase
      .from("orbit_mail_messages")
      .update({
        to_addresses: to,
        subject,
        body_text: body,
        authority_level: authority,
        in_reply_to: replyTarget,
        updated_at: now,
      })
      .eq("workspace_id", workspace.id)
      .eq("mailbox_id", mailbox.id)
      .eq("thread_id", thread.id)
      .eq("id", draftMessageId)
      .eq("status", "draft")
      .eq("direction", "draft")
      .eq("updated_at", expectedDraftUpdatedAt)
      .select("id,status,updated_at")
      .maybeSingle();
    if (error || !updated || updated.status !== "draft" || updated.updated_at !== now) {
      redirect(composeError(mailbox.id, thread.id, "Draft update was not verified."));
    }
  } else {
    const { error } = await supabase.from("orbit_mail_messages").insert({
      workspace_id: workspace.id,
      mailbox_id: mailbox.id,
      thread_id: thread.id,
      direction: "draft",
      from_address: mailbox.address,
      to_addresses: to,
      subject,
      body_text: body,
      in_reply_to: replyTarget,
      status: "draft",
      authority_level: authority,
      created_by: user.id,
    });
    if (error) redirect(composeError(mailbox.id, thread.id, "Could not save draft."));
  }

  const threadUpdated = await updateThreadOperationalState({
    supabase,
    workspaceId: workspace.id,
    mailboxId: mailbox.id,
    threadId: thread.id,
    folder: "drafts",
    to,
  });
  if (!threadUpdated) redirect(composeError(mailbox.id, thread.id, "Draft saved, but the conversation state was not verified."));

  revalidatePath("/dashboard/mail");
  redirect(`/dashboard/mail?view=mail&folder=drafts&mailbox=${mailbox.id}&thread=${thread.id}&notice=Draft%20saved%20to%20the%20same%20conversation`);
}

export async function queueRelayMessage(formData: FormData) {
  const { supabase, workspace, user } = await requireWorkspace();
  const mailboxId = clean(formData.get("mailbox_id"), 80);
  const requestedThreadId = clean(formData.get("thread_id"), 80);
  const draftMessageId = clean(formData.get("draft_message_id"), 80);
  const expectedDraftUpdatedAt = clean(formData.get("draft_expected_updated_at"), 80);
  const to = emailList(clean(formData.get("to"), 1500));
  const subject = clean(formData.get("subject"), 240) || "(no subject)";
  const body = clean(formData.get("body"), 20000);
  const authority = clean(formData.get("authority"), 20) === "red" ? "red" : "amber";
  if (!to.length || !body) {
    redirect(composeError(mailboxId, requestedThreadId, "Recipient and message are required."));
  }

  const mailbox = await mailboxForWorkspace(supabase, workspace.id, mailboxId);
  if (!mailbox) redirect("/dashboard/mail?error=Mailbox%20is%20not%20configured");
  const canQueue = mailbox.status === "connected" && mailbox.outbound_enabled;
  const targetStatus = canQueue ? "pending_approval" : "draft";
  const targetFolder = canQueue ? "outbox" : "drafts";

  let thread = requestedThreadId
    ? await threadForWorkspace(supabase, workspace.id, mailbox.id, requestedThreadId)
    : null;
  if (requestedThreadId && !thread) {
    redirect(composeError(mailbox.id, requestedThreadId, "Relay refused a reply thread identity mismatch."));
  }
  if (!thread) {
    thread = await createThread({
      supabase,
      workspaceId: workspace.id,
      mailboxId: mailbox.id,
      subject,
      to,
      folder: targetFolder,
    });
  }
  if (!thread) redirect(composeError(mailbox.id, requestedThreadId, "Could not create the message conversation."));

  const replyTarget = await latestReplyTarget(supabase, workspace.id, mailbox.id, thread.id);
  const now = new Date().toISOString();

  if (draftMessageId) {
    if (!expectedDraftUpdatedAt) {
      redirect(composeError(mailbox.id, thread.id, "Relay could not prove the draft checkpoint. Nothing was queued."));
    }
    const { data: draft } = await supabase
      .from("orbit_mail_messages")
      .select("id,status,direction,updated_at")
      .eq("workspace_id", workspace.id)
      .eq("mailbox_id", mailbox.id)
      .eq("thread_id", thread.id)
      .eq("id", draftMessageId)
      .maybeSingle();
    if (!draft || draft.status !== "draft" || draft.direction !== "draft" || draft.updated_at !== expectedDraftUpdatedAt) {
      redirect(composeError(mailbox.id, thread.id, "Draft changed since this editor loaded. Nothing was queued."));
    }

    const { data: updated, error } = await supabase
      .from("orbit_mail_messages")
      .update({
        direction: targetStatus === "draft" ? "draft" : "outbound",
        to_addresses: to,
        subject,
        body_text: body,
        in_reply_to: replyTarget,
        status: targetStatus,
        authority_level: authority,
        updated_at: now,
      })
      .eq("workspace_id", workspace.id)
      .eq("mailbox_id", mailbox.id)
      .eq("thread_id", thread.id)
      .eq("id", draftMessageId)
      .eq("status", "draft")
      .eq("direction", "draft")
      .eq("updated_at", expectedDraftUpdatedAt)
      .select("id,status,direction,updated_at")
      .maybeSingle();
    if (error || !updated || updated.status !== targetStatus || updated.updated_at !== now) {
      redirect(composeError(mailbox.id, thread.id, "Message queue transition was not verified."));
    }
  } else {
    const { error } = await supabase.from("orbit_mail_messages").insert({
      workspace_id: workspace.id,
      mailbox_id: mailbox.id,
      thread_id: thread.id,
      direction: targetStatus === "draft" ? "draft" : "outbound",
      from_address: mailbox.address,
      to_addresses: to,
      subject,
      body_text: body,
      in_reply_to: replyTarget,
      status: targetStatus,
      authority_level: authority,
      created_by: user.id,
    });
    if (error) redirect(composeError(mailbox.id, thread.id, "Could not queue message."));
  }

  const threadUpdated = await updateThreadOperationalState({
    supabase,
    workspaceId: workspace.id,
    mailboxId: mailbox.id,
    threadId: thread.id,
    folder: targetFolder,
    to,
  });
  if (!threadUpdated) {
    redirect(`/dashboard/mail?view=mail&folder=${targetFolder}&mailbox=${mailbox.id}&thread=${thread.id}&error=${encodeURIComponent("Message state changed, but the conversation state was not verified. Do not create a duplicate message.")}`);
  }

  revalidatePath("/dashboard/mail");
  if (!canQueue) {
    redirect(`/dashboard/mail?view=mail&folder=drafts&mailbox=${mailbox.id}&thread=${thread.id}&notice=Mailbox%20is%20not%20connected.%20The%20message%20remains%20a%20draft.`);
  }
  redirect(`/dashboard/mail?view=mail&folder=outbox&mailbox=${mailbox.id}&thread=${thread.id}&notice=Message%20queued%20for%20approval.%20It%20has%20not%20been%20sent.`);
}

export async function setRelayMessageRecoveryState(formData: FormData) {
  const { supabase, workspace, role } = await requireWorkspace();
  requireMailboxAdmin(role);
  const mailboxId = clean(formData.get("mailbox_id"), 80);
  const messageId = clean(formData.get("message_id"), 80);
  const expectedStatus = clean(formData.get("expected_status"), 40);
  const nextStatus = clean(formData.get("next_status"), 40);
  const expectedUpdatedAt = clean(formData.get("expected_updated_at"), 80);
  const allowed =
    (expectedStatus === "failed" && nextStatus === "pending_approval") ||
    (expectedStatus === "pending_approval" && nextStatus === "failed");
  if (!mailboxId || !messageId || !expectedUpdatedAt || !allowed) {
    redirect("/dashboard/mail?view=mail&folder=outbox&error=Relay%20could%20not%20validate%20the%20recovery%20transition");
  }

  const mailbox = await mailboxForWorkspace(supabase, workspace.id, mailboxId);
  if (!mailbox) redirect("/dashboard/mail?error=Mailbox%20is%20not%20configured");
  if (nextStatus === "pending_approval" && (mailbox.status !== "connected" || !mailbox.outbound_enabled)) {
    redirect(`/dashboard/mail?view=mail&folder=outbox&mailbox=${mailboxId}&error=Mailbox%20sending%20is%20not%20enabled`);
  }

  const { data: message } = await supabase
    .from("orbit_mail_messages")
    .select("id,thread_id,status,updated_at,provider_message_id,internet_message_id,sent_at")
    .eq("workspace_id", workspace.id)
    .eq("mailbox_id", mailboxId)
    .eq("id", messageId)
    .maybeSingle();
  if (
    !message ||
    message.status !== expectedStatus ||
    message.updated_at !== expectedUpdatedAt ||
    message.provider_message_id ||
    message.internet_message_id ||
    message.sent_at
  ) {
    redirect(`/dashboard/mail?view=mail&folder=outbox&mailbox=${mailboxId}&error=Relay%20refused%20recovery%20because%20the%20send%20checkpoint%20changed%20or%20delivery%20evidence%20exists`);
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("orbit_mail_messages")
    .update({ status: nextStatus, updated_at: now })
    .eq("workspace_id", workspace.id)
    .eq("mailbox_id", mailboxId)
    .eq("id", messageId)
    .eq("status", expectedStatus)
    .eq("updated_at", expectedUpdatedAt)
    .is("provider_message_id", null)
    .is("internet_message_id", null)
    .is("sent_at", null)
    .select("id,thread_id,status,updated_at")
    .maybeSingle();
  if (error || !updated || updated.status !== nextStatus || updated.updated_at !== now) {
    redirect(`/dashboard/mail?view=mail&folder=outbox&mailbox=${mailboxId}&error=Relay%20recovery%20transition%20was%20not%20verified`);
  }

  await supabase
    .from("orbit_mail_threads")
    .update({ folder: "outbox", updated_at: now })
    .eq("workspace_id", workspace.id)
    .eq("mailbox_id", mailboxId)
    .eq("id", updated.thread_id);

  revalidatePath("/dashboard/mail");
  redirect(`/dashboard/mail?view=mail&folder=outbox&mailbox=${mailboxId}&thread=${updated.thread_id}&notice=${encodeURIComponent(`Message moved from ${expectedStatus} to ${nextStatus}. Rollback: restore ${expectedStatus} before any send attempt.`)}`);
}

export async function returnRelayMessageToDraft(formData: FormData) {
  const { supabase, workspace, role } = await requireWorkspace();
  requireMailboxAdmin(role);
  const mailboxId = clean(formData.get("mailbox_id"), 80);
  const messageId = clean(formData.get("message_id"), 80);
  const expectedUpdatedAt = clean(formData.get("expected_updated_at"), 80);
  if (!mailboxId || !messageId || !expectedUpdatedAt) {
    redirect("/dashboard/mail?view=mail&folder=outbox&error=Relay%20could%20not%20validate%20the%20approval%20rollback");
  }

  const { data: message } = await supabase
    .from("orbit_mail_messages")
    .select("id,thread_id,status,updated_at,provider_message_id,internet_message_id,sent_at")
    .eq("workspace_id", workspace.id)
    .eq("mailbox_id", mailboxId)
    .eq("id", messageId)
    .maybeSingle();
  if (
    !message ||
    message.status !== "pending_approval" ||
    message.updated_at !== expectedUpdatedAt ||
    message.provider_message_id ||
    message.internet_message_id ||
    message.sent_at
  ) {
    redirect(`/dashboard/mail?view=mail&folder=outbox&mailbox=${mailboxId}&error=Relay%20refused%20the%20rollback%20because%20the%20approval%20checkpoint%20changed`);
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("orbit_mail_messages")
    .update({ status: "draft", direction: "draft", updated_at: now })
    .eq("workspace_id", workspace.id)
    .eq("mailbox_id", mailboxId)
    .eq("id", messageId)
    .eq("status", "pending_approval")
    .eq("updated_at", expectedUpdatedAt)
    .is("provider_message_id", null)
    .is("internet_message_id", null)
    .is("sent_at", null)
    .select("id,thread_id,status,direction")
    .maybeSingle();
  if (error || !updated || updated.status !== "draft" || updated.direction !== "draft") {
    redirect(`/dashboard/mail?view=mail&folder=outbox&mailbox=${mailboxId}&error=Relay%20could%20not%20verify%20the%20approval%20rollback`);
  }

  const { data: thread } = await supabase
    .from("orbit_mail_threads")
    .update({ folder: "drafts", updated_at: now })
    .eq("workspace_id", workspace.id)
    .eq("mailbox_id", mailboxId)
    .eq("id", updated.thread_id)
    .eq("folder", "outbox")
    .select("id,folder")
    .maybeSingle();
  if (!thread || thread.folder !== "drafts") {
    redirect(`/dashboard/mail?view=mail&folder=drafts&mailbox=${mailboxId}&thread=${updated.thread_id}&error=${encodeURIComponent("Message returned to draft, but the thread folder repair was not verified. Do not create a duplicate draft.")}`);
  }

  revalidatePath("/dashboard/mail");
  redirect(`/dashboard/mail?view=mail&folder=drafts&mailbox=${mailboxId}&thread=${updated.thread_id}&notice=Approval%20queue%20entry%20returned%20to%20draft.%20No%20email%20was%20sent.`);
}

export async function approveAndSendRelayMessageSafe(formData: FormData) {
  const { supabase, workspace, role } = await requireWorkspace();
  requireMailboxAdmin(role);
  const mailboxId = clean(formData.get("mailbox_id"), 80);
  const messageId = clean(formData.get("message_id"), 80);
  const mailbox = await mailboxForWorkspace(supabase, workspace.id, mailboxId);
  if (!mailbox || !messageId) redirect("/dashboard/mail?error=Relay%20message%20was%20not%20found");

  const { data: checkpoint } = await supabase
    .from("orbit_mail_messages")
    .select("id,thread_id,status")
    .eq("workspace_id", workspace.id)
    .eq("mailbox_id", mailboxId)
    .eq("id", messageId)
    .maybeSingle();
  if (!checkpoint || checkpoint.status !== "pending_approval") {
    redirect(`/dashboard/mail?view=mail&folder=outbox&mailbox=${mailboxId}&error=This%20message%20is%20no%20longer%20waiting%20for%20approval`);
  }

  try {
    await sendNamecheapMessage({ workspaceId: workspace.id, mailboxId, messageId });
  } catch (error) {
    const { data: after } = await supabase
      .from("orbit_mail_messages")
      .select("id,thread_id,status,provider_message_id,internet_message_id,sent_at")
      .eq("workspace_id", workspace.id)
      .eq("mailbox_id", mailboxId)
      .eq("id", messageId)
      .maybeSingle();

    if (after?.status === "sent") {
      const now = new Date().toISOString();
      await supabase
        .from("orbit_mail_threads")
        .update({ folder: "sent", is_unread: false, updated_at: now })
        .eq("workspace_id", workspace.id)
        .eq("mailbox_id", mailboxId)
        .eq("id", after.thread_id)
        .eq("folder", "outbox");
      revalidatePath("/dashboard/mail");
      redirect(`/dashboard/mail?view=mail&folder=sent&mailbox=${mailboxId}&thread=${after.thread_id}&notice=Email%20was%20accepted%20and%20Relay%20recovered%20its%20final%20conversation%20state`);
    }

    if (after?.status === "sending") {
      redirect(`/dashboard/mail?view=mail&folder=outbox&mailbox=${mailboxId}&thread=${after.thread_id}&error=${encodeURIComponent("Delivery state is uncertain because SMTP may already have accepted this message. Relay will not retry automatically. Verify provider delivery before any manual recovery.")}`);
    }

    if (after?.status === "failed") {
      redirect(`/dashboard/mail?view=mail&folder=outbox&mailbox=${mailboxId}&thread=${after.thread_id}&error=${encodeURIComponent("Send failed before Relay recorded SMTP acceptance. Use Recover to approval queue before retrying; do not create a duplicate message.")}`);
    }

    redirect(`/dashboard/mail?view=mail&folder=outbox&mailbox=${mailboxId}&thread=${checkpoint.thread_id}&error=${encodeURIComponent(error instanceof Error ? error.message : "Relay could not verify the send state")}`);
  }

  revalidatePath("/dashboard/mail");
  redirect(`/dashboard/mail?view=mail&folder=sent&mailbox=${mailboxId}&thread=${checkpoint.thread_id}&notice=Email%20sent%20successfully`);
}
