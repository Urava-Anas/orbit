import type { Metadata } from "next";
import Link from "next/link";
import {
  Archive,
  BarChart3,
  Bot,
  CalendarClock,
  CircleAlert,
  FileText,
  Inbox,
  Mail,
  PenLine,
  PlugZap,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Tags,
  Trash2,
  UsersRound,
  Workflow,
} from "lucide-react";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/workspace";
import { getWorkspaceProfile } from "@/lib/workspace-profile";
import { requestMailSend, saveMailDraft } from "./actions";
import styles from "./mail.module.css";

export const metadata: Metadata = { title: "Relay · Orbit", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ folder?: string; compose?: string; thread?: string; view?: string; error?: string; notice?: string }> };
type Thread = { id:string; subject:string; participant_emails:string[]; folder:string; is_unread:boolean; is_starred:boolean; business_context_type:string|null; latest_message_at:string };
type Message = { id:string; direction:string; from_address:string; to_addresses:string[]; subject:string; body_text:string; status:string; authority_level:string; sent_at:string|null; received_at:string|null; created_at:string };

const folders = [
  ["inbox", "Inbox", Inbox], ["sent", "Sent", Send], ["drafts", "Drafts", PenLine],
  ["archive", "Archive", Archive], ["spam", "Spam", CircleAlert], ["trash", "Trash", Trash2],
] as const;

const relayViews = [
  ["mail", "Inbox", Inbox],
  ["automations", "Automations", Workflow],
  ["templates", "Templates", FileText],
  ["connectors", "Connectors", PlugZap],
  ["analytics", "Analytics", BarChart3],
] as const;

