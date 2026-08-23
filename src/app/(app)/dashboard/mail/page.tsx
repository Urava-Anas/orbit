import type { Metadata } from "next";
import Link from "next/link";
import { Archive, CircleAlert, Inbox, Mail, PenLine, Search, Send, ShieldCheck, Star, Trash2 } from "lucide-react";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/workspace";
import { getWorkspaceProfile } from "@/lib/workspace-profile";
import { requestMailSend, saveMailDraft } from "./actions";
import styles from "./mail.module.css";

export const metadata: Metadata = { title: "Mail · Orbit", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ folder?: string; compose?: string; thread?: string; error?: string; notice?: string }> };
type Thread = { id:string; subject:string; participant_emails:string[]; folder:string; is_unread:boolean; is_starred:boolean; business_context_type:string|null; latest_message_at:string };
type Message = { id:string; direction:string; from_address:string; to_addresses:string[]; subject:string; body_text:string; status:string; authority_level:string; sent_at:string|null; received_at:string|null; created_at:string };

const folders = [
  ["inbox", "Inbox", Inbox], ["sent", "Sent", Send], ["drafts", "Drafts", PenLine],
  ["archive", "Archive", Archive], ["spam", "Spam", CircleAlert], ["trash", "Trash", Trash2],
] as const;

