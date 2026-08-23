import type { Metadata } from "next";
import Link from "next/link";
import {
  Archive,
  ArrowRight,
  BarChart3,
  Bot,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  FileText,
  Inbox,
  LockKeyhole,
  Mail,
  PenLine,
  PlugZap,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Tags,
  Trash2,
  UsersRound,
  WandSparkles,
  Workflow,
  Zap,
} from "lucide-react";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/workspace";
import { getWorkspaceProfile } from "@/lib/workspace-profile";
import { getRelayRecommendations } from "@/lib/relay/recommendations";
import {
  connectNamecheapMailbox,
  disconnectRelayMailbox,
  requestMailSend,
  saveMailDraft,
  syncRelayMailbox,
} from "./actions";
import styles from "./mail.module.css";
import relay from "./relay-auth.module.css";

export const metadata: Metadata = {
  title: "Relay · Orbit",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{
    folder?: string;
    compose?: string;
    thread?: string;
    view?: string;
    mailbox?: string;
    connect?: string;
    error?: string;
    notice?: string;
  }>;
};

type Mailbox = {
  id: string;
  address: string;
  display_name: string;
  provider: string;
  status: string;
  inbound_enabled: boolean;
  outbound_enabled: boolean;
  last_synced_at: string | null;
  last_error: string | null;
  connection_health: string;
  last_connection_test_at: string | null;
  is_primary: boolean;
};

type Thread = {
  id: string;
  subject: string;
  participant_emails: string[];
  folder: string;
  is_unread: boolean;
  is_starred: boolean;
  business_context_type: string | null;
  latest_message_at: string;
};

type Message = {
  id: string;
  direction: string;
  from_address: string;
  to_addresses: string[];
  subject: string;
  body_text: string;
  status: string;
  authority_level: string;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
};

const folders = [
  ["inbox", "Inbox", Inbox],
  ["sent", "Sent", Send],
  ["drafts", "Drafts", PenLine],
  ["archive", "Archive", Archive],
  ["spam", "Spam", CircleAlert],
  ["trash", "Trash", Trash2],
] as const;

const relayViews = [
  ["mail", "Inbox", Inbox],
  ["automations", "Automations", Workflow],
  ["templates", "Templates", FileText],
  ["connectors", "Connectors", PlugZap],
  ["analytics", "Analytics", BarChart3],
] as const;

function withMailbox(href: string, mailboxId?: string | null) {
  if (!mailboxId) return href;
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("mailbox", mailboxId);
  return `${path}?${params.toString()}`;
}

