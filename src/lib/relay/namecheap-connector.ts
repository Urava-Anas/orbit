import "server-only";

import * as tls from "node:tls";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "@/lib/integration-connections";

const HOST = "mail.privateemail.com";
const IMAP_PORT = 993;
const SMTP_PORT = 465;
const TIMEOUT = 12_000;
const MAX_RESPONSE = 8 * 1024 * 1024;
const MAX_SYNC = 30;

export type RelayConnectionTest = {
  ok: boolean;
  imapOk: boolean;
  smtpOk: boolean;
  inboxMessages: number | null;
  unseen: number | null;
  error: string | null;
};

type ParsedMail = {
  internetMessageId: string | null;
  inReplyTo: string | null;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  bodyText: string;
  receivedAt: string;
};

function quoted(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function openTls(port: number) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const socket = tls.connect({ host: HOST, port, servername: HOST, rejectUnauthorized: true });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Mail server connection timed out."));
    }, TIMEOUT);
    socket.once("secureConnect", () => {
      clearTimeout(timer);
      socket.setTimeout(TIMEOUT, () => socket.destroy(new Error("Mail server timed out.")));
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function readUntil(socket: tls.TLSSocket, done: (text: string) => boolean, maxBytes = MAX_RESPONSE) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const timer = setTimeout(() => finish(new Error("Mail server response timed out.")), TIMEOUT);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(Buffer.concat(chunks));
    };
    const onError = (error: Error) => finish(error);
    const onClose = () => finish(new Error("Mail server closed the connection."));
    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      size += chunk.length;
      if (size > maxBytes) return finish(new Error("Mail message exceeded Relay's safe sync size."));
      if (done(Buffer.concat(chunks).toString("latin1"))) finish();
    };
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

async function imapCommand(socket: tls.TLSSocket, tag: string, command: string) {
  socket.write(`${tag} ${command}\r\n`);
  const response = await readUntil(socket, (text) => new RegExp(`(?:^|\\r\\n)${tag} (?:OK|NO|BAD)`, "i").test(text));
  const status = response.toString("latin1").match(new RegExp(`(?:^|\\r\\n)${tag} (OK|NO|BAD)`, "i"))?.[1]?.toUpperCase();
  if (status !== "OK") throw new Error(`Namecheap IMAP rejected the request (${status ?? "unknown"}).`);
  return response;
}

async function imapLogin(socket: tls.TLSSocket, email: string, password: string) {
  const greeting = await readUntil(socket, (text) => /\r\n$/.test(text), 64 * 1024);
  if (!/^\* OK/i.test(greeting.toString("utf8"))) throw new Error("Namecheap IMAP did not accept the connection.");
  await imapCommand(socket, "A001", `LOGIN ${quoted(email)} ${quoted(password)}`);
}

function smtpRead(socket: tls.TLSSocket, code: number) {
  return readUntil(socket, (text) => text.split("\r\n").some((line) => line.startsWith(`${code} `)), 256 * 1024);
}

async function smtpCommand(socket: tls.TLSSocket, command: string, code: number) {
  socket.write(`${command}\r\n`);
  await smtpRead(socket, code);
}

async function testImap(email: string, password: string) {
  const socket = await openTls(IMAP_PORT);
  try {
    await imapLogin(socket, email, password);
    const response = (await imapCommand(socket, "A002", 'STATUS "INBOX" (MESSAGES UNSEEN UIDNEXT)')).toString("utf8");
    await imapCommand(socket, "A003", "LOGOUT").catch(() => undefined);
    const messages = Number(response.match(/MESSAGES\s+(\d+)/i)?.[1] ?? NaN);
    const unseen = Number(response.match(/UNSEEN\s+(\d+)/i)?.[1] ?? NaN);
    return {
      messages: Number.isFinite(messages) ? messages : null,
      unseen: Number.isFinite(unseen) ? unseen : null,
    };
  } finally {
    socket.destroy();
  }
}