export default async function MailPage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, workspace } = await requireWorkspace();
  const profile = getWorkspaceProfile(workspace);
  const view = relayViews.some(([key]) => key === params.view) ? params.view! : "mail";
  const folder = folders.some(([key]) => key === params.folder) ? params.folder! : "inbox";

  const { data: mailbox } = await supabase.from("orbit_mailboxes")
    .select("id,address,display_name,provider,status,inbound_enabled,outbound_enabled,last_synced_at,last_error")
    .eq("workspace_id", workspace.id).order("created_at", { ascending:true }).limit(1).maybeSingle();

  const { data: threadRows } = mailbox && view === "mail" ? await supabase.from("orbit_mail_threads")
    .select("id,subject,participant_emails,folder,is_unread,is_starred,business_context_type,latest_message_at")
    .eq("workspace_id", workspace.id).eq("mailbox_id", mailbox.id).eq("folder", folder)
    .order("latest_message_at", { ascending:false }).limit(80) : { data: [] };
  const threads = (threadRows ?? []) as Thread[];
  const selectedId = params.thread ?? threads[0]?.id;
  const selected = threads.find((item) => item.id === selectedId) ?? null;
  const { data: messageRows } = selectedId && view === "mail" ? await supabase.from("orbit_mail_messages")
    .select("id,direction,from_address,to_addresses,subject,body_text,status,authority_level,sent_at,received_at,created_at")
    .eq("workspace_id", workspace.id).eq("thread_id", selectedId).order("created_at", { ascending:true }) : { data: [] };
  const messages = (messageRows ?? []) as Message[];
  const unread = threads.filter((thread) => thread.is_unread).length;
  const connected = mailbox?.status === "connected";
  const providerLabel = mailbox?.provider === "namecheap_private_email" ? "Namecheap Private Email" : mailbox?.provider ?? "Mail provider";

  return <main className={styles.page}>
    <header className={styles.header}>
      <div><span className={styles.kicker}>{profile.experience === "apex" ? "Apex communications" : "Organisation communications"}</span><h1>Relay</h1><p>One control layer for business conversations, AI assistance, approvals, follow-ups and connected communication providers.</p></div>
      <Link className={styles.composeButton} href="/dashboard/mail?view=mail&compose=1"><PenLine size={16}/> Compose</Link>
    </header>

    <nav className={styles.productNav} aria-label="Relay sections">
      {relayViews.map(([key,label,Icon]) => <Link key={key} href={`/dashboard/mail?view=${key}`} className={view===key?styles.productNavActive:""}><Icon size={15}/><span>{label}</span></Link>)}
    </nav>

    <Notice error={params.error} notice={params.notice}/>

    {view === "mail" ? <>
      <section className={`${styles.connection} ${connected ? styles.connected : styles.pending}`}>
        <div className={styles.connectionIcon}>{connected ? <ShieldCheck size={20}/> : <Mail size={20}/>}</div>
        <div><strong>{mailbox?.address ?? "No mailbox configured"}</strong><span>{connected ? `${providerLabel} · inbound and outbound connector active` : `${providerLabel} · Relay is ready for backend connection`}</span></div>
        <div className={styles.connectionMeta}><b>{connected ? "Connected" : "Backend later"}</b><small>{mailbox?.last_synced_at ? `Last sync ${new Date(mailbox.last_synced_at).toLocaleString()}` : "Product surface is ready; no sync is running"}</small></div>
      </section>

      <div className={styles.mailShell}>
        <aside className={styles.sidebar}>
          <div className={styles.folderList}>{folders.map(([key,label,Icon]) => <Link key={key} href={`/dashboard/mail?view=mail&folder=${key}`} className={folder===key?styles.activeFolder:""}><Icon size={16}/><span>{label}</span>{key==="inbox" && unread>0?<b>{unread}</b>:null}</Link>)}</div>
          <div className={styles.authority}><strong>Relay authority</strong><span><i className={styles.green}/> Green · classify & link</span><span><i className={styles.amber}/> Amber · draft / approved send</span><span><i className={styles.red}/> Red · founder approval</span></div>
        </aside>

        <section className={styles.threadList}>
          <div className={styles.search}><Search size={15}/><span>Search conversations</span></div>
          <div className={styles.listHeader}><strong>{folder[0]?.toUpperCase()+folder.slice(1)}</strong><span>{threads.length}</span></div>
          {threads.length ? threads.map((thread) => <Link className={`${styles.thread} ${thread.id===selectedId?styles.selected:""}`} key={thread.id} href={`/dashboard/mail?view=mail&folder=${folder}&thread=${thread.id}`}>
            <div className={styles.threadTop}><strong>{thread.participant_emails[0] ?? mailbox?.address ?? "Relay"}</strong>{thread.is_starred?<Star size={13} fill="currentColor"/>:null}</div>
            <h3>{thread.subject}</h3><p>{thread.business_context_type ? `Linked to ${thread.business_context_type}` : "Unlinked conversation"}</p>
            <time>{new Date(thread.latest_message_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</time>
            {thread.is_unread?<i className={styles.unreadDot}/>:null}
          </Link>) : <div className={styles.empty}><Mail size={25}/><strong>No {folder} conversations yet</strong><p>{connected ? "New conversations will appear here." : "Connect a provider later; Relay's workspace UX is already ready."}</p></div>}
        </section>

        <section className={styles.reader}>
          {params.compose === "1" ? <Compose address={mailbox?.address ?? ""} connected={connected}/> : selected ? <>
            <div className={styles.readerHeader}><div><span>{selected.business_context_type ? `Linked · ${selected.business_context_type}` : "Business conversation"}</span><h2>{selected.subject}</h2><p>{selected.participant_emails.join(", ")}</p></div><button aria-label="Archive"><Archive size={17}/></button></div>
            <div className={styles.messages}>{messages.map((message) => <article className={message.direction==="outbound"||message.direction==="draft"?styles.outbound:styles.inbound} key={message.id}>
              <div><strong>{message.direction==="inbound"?message.from_address:(mailbox?.display_name||message.from_address)}</strong><span>{message.status} · {message.authority_level}</span></div>
              <p>{message.body_text || "(Empty message)"}</p><time>{new Date(message.sent_at??message.received_at??message.created_at).toLocaleString()}</time>
            </article>)}</div>
            <Link className={styles.replyButton} href={`/dashboard/mail?view=mail&compose=1&thread=${selected.id}`}>Reply</Link>
          </> : <RelayHome connected={connected}/>} 
        </section>
      </div>
    </> : <RelayWorkspace view={view}/>} 
  </main>;
}

function RelayHome({ connected }: { connected:boolean }) {
  return <div className={styles.relayHome}>
    <div className={styles.heroPanel}><span><Sparkles size={15}/> Communication control layer</span><h2>Relay understands the business behind every message.</h2><p>Forms, leads, carriers, clients, dispatch work, finance and future channels can all converge into one governed conversation system.</p><b>{connected ? "Mailbox connected" : "Frontend complete · backend connector comes later"}</b></div>
    <div className={styles.capabilityGrid}>
      <Capability icon={<Bot size={18}/>} title="AI Assist" text="Summaries, reply drafts, extraction and next-action suggestions."/>
      <Capability icon={<Tags size={18}/>} title="Smart Context" text="Link messages to leads, carriers, projects, invoices and forms."/>
      <Capability icon={<UsersRound size={18}/>} title="Shared Inbox" text="Team ownership, assignments, permissions and response accountability."/>
      <Capability icon={<CalendarClock size={18}/>} title="Follow-ups" text="Snooze, reminders, scheduled sends and controlled sequences."/>
    </div>
  </div>;
}

function RelayWorkspace({ view }: { view:string }) {
  const content: Record<string,{eyebrow:string;title:string;copy:string;items:[string,string][]}> = {
    automations: { eyebrow:"Relay automation", title:"Communication flows with controlled authority.", copy:"Design the workflow now; provider execution plugs in later.", items:[["Smart routing","Classify sender and intent, then route to the right owner."],["Follow-up engine","Create reminders and future sequences when a reply is missing."],["Approval queue","Amber and Red messages wait for the correct human authority."],["Orbit hooks","Trigger lead, sales, dispatch, finance or calendar actions from communication events."]] },
    templates: { eyebrow:"Relay library", title:"Reusable communication standards for the whole workspace.", copy:"One library for templates, snippets, signatures and personalization.", items:[["Templates","Onboarding, proposals, document requests, payment reminders and support."],["Snippets","Fast approved answers for repeated operational questions."],["Signatures","Workspace, department and individual sender identities."],["Variables","Names, company, equipment, project, offer and CRM data placeholders."]] },
    connectors: { eyebrow:"Provider layer", title:"Connect the provider. Keep Relay unchanged.", copy:"Relay is provider-agnostic so the backend can be connected later without redesigning the product.", items:[["Business mailboxes","Gmail, Microsoft 365, IMAP/SMTP and Namecheap Private Email."],["Sending providers","Resend, Postmark, SendGrid, Mailgun and Amazon SES."],["Business systems","Forms, Lead Engine, Sales, Dispatch, Finance and Calendar."],["Developer layer","Webhooks and API events for future channels and automations."]] },
    analytics: { eyebrow:"Founder visibility", title:"See communication health, not just email counts.", copy:"Analytics is designed around business response quality and operational risk.", items:[["Response health","Unanswered conversations, response time and workload."],["Conversion","Understand which conversations progress leads and customers."],["Deliverability","Delivery, bounce, sender reputation, SPF, DKIM and DMARC health."],["Audit","Who drafted, edited, approved and sent every governed message."]] },
  };
  const data = content[view] ?? content.connectors;
  return <section className={styles.workspacePanel}>
    <div className={styles.workspaceIntro}><span>{data.eyebrow}</span><h2>{data.title}</h2><p>{data.copy}</p><b>Product surface ready · backend connection later</b></div>
    <div className={styles.workspaceGrid}>{data.items.map(([title,text]) => <article key={title}><div className={styles.featureDot}/><h3>{title}</h3><p>{text}</p><button type="button" disabled>Ready to connect</button></article>)}</div>
  </section>;
}

function Capability({ icon,title,text }:{ icon:React.ReactNode;title:string;text:string }) {
  return <article className={styles.capability}><span>{icon}</span><h3>{title}</h3><p>{text}</p></article>;
}

function Compose({ address, connected }: { address:string; connected:boolean }) {
  return <div className={styles.compose}>
    <div><span>New Relay message</span><h2>Compose</h2><p>From {address || "workspace mailbox"}</p></div>
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
