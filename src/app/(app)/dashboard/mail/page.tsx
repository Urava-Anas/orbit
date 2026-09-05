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
  MailOpen,
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
  syncRelayMailbox,
} from "./actions";
import {
  approveAndSendRelayMessageSafe,
  queueRelayMessage,
  returnRelayMessageToDraft,
  saveRelayDraft,
  setRelayMessageRecoveryState,
} from "./message-lifecycle-actions";
import { moveRelayThread, setRelayThreadFlag } from "./conversation-actions";
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
    q?: string;
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
  provider_message_id: string | null;
  internet_message_id: string | null;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
};

const folders = [
  ["inbox", "Inbox", Inbox],
  ["outbox", "Approval Queue", Workflow],
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

function withSearch(href: string, searchQuery?: string) {
  if (!searchQuery) return href;
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("q", searchQuery);
  return `${path}?${params.toString()}`;
}

export default async function RelayPage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, workspace, role } = await requireWorkspace();
  const profile = getWorkspaceProfile(workspace);
  const canManageMailboxes = ["owner", "admin", "founder"].includes(role);
  const view = relayViews.some(([key]) => key === params.view) ? params.view! : "mail";
  const folder = folders.some(([key]) => key === params.folder) ? params.folder! : "inbox";
  const searchQuery = String(params.q ?? "").trim().slice(0, 120);
  const normalizedSearch = searchQuery.toLocaleLowerCase();

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

  let threadRows: Thread[] = [];
  if (selectedMailbox && view === "mail") {
    let threadQuery = supabase
      .from("orbit_mail_threads")
      .select("id,subject,participant_emails,folder,is_unread,is_starred,business_context_type,latest_message_at")
      .eq("workspace_id", workspace.id)
      .eq("mailbox_id", selectedMailbox.id)
      .order("latest_message_at", { ascending: false })
      .limit(searchQuery ? 200 : 80);

    if (!searchQuery) {
      threadQuery = threadQuery.eq("folder", folder);
    }

    const { data } = await threadQuery;
    threadRows = (data ?? []) as Thread[];
  }

  const threads = searchQuery
    ? threadRows.filter((thread) => {
        const haystack = [
          thread.subject,
          ...(thread.participant_emails ?? []),
          thread.business_context_type ?? "",
          thread.folder,
        ]
          .join(" ")
          .toLocaleLowerCase();
        return haystack.includes(normalizedSearch);
      })
    : threadRows;
  const selectedId = params.thread ?? threads[0]?.id;
  const selected = threads.find((item) => item.id === selectedId) ?? null;
  const { data: messageRows } = selectedId && view === "mail"
    ? await supabase
        .from("orbit_mail_messages")
        .select("id,direction,from_address,to_addresses,subject,body_text,status,authority_level,provider_message_id,internet_message_id,sent_at,received_at,created_at,updated_at")
        .eq("workspace_id", workspace.id)
        .eq("mailbox_id", selectedMailbox?.id ?? "")
        .eq("thread_id", selectedId)
        .order("created_at", { ascending: true })
    : { data: [] };
  const messages = (messageRows ?? []) as Message[];
  const draftMessage = selected?.folder === "drafts"
    ? [...messages].reverse().find((message) => message.status === "draft" && message.direction === "draft") ?? null
    : null;
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

      {view === "templates" ? (
        <section className={styles.workspacePanel}>
          <div className={styles.workspaceIntro}>
            <span>Relay Template Studio</span>
            <h2>Build reusable, versioned email systems.</h2>
            <p>Compose from reusable blocks, use Orbit merge variables, preview desktop/mobile, and render from one canonical schema.</p>
            <Link className={styles.replyButton} href="/dashboard/mail/templates">Open Template Studio</Link>
          </div>
        </section>
      ) : view === "connectors" ? (
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
                    className={folder === key && !searchQuery ? styles.activeFolder : ""}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
                    {key === "inbox" && unread > 0 && !searchQuery ? <b>{unread}</b> : null}
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
              <form className={styles.search} method="get">
                <input type="hidden" name="view" value="mail" />
                {selectedMailbox ? <input type="hidden" name="mailbox" value={selectedMailbox.id} /> : null}
                <button type="submit" aria-label="Search conversations"><Search size={15} /></button>
                <input
                  type="search"
                  name="q"
                  defaultValue={searchQuery}
                  placeholder="Search conversations"
                  aria-label="Search this mailbox"
                  maxLength={120}
                />
                {searchQuery ? (
                  <Link href={withMailbox(`/dashboard/mail?view=mail&folder=${folder}`, selectedMailbox?.id)}>Clear</Link>
                ) : null}
              </form>
              <div className={styles.listHeader}>
                <strong>{searchQuery ? `Search · ${searchQuery}` : folder[0]?.toUpperCase() + folder.slice(1)}</strong>
                <span>{threads.length}</span>
              </div>
              {threads.length ? threads.map((thread) => (
                <Link
                  className={`${styles.thread} ${thread.id === selectedId ? styles.selected : ""}`}
                  key={thread.id}
                  href={withSearch(
                    withMailbox(`/dashboard/mail?view=mail&folder=${thread.folder}&thread=${thread.id}`, selectedMailbox?.id),
                    searchQuery,
                  )}
                >
                  <div className={styles.threadTop}>
                    <strong>{thread.participant_emails[0] ?? selectedMailbox?.address ?? "Relay"}</strong>
                    {thread.is_starred ? <Star size={13} fill="currentColor" /> : null}
                  </div>
                  <h3>{thread.subject}</h3>
                  <p>{thread.business_context_type ? `Linked to ${thread.business_context_type}` : searchQuery ? `Folder · ${thread.folder}` : "Unlinked conversation"}</p>
                  <time>{new Date(thread.latest_message_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time>
                  {thread.is_unread ? <i className={styles.unreadDot} /> : null}
                </Link>
              )) : (
                <div className={styles.empty}>
                  <Mail size={25} />
                  <strong>{searchQuery ? "No matching conversations" : `No ${folder} conversations yet`}</strong>
                  <p>{searchQuery ? "Try a subject, participant, business context or folder name." : connected ? "Sync the mailbox to pull new conversations." : "Authenticate this mailbox to start syncing."}</p>
                </div>
              )}
            </section>

            <section className={styles.reader}>
              {params.compose === "1" && selectedMailbox ? (
                <Compose mailbox={selectedMailbox} thread={selected} draft={draftMessage} />
              ) : selected ? (
                <>
                  <div className={styles.readerHeader}>
                    <div>
                      <span>{selected.business_context_type ? `Linked · ${selected.business_context_type}` : "Business conversation"}</span>
                      <h2>{selected.subject}</h2>
                      <p>{selected.participant_emails.join(", ")}</p>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <form action={setRelayThreadFlag} className={styles.threadAction}>
                        <input type="hidden" name="mailbox_id" value={selectedMailbox?.id ?? ""} />
                        <input type="hidden" name="thread_id" value={selected.id} />
                        <input type="hidden" name="folder" value={selected.folder} />
                        <input type="hidden" name="field" value="is_starred" />
                        <input type="hidden" name="expected" value={String(selected.is_starred)} />
                        <input type="hidden" name="next" value={String(!selected.is_starred)} />
                        <button
                          type="submit"
                          aria-label={selected.is_starred ? "Remove star" : "Star conversation"}
                          title={selected.is_starred ? "Remove star" : "Star conversation"}
                        >
                          <Star size={17} fill={selected.is_starred ? "currentColor" : "none"} />
                        </button>
                      </form>

                      <form action={setRelayThreadFlag} className={styles.threadAction}>
                        <input type="hidden" name="mailbox_id" value={selectedMailbox?.id ?? ""} />
                        <input type="hidden" name="thread_id" value={selected.id} />
                        <input type="hidden" name="folder" value={selected.folder} />
                        <input type="hidden" name="field" value="is_unread" />
                        <input type="hidden" name="expected" value={String(selected.is_unread)} />
                        <input type="hidden" name="next" value={String(!selected.is_unread)} />
                        <button
                          type="submit"
                          aria-label={selected.is_unread ? "Mark as read" : "Mark as unread"}
                          title={selected.is_unread ? "Mark as read" : "Mark as unread"}
                        >
                          {selected.is_unread ? <MailOpen size={17} /> : <Mail size={17} />}
                        </button>
                      </form>

                      {selected.folder === "archive" || selected.folder === "spam" || selected.folder === "trash" ? (
                        <form action={moveRelayThread} className={styles.threadAction}>
                          <input type="hidden" name="mailbox_id" value={selectedMailbox?.id ?? ""} />
                          <input type="hidden" name="thread_id" value={selected.id} />
                          <input type="hidden" name="from_folder" value={selected.folder} />
                          <input type="hidden" name="to_folder" value="inbox" />
                          <button type="submit" aria-label="Restore to inbox" title="Restore to inbox">
                            <Inbox size={17} />
                          </button>
                        </form>
                      ) : (
                        <>
                          <form action={moveRelayThread} className={styles.threadAction}>
                            <input type="hidden" name="mailbox_id" value={selectedMailbox?.id ?? ""} />
                            <input type="hidden" name="thread_id" value={selected.id} />
                            <input type="hidden" name="from_folder" value={selected.folder} />
                            <input type="hidden" name="to_folder" value="archive" />
                            <button type="submit" aria-label="Archive conversation" title="Archive conversation">
                              <Archive size={17} />
                            </button>
                          </form>
                          <form action={moveRelayThread} className={styles.threadAction}>
                            <input type="hidden" name="mailbox_id" value={selectedMailbox?.id ?? ""} />
                            <input type="hidden" name="thread_id" value={selected.id} />
                            <input type="hidden" name="from_folder" value={selected.folder} />
                            <input type="hidden" name="to_folder" value="spam" />
                            <button type="submit" aria-label="Mark as spam" title="Mark as spam">
                              <CircleAlert size={17} />
                            </button>
                          </form>
                          <form action={moveRelayThread} className={styles.threadAction}>
                            <input type="hidden" name="mailbox_id" value={selectedMailbox?.id ?? ""} />
                            <input type="hidden" name="thread_id" value={selected.id} />
                            <input type="hidden" name="from_folder" value={selected.folder} />
                            <input type="hidden" name="to_folder" value="trash" />
                            <button type="submit" aria-label="Move to trash" title="Move to trash">
                              <Trash2 size={17} />
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  </div>
                  <div className={styles.messages}>
                    {messages.map((message) => (
                      <article
                        className={message.direction === "outbound" || message.direction === "draft" ? styles.outbound : styles.inbound}
                        key={message.id}
                      >
                        <div>
                          <strong>{message.direction === "inbound" ? message.from_address : selectedMailbox?.display_name || message.from_address}</strong>
                          <span>{message.status} · {message.authority_level}</span>
                        </div>
                        <p>{message.body_text || "(Empty message)"}</p>
                        <time>{new Date(message.sent_at ?? message.received_at ?? message.created_at).toLocaleString()}</time>

                        {selected.folder === "outbox" && message.status === "pending_approval" && canManageMailboxes ? (
                          <div className={styles.approveSendForm}>
                            <form action={approveAndSendRelayMessageSafe}>
                              <input type="hidden" name="mailbox_id" value={selectedMailbox?.id ?? ""} />
                              <input type="hidden" name="message_id" value={message.id} />
                              <button type="submit" className={styles.sendButton}>Approve & send now <Send size={14} /></button>
                            </form>
                            <form action={returnRelayMessageToDraft}>
                              <input type="hidden" name="mailbox_id" value={selectedMailbox?.id ?? ""} />
                              <input type="hidden" name="message_id" value={message.id} />
                              <input type="hidden" name="expected_updated_at" value={message.updated_at} />
                              <button type="submit" className={styles.secondaryButton}>Return to draft</button>
                            </form>
                          </div>
                        ) : null}

                        {selected.folder === "outbox" && message.status === "failed" && canManageMailboxes && !message.provider_message_id && !message.internet_message_id && !message.sent_at ? (
                          <form action={setRelayMessageRecoveryState} className={styles.approveSendForm}>
                            <input type="hidden" name="mailbox_id" value={selectedMailbox?.id ?? ""} />
                            <input type="hidden" name="message_id" value={message.id} />
                            <input type="hidden" name="expected_status" value="failed" />
                            <input type="hidden" name="next_status" value="pending_approval" />
                            <input type="hidden" name="expected_updated_at" value={message.updated_at} />
                            <button type="submit" className={styles.secondaryButton}>Recover to approval queue</button>
                          </form>
                        ) : null}

                        {selected.folder === "outbox" && message.status === "sending" ? (
                          <div className={styles.approveSendForm}>
                            <small>Delivery state uncertain · Relay will not retry automatically. Verify provider delivery before recovery.</small>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                  <Link
                    className={styles.replyButton}
                    href={withMailbox(`/dashboard/mail?view=mail&folder=${selected.folder}&compose=1&thread=${selected.id}`, selectedMailbox?.id)}
                  >
                    {selected.folder === "drafts" ? "Edit draft" : "Reply"}
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
            {selectedMailbox?.status !== "connected" ? (
              <input type="hidden" name="mailbox_id" value={selectedMailbox?.id ?? ""} />
            ) : null}
            <span>Connect Namecheap Private Email</span>
            <h3>Authenticate a business mailbox</h3>
            <p>Use the full mailbox address and that mailbox’s Namecheap Private Email password.</p>
            <label>
              <span>Business email</span>
              <input
                type="email"
                name="email"
                defaultValue={selectedMailbox?.status !== "connected" ? selectedMailbox?.address ?? "" : ""}
                readOnly={Boolean(selectedMailbox && selectedMailbox.status !== "connected")}
                placeholder="info@company.com"
                autoComplete="username"
                maxLength={320}
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
              <input type="password" name="password" placeholder="Private Email password" autoComplete="current-password" maxLength={500} required />
            </label>
            <div className={relay.connectSecurity}>
              <ShieldCheck size={16} />
              <span>Orbit verifies IMAP and SMTP without sending an email, then stores an encrypted credential.</span>
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

function Compose({ mailbox, thread, draft }: { mailbox: Mailbox; thread?: Thread | null; draft?: Message | null }) {
  const connected = mailbox.status === "connected";
  const to = draft?.to_addresses.join(", ") ?? thread?.participant_emails.join(", ") ?? "";
  const subject = draft?.subject ?? (thread ? (/^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`) : "");
  const authority = draft?.authority_level === "red" ? "red" : "amber";
  return (
    <div className={styles.compose}>
      <div>
        <span>{draft ? "Existing Relay draft" : thread ? "Reply in conversation" : "New Relay message"}</span>
        <h2>{draft ? "Edit draft" : thread ? "Reply" : "Compose"}</h2>
        <p>From {mailbox.address}</p>
      </div>
      <form>
        <input type="hidden" name="mailbox_id" value={mailbox.id} />
        {thread ? <input type="hidden" name="thread_id" value={thread.id} /> : null}
        {draft ? <input type="hidden" name="draft_message_id" value={draft.id} /> : null}
        {draft ? <input type="hidden" name="draft_expected_updated_at" value={draft.updated_at} /> : null}
        <label><span>To</span><input name="to" type="text" defaultValue={to} placeholder="carrier@example.com" required /></label>
        <label><span>Subject</span><input name="subject" type="text" defaultValue={subject} placeholder="Subject" /></label>
        <label className={styles.bodyField}><span>Message</span><textarea name="body" rows={12} defaultValue={draft?.body_text ?? ""} placeholder="Write your message…" required /></label>
        <label>
          <span>Authority</span>
          <select name="authority" defaultValue={authority}>
            <option value="amber">Amber · approved business communication</option>
            <option value="red">Red · sensitive / founder approval</option>
          </select>
        </label>
        <div className={styles.composeActions}>
          <button formAction={saveRelayDraft} className={styles.secondaryButton}>Save draft</button>
          <button formAction={queueRelayMessage} className={styles.sendButton}>
            {connected ? "Queue approved send" : "Save until connected"}<Send size={15} />
          </button>
        </div>
      </form>
    </div>
  );
}
