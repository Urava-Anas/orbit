import "server-only";

import tls from "node:tls";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
} from "@/lib/integration-connections";

const HOST = "mail.privateemail.com";
const IMAP_PORT = 993;
const SMTP_PORT = 465;
const SOCKET_TIMEOUT_MS = 12_000;
const MAX_IMAP_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_SYNC_MESSAGES = 30;

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

function safeQuoted(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function createTlsSocket(port: number) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const socket = tls.connect({
      host: HOST,
      port,
      servername: HOST,
      rejectUnauthorized: true,
    });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Mail server connection timed out."));
    }, SOCKET_TIMEOUT_MS);
    socket.once("secureConnect", () => {
      clearTimeout(timer);
      socket.setTimeout(SOCKET_TIMEOUT_MS, () => socket.destroy(new Error("Mail server timed out.")));
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function readUntil(
  socket: tls.TLSSocket,
  done: (text: string) => boolean,
  maxBytes = MAX_IMAP_RESPONSE_BYTES,
) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    const timer = setTimeout(() => finish(new Error("Mail server response timed out.")), SOCKET_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    }
    function finish(error?: Error) {
      cleanup();
      if (error) reject(error);
      else resolve(Buffer.concat(chunks));
    }
    function onError(error: Error) { finish(error); }
    function onClose() { finish(new Error("Mail server closed the connection.")); }
    function onData(chunk: Buffer) {
      chunks.push(chunk);
      bytes += chunk.length;
      if (bytes > maxBytes) return finish(new Error("Mail message exceeded Relay's safe sync size."));
      const text = Buffer.concat(chunks).toString("latin1");
      if (done(text)) finish();
    }

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

async function imapGreeting(socket: tls.TLSSocket) {
  const response = await readUntil(socket, (text) => /\r\n$/.test(text), 64 * 1024);
  const text = response.toString("utf8");
  if (!/^\* OK/i.test(text)) throw new Error("Namecheap IMAP did not accept the connection.");
}

async function imapCommand(socket: tls.TLSSocket, tag: string, command: string) {
  socket.write(`${tag} ${command}\r\n`);
  const response = await readUntil(socket, (text) => new RegExp(`(?:^|\\r\\n)${tag} (?:OK|NO|BAD)`, "i").test(text));
  const text = response.toString("latin1");
  const status = text.match(new RegExp(`(?:^|\\r\\n)${tag} (OK|NO|BAD)`, "i"))?.[1]?.toUpperCase();
  if (status !== "OK") {
    throw new Error(`Namecheap IMAP rejected the request (${status ?? "unknown"}).`);
  }
  return response;
}

async function imapLogin(socket: tls.TLSSocket, email: string, password: string) {
  await imapGreeting(socket);
  await imapCommand(socket, "A001", `LOGIN ${safeQuoted(email)} ${safeQuoted(password)}`);
}

function smtpRead(socket: tls.TLSSocket, expectedCode: number) {
  return readUntil(socket, (text) => {
    const lines = text.split("\r\n").filter(Boolean);
    return lines.some((line) => line.startsWith(`${expectedCode} `));
  }, 256 * 1024).then((buffer) => {
    const text = buffer.toString("utf8");
    if (!text.split("\r\n").some((line) => line.startsWith(`${expectedCode} `))) {
      throw new Error(`Namecheap SMTP returned an unexpected response.`);
    }
    return text;
  });
}

async function smtpCommand(socket: tls.TLSSocket, command: string, expectedCode: number) {
  socket.write(`${command}\r\n`);
  return smtpRead(socket, expectedCode);
}

async function testImap(email: string, password: string) {
  const socket = await createTlsSocket(IMAP_PORT);
  try {
    await imapLogin(socket, email, password);
    const response = (await imapCommand(socket, "A002", 'STATUS "INBOX" (MESSAGES UNSEEN UIDNEXT)')).toString("utf8");
    const messages = Number(response.match(/MESSAGES\s+(\d+)/i)?.[1] ?? NaN);
    const unseen = Number(response.match(/UNSEEN\s+(\d+)/i)?.[1] ?? NaN);
    await imapCommand(socket, "A003", "LOGOUT").catch(() => undefined);
    return {
      messages: Number.isFinite(messages) ? messages : null,
      unseen: Number.isFinite(unseen) ? unseen : null,
    };
  } finally {
    socket.destroy();
  }
}

async function testSmtp(email: string, password: string) {
  const socket = await createTlsSocket(SMTP_PORT);
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

export async function storeMailboxCredential(input: {
  mailboxId: string;
  email: string;
  password: string;
}) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Relay credential service is unavailable.");
  const encrypted = encryptIntegrationSecret(input.password);
  const { error } = await admin.schema("private").from("orbit_mailbox_credentials").upsert({
    mailbox_id: input.mailboxId,
    username: input.email.toLowerCase(),
    encrypted_password: encrypted,
    provider: "namecheap_private_email",
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Relay could not store the mailbox credential securely.");
}

export async function removeMailboxCredential(mailboxId: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Relay credential service is unavailable.");
  const { error } = await admin.schema("private").from("orbit_mailbox_credentials").delete().eq("mailbox_id", mailboxId);
  if (error) throw new Error("Relay could not remove the mailbox credential.");
}

async function getMailboxCredential(mailboxId: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Relay credential service is unavailable.");
  const { data, error } = await admin.schema("private").from("orbit_mailbox_credentials")
    .select("username,encrypted_password")
    .eq("mailbox_id", mailboxId)
    .maybeSingle();
  if (error || !data) throw new Error("Mailbox credentials are not available.");
  return {
    email: String(data.username),
    password: decryptIntegrationSecret(String(data.encrypted_password)),
  };
}

function decodeQuotedPrintable(value: string) {
  return value
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeHeaderWords(value: string) {
  return value.replace(/=\?([^?]+)\?([bq])\?([^?]+)\?=/gi, (_, _charset: string, mode: string, body: string) => {
    try {
      if (mode.toLowerCase() === "b") return Buffer.from(body, "base64").toString("utf8");
      return Buffer.from(decodeQuotedPrintable(body.replace(/_/g, " ")), "latin1").toString("utf8");
    } catch {
      return body;
    }
  });
}

function parseHeaders(rawHeaders: string) {
  const unfolded = rawHeaders.replace(/\r?\n[ \t]+/g, " ");
  const map = new Map<string, string>();
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (!map.has(key)) map.set(key, value);
  }
  return map;
}

function extractEmails(value: string | undefined) {
  if (!value) return [];
  const matches = value.toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? [];
  return Array.from(new Set(matches));
}

function decodeBody(body: string, encoding: string) {
  if (/base64/i.test(encoding)) {
    try { return Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf8"); } catch { return body; }
  }
  if (/quoted-printable/i.test(encoding)) return Buffer.from(decodeQuotedPrintable(body), "latin1").toString("utf8");
  return body;
}

function pickTextBody(headers: Map<string, string>, body: string) {
  const contentType = headers.get("content-type") ?? "text/plain";
  const transfer = headers.get("content-transfer-encoding") ?? "";
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i)?.[1] ?? contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i)?.[2];
  if (/multipart\//i.test(contentType) && boundary) {
    const parts = body.split(`--${boundary}`);
    for (const part of parts) {
      const split = part.search(/\r?\n\r?\n/);
      if (split < 0) continue;
      const partHeaders = parseHeaders(part.slice(0, split));
      const partBody = part.slice(split).replace(/^\r?\n\r?\n/, "");
      if (/text\/plain/i.test(partHeaders.get("content-type") ?? "")) {
        return decodeBody(partBody, partHeaders.get("content-transfer-encoding") ?? "").trim();
      }
    }
    return "";
  }
  if (/text\/html/i.test(contentType)) {
    return decodeBody(body, transfer).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return decodeBody(body, transfer).trim();
}

function parseRawMail(raw: Buffer): ParsedMail {
  const text = raw.toString("utf8");
  const split = text.search(/\r?\n\r?\n/);
  const headerText = split >= 0 ? text.slice(0, split) : text;
  const body = split >= 0 ? text.slice(split).replace(/^\r?\n\r?\n/, "") : "";
  const headers = parseHeaders(headerText);
  const subject = decodeHeaderWords(headers.get("subject") ?? "(no subject)").slice(0, 240);
  const from = extractEmails(headers.get("from"))[0] ?? "unknown@unknown.invalid";
  const dateText = headers.get("date");
  const parsedDate = dateText ? new Date(dateText) : new Date();
  return {
    internetMessageId: headers.get("message-id")?.slice(0, 500) ?? null,
    inReplyTo: headers.get("in-reply-to")?.slice(0, 500) ?? null,
    from,
    to: extractEmails(headers.get("to")),
    cc: extractEmails(headers.get("cc")),
    subject,
    bodyText: pickTextBody(headers, body).slice(0, 100_000),
    receivedAt: Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString(),
  };
}

function extractLiteral(response: Buffer) {
  const head = response.subarray(0, Math.min(response.length, 16_384)).toString("latin1");
  const marker = head.match(/\{(\d+)\}\r\n/);
  if (!marker || marker.index == null) throw new Error("Relay could not parse the IMAP message payload.");
  const length = Number(marker[1]);
  const start = marker.index + marker[0].length;
  if (!Number.isFinite(length) || start + length > response.length) throw new Error("Relay received an incomplete IMAP message.");
  return response.subarray(start, start + length);
}

function normalizedSubject(subject: string) {
  return subject.toLowerCase().replace(/^\s*(re|fw|fwd):\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 240);
}

async function linkBusinessContext(admin: SupabaseClient, workspaceId: string, threadId: string, candidates: string[]) {
  if (!candidates.length) return;
  const { data: lead } = await admin.from("leads").select("id").eq("workspace_id", workspaceId).in("email", candidates).limit(1).maybeSingle();
  if (lead?.id) {
    await admin.from("orbit_mail_threads").update({ business_context_type: "lead", business_context_id: lead.id }).eq("id", threadId);
    return;
  }
  const { data: form } = await admin.from("apex_online_form_submissions").select("id").eq("workspace_id", workspaceId).in("email", candidates).limit(1).maybeSingle();
  if (form?.id) {
    await admin.from("orbit_mail_threads").update({ business_context_type: "online_form", business_context_id: form.id }).eq("id", threadId);
  }
}

export async function syncNamecheapMailbox(input: {
  workspaceId: string;
  mailboxId: string;
}) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Relay sync service is unavailable.");

  const { data: mailbox, error: mailboxError } = await admin.from("orbit_mailboxes")
    .select("id,address,sync_cursor_uid")
    .eq("id", input.mailboxId)
    .eq("workspace_id", input.workspaceId)
    .maybeSingle();
  if (mailboxError || !mailbox) throw new Error("Mailbox was not found in this workspace.");

  const credential = await getMailboxCredential(input.mailboxId);
  const socket = await createTlsSocket(IMAP_PORT);
  let imported = 0;
  let maxUid = Number(mailbox.sync_cursor_uid ?? 0);
  try {
    await imapLogin(socket, credential.email, credential.password);
    await imapCommand(socket, "A002", 'SELECT "INBOX"');
    const searchResponse = (await imapCommand(socket, "A003", "UID SEARCH ALL")).toString("utf8");
    const searchLine = searchResponse.split("\r\n").find((line) => /^\* SEARCH/i.test(line)) ?? "";
    const allUids = searchLine.split(/\s+/).slice(2).map(Number).filter(Number.isFinite);
    const pending = allUids.filter((uid) => uid > maxUid).slice(-MAX_SYNC_MESSAGES);

    let commandNo = 4;
    for (const uid of pending) {
      const tag = `A${String(commandNo++).padStart(3, "0")}`;
      const response = await imapCommand(socket, tag, `UID FETCH ${uid} (UID BODY.PEEK[])`);
      const raw = extractLiteral(response);
      const parsed = parseRawMail(raw);
      const providerMessageId = String(uid);

      const { data: existing } = await admin.from("orbit_mail_messages")
        .select("id")
        .eq("mailbox_id", input.mailboxId)
        .eq("provider_message_id", providerMessageId)
        .maybeSingle();
      if (existing) {
        maxUid = Math.max(maxUid, uid);
        continue;
      }

      let threadId: string | null = null;
      if (parsed.inReplyTo) {
        const { data: replied } = await admin.from("orbit_mail_messages")
          .select("thread_id")
          .eq("mailbox_id", input.mailboxId)
          .eq("internet_message_id", parsed.inReplyTo)
          .limit(1)
          .maybeSingle();
        threadId = replied?.thread_id ?? null;
      }
      if (!threadId) {
        const { data: subjectThread } = await admin.from("orbit_mail_threads")
          .select("id")
          .eq("mailbox_id", input.mailboxId)
          .eq("normalized_subject", normalizedSubject(parsed.subject))
          .order("latest_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        threadId = subjectThread?.id ?? null;
      }

      const participants = Array.from(new Set([parsed.from, ...parsed.to, ...parsed.cc].filter((email) => email !== mailbox.address.toLowerCase())));
      if (!threadId) {
        const { data: created, error: threadError } = await admin.from("orbit_mail_threads").insert({
          workspace_id: input.workspaceId,
          mailbox_id: input.mailboxId,
          subject: parsed.subject,
          normalized_subject: normalizedSubject(parsed.subject),
          participant_emails: participants,
          folder: "inbox",
          is_unread: true,
          latest_message_at: parsed.receivedAt,
        }).select("id").single();
        if (threadError || !created) throw new Error("Relay could not create the synced conversation.");
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

      const { error: messageError } = await admin.from("orbit_mail_messages").insert({
        workspace_id: input.workspaceId,
        mailbox_id: input.mailboxId,
        thread_id: threadId,
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
      await linkBusinessContext(admin, input.workspaceId, threadId, participants);
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