export default async function MailPage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, workspace } = await requireWorkspace();
  const profile = getWorkspaceProfile(workspace);
  const folder = folders.some(([key]) => key === params.folder) ? params.folder! : "inbox";

  const { data: mailbox } = await supabase.from("orbit_mailboxes")
    .select("id,address,display_name,provider,status,inbound_enabled,outbound_enabled,last_synced_at,last_error")
    .eq("workspace_id", workspace.id).order("created_at", { ascending:true }).limit(1).maybeSingle();

  const { data: threadRows } = mailbox ? await supabase.from("orbit_mail_threads")
    .select("id,subject,participant_emails,folder,is_unread,is_starred,business_context_type,latest_message_at")
    .eq("workspace_id", workspace.id).eq("mailbox_id", mailbox.id).eq("folder", folder)
    .order("latest_message_at", { ascending:false }).limit(80) : { data: [] };
  const threads = (threadRows ?? []) as Thread[];
  const selectedId = params.thread ?? threads[0]?.id;
  const selected = threads.find((item) => item.id === selectedId) ?? null;
  const { data: messageRows } = selectedId ? await supabase.from("orbit_mail_messages")
    .select("id,direction,from_address,to_addresses,subject,body_text,status,authority_level,sent_at,received_at,created_at")
    .eq("workspace_id", workspace.id).eq("thread_id", selectedId).order("created_at", { ascending:true }) : { data: [] };
  const messages = (messageRows ?? []) as Message[];
  const unread = threads.filter((thread) => thread.is_unread).length;
  const connected = mailbox?.status === "connected";
  const providerLabel = mailbox?.provider === "namecheap_private_email" ? "Namecheap Private Email" : mailbox?.provider ?? "Mail provider";

  return <main className={styles.page}>
    <header className={styles.header}>
      <div><span className={styles.kicker}>{profile.experience === "apex" ? "Apex communications" : "Organisation communications"}</span><h1>Mail</h1><p>Business email, conversations and operational context inside the workspace.</p></div>
      <Link className={styles.composeButton} href="/dashboard/mail?compose=1"><PenLine size={16}/> Compose</Link>
    </header>
    <Notice error={params.error} notice={params.notice}/>

    <section className={`${styles.connection} ${connected ? styles.connected : styles.pending}`}>
      <div className={styles.connectionIcon}>{connected ? <ShieldCheck size={20}/> : <Mail size={20}/>}</div>
      <div><strong>{mailbox?.address ?? "No mailbox configured"}</strong><span>{connected ? `${providerLabel} · inbound and outbound connector active` : `${providerLabel} · secure connector awaiting mailbox credentials`}</span></div>
      <div className={styles.connectionMeta}><b>{connected ? "Connected" : "Setup required"}</b><small>{mailbox?.last_synced_at ? `Last sync ${new Date(mailbox.last_synced_at).toLocaleString()}` : "No mail has been synced yet"}</small></div>
    </section>

    <div className={styles.mailShell}>
      <aside className={styles.sidebar}>
        <div className={styles.folderList}>{folders.map(([key,label,Icon]) => <Link key={key} href={`/dashboard/mail?folder=${key}`} className={folder===key?styles.activeFolder:""}><Icon size={16}/><span>{label}</span>{key==="inbox" && unread>0?<b>{unread}</b>:null}</Link>)}</div>
        <div className={styles.authority}><strong>Orbit mail authority</strong><span><i className={styles.green}/> Green · classify & link</span><span><i className={styles.amber}/> Amber · draft / approved send</span><span><i className={styles.red}/> Red · founder approval</span></div>
      </aside>

      <section className={styles.threadList}>
        <div className={styles.search}><Search size={15}/><span>Search mail</span></div>
        <div className={styles.listHeader}><strong>{folder[0]?.toUpperCase()+folder.slice(1)}</strong><span>{threads.length}</span></div>
        {threads.length ? threads.map((thread) => <Link className={`${styles.thread} ${thread.id===selectedId?styles.selected:""}`} key={thread.id} href={`/dashboard/mail?folder=${folder}&thread=${thread.id}`}>
          <div className={styles.threadTop}><strong>{thread.participant_emails[0] ?? mailbox?.address ?? "Mail"}</strong>{thread.is_starred?<Star size={13} fill="currentColor"/>:null}</div>
          <h3>{thread.subject}</h3><p>{thread.business_context_type ? `Linked to ${thread.business_context_type}` : "Unlinked conversation"}</p>
          <time>{new Date(thread.latest_message_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</time>
          {thread.is_unread?<i className={styles.unreadDot}/>:null}
        </Link>) : <div className={styles.empty}><Mail size={25}/><strong>No {folder} mail yet</strong><p>{connected ? "New conversations will appear here." : "Connect the existing business mailbox to begin syncing conversations."}</p></div>}
      </section>

      <section className={styles.reader}>
        {params.compose === "1" ? <Compose address={mailbox?.address ?? ""} connected={connected}/> : selected ? <>
          <div className={styles.readerHeader}><div><span>{selected.business_context_type ? `Linked · ${selected.business_context_type}` : "Business conversation"}</span><h2>{selected.subject}</h2><p>{selected.participant_emails.join(", ")}</p></div><button aria-label="Archive"><Archive size={17}/></button></div>
          <div className={styles.messages}>{messages.map((message) => <article className={message.direction==="outbound"||message.direction==="draft"?styles.outbound:styles.inbound} key={message.id}>
            <div><strong>{message.direction==="inbound"?message.from_address:(mailbox?.display_name||message.from_address)}</strong><span>{message.status} · {message.authority_level}</span></div>
            <p>{message.body_text || "(Empty message)"}</p><time>{new Date(message.sent_at??message.received_at??message.created_at).toLocaleString()}</time>
          </article>)}</div>
          <Link className={styles.replyButton} href={`/dashboard/mail?compose=1&thread=${selected.id}`}>Reply</Link>
        </> : <div className={styles.readerEmpty}><Mail size={34}/><h2>Your business mailbox lives here.</h2><p>Select a conversation, or compose a message. Orbit keeps mail inside the same workspace as forms, leads, dispatch work and revenue.</p></div>}
      </section>
    </div>
  </main>;
}

function Compose({ address, connected }: { address:string; connected:boolean }) {
  return <div className={styles.compose}>
    <div><span>New message</span><h2>Compose</h2><p>From {address || "workspace mailbox"}</p></div>
    <form>
      <label><span>To</span><input name="to" type="text" placeholder="carrier@example.com" required/></label>
      <label><span>Subject</span><input name="subject" type="text" placeholder="Subject"/></label>
      <label className={styles.bodyField}><span>Message</span><textarea name="body" rows={12} placeholder="Write your message…" required/></label>
      <label><span>Authority</span><select name="authority" defaultValue="amber"><option value="amber">Amber · approved business communication</option><option value="red">Red · sensitive / founder approval</option></select></label>
      <div className={styles.composeActions}>
        <button formAction={saveMailDraft} className={styles.secondaryButton}>Save draft</button>
        <button formAction={requestMailSend} className={styles.sendButton}>{connected ? "Queue send" : "Save until connected"}<Send size={15}/></button>
      </div>
    </form>
  </div>;
}