export default async function RelayPage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, workspace, role } = await requireWorkspace();
  const profile = getWorkspaceProfile(workspace);
  const canManageMailboxes = ["owner", "admin", "founder"].includes(role);
  const view = relayViews.some(([key]) => key === params.view) ? params.view! : "mail";
  const folder = folders.some(([key]) => key === params.folder) ? params.folder! : "inbox";

  const { data: mailboxRows } = await supabase
    .from("orbit_mailboxes")
    .select("id,address,display_name,provider,status,inbound_enabled,outbound_enabled,last_synced_at,last_error,connection_health,last_connection_test_at,is_primary")
    .eq("workspace_id", workspace.id)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  const mailboxes = (mailboxRows ?? []) as Mailbox[];
  const selectedMailbox =
    mailboxes.find((item) => item.id === params.mailbox) ??
    mailboxes.find((item) => item.status === "connected") ??
    mailboxes[0] ??
    null;

  const { data: threadRows } = selectedMailbox && view === "mail"
    ? await supabase
        .from("orbit_mail_threads")
        .select("id,subject,participant_emails,folder,is_unread,is_starred,business_context_type,latest_message_at")
        .eq("workspace_id", workspace.id)
        .eq("mailbox_id", selectedMailbox.id)
        .eq("folder", folder)
        .order("latest_message_at", { ascending: false })
        .limit(80)
    : { data: [] };
  const threads = (threadRows ?? []) as Thread[];
  const selectedId = params.thread ?? threads[0]?.id;
  const selected = threads.find((item) => item.id === selectedId) ?? null;
  const { data: messageRows } = selectedId && view === "mail"
    ? await supabase
        .from("orbit_mail_messages")
        .select("id,direction,from_address,to_addresses,subject,body_text,status,authority_level,sent_at,received_at,created_at")
        .eq("workspace_id", workspace.id)
        .eq("thread_id", selectedId)
        .order("created_at", { ascending: true })
    : { data: [] };
  const messages = (messageRows ?? []) as Message[];
  const unread = threads.filter((thread) => thread.is_unread).length;
  const connected = selectedMailbox?.status === "connected";
  const providerLabel = selectedMailbox?.provider === "namecheap_private_email"
    ? "Namecheap Private Email"
    : selectedMailbox?.provider ?? "Mail provider";
  const recommendations = await getRelayRecommendations({
    supabase,
    workspaceId: workspace.id,
    mailboxId: selectedMailbox?.id,
    mailboxConnected: Boolean(connected),
    lastSyncedAt: selectedMailbox?.last_synced_at,
  });

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>
            {profile.experience === "apex" ? "Apex communications" : "Organisation communications"}
          </span>
          <h1>Relay</h1>
          <p>Choose a business mailbox. Orbit turns its conversations into priorities, context and next actions.</p>
        </div>
        <Link
          className={styles.composeButton}
          href={withMailbox("/dashboard/mail?view=mail&compose=1", selectedMailbox?.id)}
        >
          <PenLine size={16} /> Compose
        </Link>
      </header>

      <MailboxStrip mailboxes={mailboxes} selectedMailbox={selectedMailbox} />

      <nav className={styles.productNav} aria-label="Relay sections">
        {relayViews.map(([key, label, Icon]) => (
          <Link
            key={key}
            href={withMailbox(`/dashboard/mail?view=${key}`, selectedMailbox?.id)}
            className={view === key ? styles.productNavActive : ""}
          >
            <Icon size={15} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <Notice error={params.error} notice={params.notice} />

      {view === "connectors" ? (
        <ConnectorWorkspace
          mailboxes={mailboxes}
          selectedMailbox={selectedMailbox}
          canManage={canManageMailboxes}
          showConnect={params.connect === "1" || !mailboxes.length}
        />
      ) : view === "mail" ? (
        <>
          <ConnectionStatus mailbox={selectedMailbox} providerLabel={providerLabel} />

          {selectedMailbox ? (
            <section className={relay.orbitBrief}>
              <div className={relay.briefIntro}>
                <span><Sparkles size={15} /> Orbit Brief</span>
                <h2>What should happen next in {selectedMailbox.address}?</h2>
                <p>Orbit combines mailbox pressure with forms, lead follow-ups and business context.</p>
              </div>
              <div className={relay.recommendations}>
                {recommendations.map((item) => (
                  <Link key={item.id} href={item.href} className={relay.recommendation}>
                    <i data-priority={item.priority} />
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.reason}</span>
                    </div>
                    <b>{item.actionLabel}<ArrowRight size={13} /></b>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <div className={styles.mailShell}>
            <aside className={styles.sidebar}>
              <div className={styles.folderList}>
                {folders.map(([key, label, Icon]) => (
                  <Link
                    key={key}
                    href={withMailbox(`/dashboard/mail?view=mail&folder=${key}`, selectedMailbox?.id)}
                    className={folder === key ? styles.activeFolder : ""}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                    {key === "inbox" && unread > 0 ? <b>{unread}</b> : null}
                  </Link>
                ))}
              </div>
              <div className={styles.authority}>
                <strong>Relay authority</strong>
                <span><i className={styles.green} /> Green · classify & link</span>
                <span><i className={styles.amber} /> Amber · draft / approved send</span>
                <span><i className={styles.red} /> Red · founder approval</span>
              </div>
            </aside>

            <section className={styles.threadList}>
              <div className={styles.search}><Search size={15} /><span>Search conversations</span></div>
              <div className={styles.listHeader}><strong>{folder[0]?.toUpperCase() + folder.slice(1)}</strong><span>{threads.length}</span></div>
              {threads.length ? threads.map((thread) => (
                <Link
                  className={`${styles.thread} ${thread.id === selectedId ? styles.selected : ""}`}
                  key={thread.id}
                  href={withMailbox(`/dashboard/mail?view=mail&folder=${folder}&thread=${thread.id}`, selectedMailbox?.id)}
                >
                  <div className={styles.threadTop}>
                    <strong>{thread.participant_emails[0] ?? selectedMailbox?.address ?? "Relay"}</strong>
                    {thread.is_starred ? <Star size={13} fill="currentColor" /> : null}
                  </div>
                  <h3>{thread.subject}</h3>
                  <p>{thread.business_context_type ? `Linked to ${thread.business_context_type}` : "Unlinked conversation"}</p>
                  <time>{new Date(thread.latest_message_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time>
                  {thread.is_unread ? <i className={styles.unreadDot} /> : null}
                </Link>
              )) : (
                <div className={styles.empty}>
                  <Mail size={25} />
                  <strong>No {folder} conversations yet</strong>
                  <p>{connected ? "Sync the mailbox to pull new conversations." : "Authenticate this mailbox to start syncing."}</p>
                </div>
              )}
            </section>

            <section className={styles.reader}>
              {params.compose === "1" && selectedMailbox ? (
                <Compose mailbox={selectedMailbox} />
              ) : selected ? (
                <>
                  <div className={styles.readerHeader}>
                    <div>
                      <span>{selected.business_context_type ? `Linked · ${selected.business_context_type}` : "Business conversation"}</span>
                      <h2>{selected.subject}</h2>
                      <p>{selected.participant_emails.join(", ")}</p>
                    </div>
                    <button aria-label="Archive"><Archive size={17} /></button>
                  </div>
                  <div className={styles.messages}>
                    {messages.map((message) => (
                      <article
                        className={message.direction === "outbound" || message.direction === "draft" ? styles.outbound : styles.inbound}
                        key={message.id}
                      >
                        <div>
                          <strong>{message.direction === "inbound" ? message.from_address : selectedMailbox.display_name || message.from_address}</strong>
                          <span>{message.status} · {message.authority_level}</span>
                        </div>
                        <p>{message.body_text || "(Empty message)"}</p>
                        <time>{new Date(message.sent_at ?? message.received_at ?? message.created_at).toLocaleString()}</time>
                      </article>
                    ))}
                  </div>
                  <Link
                    className={styles.replyButton}
                    href={withMailbox(`/dashboard/mail?view=mail&compose=1&thread=${selected.id}`, selectedMailbox.id)}
                  >
                    Reply
                  </Link>
                </>
              ) : selectedMailbox ? (
                <RelayHome mailbox={selectedMailbox} />
              ) : (
                <div className={styles.readerEmpty}>
                  <PlugZap size={34} />
                  <h2>Connect a business mailbox first.</h2>
                  <p>Relay is designed around a selected business identity, not a generic inbox.</p>
                  <Link className={styles.replyButton} href="/dashboard/mail?view=connectors&connect=1">Connect Namecheap email</Link>
                </div>
              )}
            </section>
          </div>
        </>
      ) : (
        <RelayWorkspace view={view} mailbox={selectedMailbox} />
      )}
    </main>
  );
}

function MailboxStrip({ mailboxes, selectedMailbox }: { mailboxes: Mailbox[]; selectedMailbox: Mailbox | null }) {
  return (
    <section className={relay.mailboxStrip} aria-label="Business mailboxes">
      <div className={relay.mailboxStripLabel}>
        <Mail size={15} />
        <span>Business mailboxes</span>
      </div>
      <div className={relay.mailboxChoices}>
        {mailboxes.map((mailbox) => (
          <Link
            key={mailbox.id}
            href={`/dashboard/mail?view=mail&mailbox=${mailbox.id}`}
            className={mailbox.id === selectedMailbox?.id ? relay.mailboxActive : ""}
          >
            <i data-health={mailbox.connection_health} />
            <span>{mailbox.address}</span>
            {mailbox.is_primary ? <b>Primary</b> : null}
          </Link>
        ))}
        <Link className={relay.addMailbox} href="/dashboard/mail?view=connectors&connect=1">
          + Connect mailbox
        </Link>
      </div>
    </section>
  );
}

function ConnectionStatus({ mailbox, providerLabel }: { mailbox: Mailbox | null; providerLabel: string }) {
  if (!mailbox) return null;
  const connected = mailbox.status === "connected";
  return (
    <section className={`${styles.connection} ${connected ? styles.connected : styles.pending}`}>
      <div className={styles.connectionIcon}>{connected ? <ShieldCheck size={20} /> : <Mail size={20} />}</div>
      <div>
        <strong>{mailbox.address}</strong>
        <span>{providerLabel} · {connected ? "authenticated IMAP + SMTP" : "authentication required"}</span>
      </div>
      <div className={styles.connectionMeta}>
        <b>{connected ? (mailbox.connection_health === "healthy" ? "Healthy" : "Connected") : "Setup required"}</b>
        <small>{mailbox.last_synced_at ? `Last sync ${new Date(mailbox.last_synced_at).toLocaleString()}` : "No successful sync yet"}</small>
      </div>
      {connected ? (
        <form action={syncRelayMailbox} className={relay.inlineAction}>
          <input type="hidden" name="mailbox_id" value={mailbox.id} />
          <button type="submit"><RefreshCw size={14} /> Sync now</button>
        </form>
      ) : null}
    </section>
  );
}

function ConnectorWorkspace({
  mailboxes,
  selectedMailbox,
  canManage,
  showConnect,
}: {
  mailboxes: Mailbox[];
  selectedMailbox: Mailbox | null;
  canManage: boolean;
  showConnect: boolean;
}) {
  return (
    <section className={relay.connectorWorkspace}>
      <div className={relay.connectorHero}>
        <span><PlugZap size={15} /> Relay mailbox authentication</span>
        <h2>Connect every business email once. Operate them from one place.</h2>
        <p>Namecheap Private Email is connected directly through encrypted IMAP and SMTP. Each mailbox keeps its own identity, history and Orbit recommendations.</p>
        <div className={relay.serverFacts}>
          <span><LockKeyhole size={14} /> Credentials encrypted server-side</span>
          <span>IMAP · mail.privateemail.com:993 · SSL/TLS</span>
          <span>SMTP · mail.privateemail.com:465 · SSL/TLS</span>
        </div>
      </div>

      <div className={relay.connectorGrid}>
        <div className={relay.connectedList}>
          <div className={relay.sectionHeading}>
            <div><span>Connected identities</span><h3>{mailboxes.length} business mailbox{mailboxes.length === 1 ? "" : "es"}</h3></div>
            {canManage ? <Link href="/dashboard/mail?view=connectors&connect=1">Connect another</Link> : null}
          </div>
          {mailboxes.length ? mailboxes.map((mailbox) => (
            <article key={mailbox.id} className={relay.mailboxCard}>
              <div className={relay.mailboxCardIcon}><Mail size={19} /></div>
              <div>
                <strong>{mailbox.address}</strong>
                <span>{mailbox.display_name || "Business mailbox"}</span>
                <small>{mailbox.status === "connected" ? "Namecheap authenticated" : "Authentication required"}</small>
              </div>
              <div className={relay.mailboxCardActions}>
                <Link href={`/dashboard/mail?view=mail&mailbox=${mailbox.id}`}>Open</Link>
                {canManage && mailbox.status === "connected" ? (
                  <form action={disconnectRelayMailbox}>
                    <input type="hidden" name="mailbox_id" value={mailbox.id} />
                    <button type="submit">Disconnect</button>
                  </form>
                ) : canManage ? (
                  <Link href={`/dashboard/mail?view=connectors&connect=1&mailbox=${mailbox.id}`}>Authenticate</Link>
                ) : null}
              </div>
            </article>
          )) : (
            <div className={relay.emptyConnector}>No business mailbox is authenticated yet.</div>
          )}
        </div>

        {showConnect && canManage ? (
          <form action={connectNamecheapMailbox} className={relay.connectForm}>
            <span>Connect Namecheap Private Email</span>
            <h3>Authenticate a business mailbox</h3>
            <p>Use the full mailbox address and that mailbox’s Namecheap Private Email password.</p>
            <label>
              <span>Business email</span>
              <input
                type="email"
                name="email"
                defaultValue={selectedMailbox?.status !== "connected" ? selectedMailbox?.address ?? "" : ""}
                placeholder="info@company.com"
                autoComplete="username"
                required
              />
            </label>
            <label>
              <span>Sender / team name</span>
              <input
                type="text"
                name="display_name"
                defaultValue={selectedMailbox?.status !== "connected" ? selectedMailbox?.display_name ?? "" : ""}
                placeholder="Company or department"
              />
            </label>
            <label>
              <span>Mailbox password</span>
              <input type="password" name="password" placeholder="Private Email password" autoComplete="current-password" required />
            </label>
            <div className={relay.connectSecurity}>
              <ShieldCheck size={16} />
              <span>Orbit verifies IMAP and SMTP before storing an encrypted credential.</span>
            </div>
            <button type="submit" className={relay.connectButton}>
              Verify & connect <ArrowRight size={15} />
            </button>
          </form>
        ) : (
          <div className={relay.connectForm}>
            <span>Namecheap Private Email</span>
            <h3>{canManage ? "Add another mailbox when needed" : "Admin permission required"}</h3>
            <p>{canManage ? "Each mailbox is authenticated independently so identities never leak across accounts." : "Only workspace owners and admins can add or change mailbox credentials."}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function RelayHome({ mailbox }: { mailbox: Mailbox }) {
  const tools = [
    [WandSparkles, "Orbit Assistant", "Summarize the conversation, identify intent and propose the next business action.", "Context live"],
    [Tags, "Smart Context", "Match conversations to forms, leads and business records automatically.", "Live"],
    [UsersRound, "Shared Work", "Make ownership and response accountability clear for the team.", "Ready"],
    [CalendarClock, "Follow-ups", "Turn messages into reminders, scheduled responses and controlled sequences.", "Ready"],
    [FileText, "Templates", "Use approved replies, onboarding messages, document requests and signatures.", "Ready"],
    [Workflow, "Automation", "Route routine work automatically while sensitive communication keeps approval gates.", "Ready"],
  ] as const;

  return (
    <div className={styles.relayHome}>
      <div className={styles.heroPanel}>
        <span><Sparkles size={15} /> Selected business identity</span>
        <h2>{mailbox.address}</h2>
        <p>Relay treats this mailbox as an operating channel, not just an inbox. Orbit can connect conversations to the work they should create.</p>
        <b>{mailbox.status === "connected" ? "Authenticated · business intelligence active" : "Authentication required"}</b>
      </div>
      <div className={relay.toolGrid}>
        {tools.map(([Icon, title, text, status]) => (
          <article key={title}>
            <span className={relay.toolIcon}><Icon size={18} /></span>
            <div><h3>{title}</h3><p>{text}</p></div>
            <b>{status}</b>
          </article>
        ))}
      </div>
    </div>
  );
}

function RelayWorkspace({ view, mailbox }: { view: string; mailbox: Mailbox | null }) {
  const content: Record<string, { eyebrow: string; title: string; copy: string; items: [string, string][] }> = {
    automations: {
      eyebrow: "Relay automation",
      title: "Communication flows with controlled authority.",
      copy: "Automation is scoped to the selected business mailbox so teams can reduce repetitive work without losing control.",
      items: [
        ["Smart routing", "Classify sender and intent, then route to the right owner."],
        ["Follow-up engine", "Create reminders and future sequences when a reply is missing."],
        ["Approval queue", "Amber and Red messages wait for the correct human authority."],
        ["Orbit hooks", "Trigger lead, sales, dispatch, finance or calendar actions from communication events."],
      ],
    },
    templates: {
      eyebrow: "Relay library",
      title: "Reusable communication standards for the selected mailbox.",
      copy: "One library for templates, snippets, signatures and personalization.",
      items: [
        ["Templates", "Onboarding, proposals, document requests, payment reminders and support."],
        ["Snippets", "Fast approved answers for repeated operational questions."],
        ["Signatures", "Workspace, department and individual sender identities."],
        ["Variables", "Names, company, equipment, project, offer and CRM data placeholders."],
      ],
    },
    analytics: {
      eyebrow: "Founder visibility",
      title: "See communication health, not just email counts.",
      copy: "Analytics is designed around business response quality and operational risk.",
      items: [
        ["Response health", "Unanswered conversations, response time and workload."],
        ["Conversion", "Understand which conversations progress leads and customers."],
        ["Deliverability", "Delivery, bounce, sender reputation, SPF, DKIM and DMARC health."],
        ["Audit", "Who drafted, edited, approved and sent every governed message."],
      ],
    },
  };
  const data = content[view] ?? content.automations;
  return (
    <section className={styles.workspacePanel}>
      <div className={styles.workspaceIntro}>
        <span>{data.eyebrow}</span>
        <h2>{data.title}</h2>
        <p>{data.copy}</p>
        <b>{mailbox ? `Selected · ${mailbox.address}` : "Choose or connect a mailbox first"}</b>
      </div>
      <div className={styles.workspaceGrid}>
        {data.items.map(([title, text]) => (
          <article key={title}>
            <div className={styles.featureDot} />
            <h3>{title}</h3>
            <p>{text}</p>
            <button type="button" disabled>{mailbox ? "Mailbox scoped" : "Select mailbox"}</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Compose({ mailbox }: { mailbox: Mailbox }) {
  const connected = mailbox.status === "connected";
  return (
    <div className={styles.compose}>
      <div><span>New Relay message</span><h2>Compose</h2><p>From {mailbox.address}</p></div>
      <form>
        <input type="hidden" name="mailbox_id" value={mailbox.id} />
        <label><span>To</span><input name="to" type="text" placeholder="carrier@example.com" required /></label>
        <label><span>Subject</span><input name="subject" type="text" placeholder="Subject" /></label>
        <label className={styles.bodyField}><span>Message</span><textarea name="body" rows={12} placeholder="Write your message…" required /></label>
        <label>
          <span>Authority</span>
          <select name="authority" defaultValue="amber">
            <option value="amber">Amber · approved business communication</option>
            <option value="red">Red · sensitive / founder approval</option>
          </select>
        </label>
        <div className={styles.composeActions}>
          <button formAction={saveMailDraft} className={styles.secondaryButton}>Save draft</button>
          <button formAction={requestMailSend} className={styles.sendButton}>
            {connected ? "Queue approved send" : "Save until connected"}<Send size={15} />
          </button>
        </div>
      </form>
    </div>
  );
}