async function testSmtp(email: string, password: string) {
  const socket = await openTls(SMTP_PORT);
  try {
    await smtpRead(socket, 220);
    await smtpCommand(socket, "EHLO orbit.relay", 250);
    await smtpCommand(socket, "AUTH LOGIN", 334);
    await smtpCommand(socket, Buffer.from(email).toString("base64"), 334);
    await smtpCommand(socket, Buffer.from(password).toString("base64"), 235);
    await smtpCommand(socket, "QUIT", 221).catch(() => undefined);
  } finally {
    socket.destroy();
  }
}

export async function testNamecheapMailbox(email: string, password: string): Promise<RelayConnectionTest> {
  let imapOk = false;
  let smtpOk = false;
  let inboxMessages: number | null = null;
  let unseen: number | null = null;
  try {
    const imap = await testImap(email, password);
    imapOk = true;
    inboxMessages = imap.messages;
    unseen = imap.unseen;
    await testSmtp(email, password);
    smtpOk = true;
    return { ok: true, imapOk, smtpOk, inboxMessages, unseen, error: null };
  } catch (error) {
    return {
      ok: false,
      imapOk,
      smtpOk,
      inboxMessages,
      unseen,
      error: error instanceof Error ? error.message : "Mailbox authentication failed.",
    };
  }
}

export async function storeMailboxCredential(input: { mailboxId: string; email: string; password: string }) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Relay credential service is unavailable.");
  const { error } = await admin.from("orbit_mailbox_credentials").upsert({
    mailbox_id: input.mailboxId,
    username: input.email.toLowerCase(),
    encrypted_password: encryptIntegrationSecret(input.password),
    provider: "namecheap_private_email",
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Relay could not store the mailbox credential securely.");
}

export async function removeMailboxCredential(mailboxId: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Relay credential service is unavailable.");
  const { error } = await admin.from("orbit_mailbox_credentials").delete().eq("mailbox_id", mailboxId);
  if (error) throw new Error("Relay could not remove the mailbox credential.");
}

async function getMailboxCredential(mailboxId: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Relay credential service is unavailable.");
  const { data, error } = await admin.from("orbit_mailbox_credentials")
    .select("username,encrypted_password")
    .eq("mailbox_id", mailboxId)
    .maybeSingle();
  if (error || !data) throw new Error("Mailbox credentials are not available.");
  return {
    email: String(data.username),
    password: decryptIntegrationSecret(String(data.encrypted_password)),
  };
}

function qp(value: string) {
  return value.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeHeader(value: string) {
  return value.replace(/=\?([^?]+)\?([bq])\?([^?]+)\?=/gi, (_, _charset: string, mode: string, body: string) => {
    try {
      return mode.toLowerCase() === "b"
        ? Buffer.from(body, "base64").toString("utf8")
        : Buffer.from(qp(body.replace(/_/g, " ")), "latin1").toString("utf8");
    } catch {
      return body;
    }
  });
}

function headers(raw: string) {
  const map = new Map<string, string>();
  for (const line of raw.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index > 0) {
      const key = line.slice(0, index).trim().toLowerCase();
      if (!map.has(key)) map.set(key, line.slice(index + 1).trim());
    }
  }
  return map;
}

function emails(value?: string) {
  return Array.from(new Set(value?.toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? []));
}

function decodeBody(body: string, encoding: string) {
  if (/base64/i.test(encoding)) {
    try { return Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf8"); } catch { return body; }
  }
  return /quoted-printable/i.test(encoding) ? Buffer.from(qp(body), "latin1").toString("utf8") : body;
}

function textBody(headerMap: Map<string, string>, body: string) {
  const contentType = headerMap.get("content-type") ?? "text/plain";
  const encoding = headerMap.get("content-transfer-encoding") ?? "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (/multipart\//i.test(contentType) && boundary) {
    for (const part of body.split(`--${boundary}`)) {
      const index = part.search(/\r?\n\r?\n/);
      if (index < 0) continue;
      const partHeaders = headers(part.slice(0, index));
      if (!/text\/plain/i.test(partHeaders.get("content-type") ?? "")) continue;
      return decodeBody(part.slice(index).replace(/^\r?\n\r?\n/, ""), partHeaders.get("content-transfer-encoding") ?? "").trim();
    }
    return "";
  }
  const decoded = decodeBody(body, encoding);
  return /text\/html/i.test(contentType)
    ? decoded.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    : decoded.trim();
}

function parseRaw(raw: Buffer): ParsedMail {
  const value = raw.toString("utf8");
  const index = value.search(/\r?\n\r?\n/);
  const headerText = index >= 0 ? value.slice(0, index) : value;
  const body = index >= 0 ? value.slice(index).replace(/^\r?\n\r?\n/, "") : "";
  const map = headers(headerText);
  const parsedDate = new Date(map.get("date") ?? Date.now());
  return {
    internetMessageId: map.get("message-id")?.slice(0, 500) ?? null,
    inReplyTo: map.get("in-reply-to")?.slice(0, 500) ?? null,
    from: emails(map.get("from"))[0] ?? "unknown@unknown.invalid",
    to: emails(map.get("to")),
    cc: emails(map.get("cc")),
    subject: decodeHeader(map.get("subject") ?? "(no subject)").slice(0, 240),
    bodyText: textBody(map, body).slice(0, 100_000),
    receivedAt: Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString(),
  };
}

function literal(response: Buffer) {
  const head = response.subarray(0, Math.min(response.length, 16_384)).toString("latin1");
  const marker = head.match(/\{(\d+)\}\r\n/);
  if (!marker || marker.index == null) throw new Error("Relay could not parse the IMAP message payload.");
  const length = Number(marker[1]);
  const start = marker.index + marker[0].length;
  if (!Number.isFinite(length) || start + length > response.length) throw new Error("Relay received an incomplete IMAP message.");
  return response.subarray(start, start + length);
}

function subjectKey(subject: string) {
  return subject.toLowerCase().replace(/^\s*(re|fw|fwd):\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 240);
}

async function linkContext(admin: SupabaseClient, workspaceId: string, threadId: string, candidates: string[]) {
  if (!candidates.length) return;
  const { data: lead } = await admin.from("leads").select("id").eq("workspace_id", workspaceId).in("email", candidates).limit(1).maybeSingle();
  if (lead?.id) {
    await admin.from("orbit_mail_threads").update({ business_context_type: "lead", business_context_id: lead.id }).eq("id", threadId);
    return;
  }
  const { data: form } = await admin.from("apex_online_form_submissions").select("id").eq("workspace_id", workspaceId).in("email", candidates).limit(1).maybeSingle();
  if (form?.id) await admin.from("orbit_mail_threads").update({ business_context_type: "online_form", business_context_id: form.id }).eq("id", threadId);
}

export async function syncNamecheapMailbox(input: { workspaceId: string; mailboxId: string }) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Relay sync service is unavailable.");
  const { data: mailbox } = await admin.from("orbit_mailboxes")
    .select("id,address,sync_cursor_uid")
    .eq("id", input.mailboxId)
    .eq("workspace_id", input.workspaceId)
    .maybeSingle();
  if (!mailbox) throw new Error("Mailbox was not found in this workspace.");

  const credential = await getMailboxCredential(input.mailboxId);
  const socket = await openTls(IMAP_PORT);
  let imported = 0;
  let maxUid = Number(mailbox.sync_cursor_uid ?? 0);
  try {
    await imapLogin(socket, credential.email, credential.password);
    await imapCommand(socket, "A002", 'SELECT "INBOX"');
    const search = (await imapCommand(socket, "A003", "UID SEARCH ALL")).toString("utf8");
    const searchLine = search.split("\r\n").find((line) => /^\* SEARCH/i.test(line)) ?? "";
    const pending = searchLine.split(/\s+/).slice(2).map(Number).filter(Number.isFinite).filter((uid) => uid > maxUid).slice(-MAX_SYNC);
    let commandNo = 4;

    for (const uid of pending) {
      const tag = `A${String(commandNo++).padStart(3, "0")}`;
      const parsed = parseRaw(literal(await imapCommand(socket, tag, `UID FETCH ${uid} (UID BODY.PEEK[])`)));
      const providerMessageId = String(uid);
      const { data: existing } = await admin.from("orbit_mail_messages").select("id")
        .eq("mailbox_id", input.mailboxId).eq("provider_message_id", providerMessageId).maybeSingle();
      if (existing) {
        maxUid = Math.max(maxUid, uid);
        continue;
      }

      let threadId: string | null = null;
      if (parsed.inReplyTo) {
        const { data: replied } = await admin.from("orbit_mail_messages").select("thread_id")
          .eq("mailbox_id", input.mailboxId).eq("internet_message_id", parsed.inReplyTo).limit(1).maybeSingle();
        threadId = replied?.thread_id ?? null;
      }
      if (!threadId) {
        const { data: match } = await admin.from("orbit_mail_threads").select("id")
          .eq("mailbox_id", input.mailboxId).eq("normalized_subject", subjectKey(parsed.subject))
          .order("latest_message_at", { ascending: false }).limit(1).maybeSingle();
        threadId = match?.id ?? null;
      }

      const participants = Array.from(new Set([parsed.from, ...parsed.to, ...parsed.cc].filter((email) => email !== String(mailbox.address).toLowerCase())));
      if (!threadId) {
        const { data: created, error } = await admin.from("orbit_mail_threads").insert({
          workspace_id: input.workspaceId,
          mailbox_id: input.mailboxId,
          subject: parsed.subject,
          normalized_subject: subjectKey(parsed.subject),
          participant_emails: participants,
          folder: "inbox",
          is_unread: true,
          latest_message_at: parsed.receivedAt,
        }).select("id").single();
        if (error || !created) throw new Error("Relay could not create the synced conversation.");
        threadId = created.id;
      } else {
        await admin.from("orbit_mail_threads").update({
          subject: parsed.subject,
          participant_emails: participants,
          folder: "inbox",
          is_unread: true,
          latest_message_at: parsed.receivedAt,
          updated_at: new Date().toISOString(),
        }).eq("id", threadId);
      }

      if (!threadId) throw new Error("Relay could not resolve the synced conversation.");
      const resolvedThreadId = threadId;
      const { error: messageError } = await admin.from("orbit_mail_messages").insert({
        workspace_id: input.workspaceId,
        mailbox_id: input.mailboxId,
        thread_id: resolvedThreadId,
        direction: "inbound",
        provider_message_id: providerMessageId,
        internet_message_id: parsed.internetMessageId,
        in_reply_to: parsed.inReplyTo,
        from_address: parsed.from,
        to_addresses: parsed.to,
        cc_addresses: parsed.cc,
        subject: parsed.subject,
        body_text: parsed.bodyText,
        status: "received",
        authority_level: "green",
        received_at: parsed.receivedAt,
      });
      if (messageError) throw new Error("Relay could not store a synced message.");
      await linkContext(admin, input.workspaceId, resolvedThreadId, participants);
      maxUid = Math.max(maxUid, uid);
      imported += 1;
    }

    await imapCommand(socket, `A${String(commandNo).padStart(3, "0")}`, "LOGOUT").catch(() => undefined);
    await admin.from("orbit_mailboxes").update({
      status: "connected",
      inbound_enabled: true,
      outbound_enabled: true,
      connection_health: "healthy",
      sync_cursor_uid: maxUid || null,
      last_synced_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", input.mailboxId).eq("workspace_id", input.workspaceId);
    return { imported, cursor: maxUid };
  } catch (error) {
    await admin.from("orbit_mailboxes").update({
      connection_health: "failed",
      last_error: error instanceof Error ? error.message.slice(0, 1000) : "Relay sync failed.",
      updated_at: new Date().toISOString(),
    }).eq("id", input.mailboxId).eq("workspace_id", input.workspaceId);
    throw error;
  } finally {
    socket.destroy();
  }
}
