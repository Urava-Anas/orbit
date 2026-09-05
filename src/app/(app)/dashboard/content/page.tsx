import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileCheck2,
  Gauge,
  Pencil,
  PlugZap,
  RefreshCw,
  Rocket,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { SiFacebook, SiInstagram, SiLinkedin, SiTiktok } from "react-icons/si";
import {
  contentGenerationConfigured,
  contentGenerationModel,
  localDate,
  providerForChannel,
} from "@/lib/content-engine";
import { humanize } from "@/lib/format";
import { requireWorkspace } from "@/lib/workspace";
import {
  approveContentItem,
  approveDailyBatch,
  generateTodayBatch,
  rejectContentItem,
  saveBrandBrain,
  updateContentItem,
} from "./actions";
import styles from "./content-engine.module.css";
import mediaStyles from "./ReviewMedia.module.css";

export const metadata: Metadata = {
  title: "Content Engine · Orbit",
  description: "Daily content generation, founder approval, publishing and learning loop.",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ notice?: string; error?: string }>;

type BrandProfile = {
  audience: string;
  voice: string;
  pillars: string[];
  offers: string[];
  proof_rules: string;
  default_cta: string;
  timezone: string;
  daily_target_count: number;
  daily_generation_enabled: boolean;
  generation_hour: number;
  approval_required: boolean;
};

type Batch = {
  id: string;
  batch_date: string;
  status: string;
  focus: string;
  strategy_notes: string;
  generated_at: string | null;
  approved_at: string | null;
};

type Draft = {
  id: string;
  batch_id: string | null;
  proof_id: string | null;
  source_type: string;
  channel: string;
  format: string;
  goal: string;
  title: string;
  hook: string | null;
  body: string;
  cta: string | null;
  media_brief: string | null;
  scheduled_for: string | null;
  status: string;
  rejection_reason: string | null;
  sort_order: number;
  proofs: { title: string } | null;
};

type Publication = {
  content_id: string;
  provider: string;
  status: string;
  scheduled_for: string | null;
  provider_post_url: string | null;
  attempts: number;
  last_error: string | null;
  published_at: string | null;
};

type ContentAsset = {
  id: string;
  content_id: string;
  status: string;
  source: string;
  asset_type: string;
  public_url: string | null;
  created_at: string;
};

type Connection = {
  provider: string;
  status: string;
  provider_account_name: string | null;
};

type Learning = {
  id: string;
  learned_on: string;
  signal_type: string;
  insight: string;
  action: string;
  confidence: number | string;
};

type Metric = {
  content_id: string;
  captured_at: string;
  impressions: number;
  reach: number;
  engagements: number;
  clicks: number;
  leads: number;
};

const defaultUravaProfile: BrandProfile = {
  audience: "Founders and operators who want practical systems, automation and execution instead of disconnected tools.",
  voice: "Clear, ambitious, practical and evidence-led. Explain the real problem, show the system, and avoid empty hype.",
  pillars: ["Orbit product", "Build in public", "Founder insights", "Client proof", "Offers"],
  offers: ["Orbit", "Urava Studio"],
  proof_rules: "Never invent results, clients, metrics, testimonials, urgency or scarcity. Outcome claims must trace back to approved proof.",
  default_cta: "Start a conversation with Urava.",
  timezone: "Asia/Karachi",
  daily_target_count: 5,
  daily_generation_enabled: true,
  generation_hour: 6,
  approval_required: true,
};

function channelIcon(channel: string) {
  if (channel === "instagram") return <SiInstagram aria-hidden="true" />;
  if (channel === "facebook") return <SiFacebook aria-hidden="true" />;
  if (channel === "linkedin") return <SiLinkedin aria-hidden="true" />;
  if (channel === "tiktok") return <SiTiktok aria-hidden="true" />;
  return <Sparkles size={16} aria-hidden="true" />;
}

function channelLabel(channel: string) {
  return channel === "linkedin" ? "LinkedIn" : humanize(channel);
}

function formatTime(value: string | null, timezone: string) {
  if (!value) return "No time";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

function metricNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function publicationStatusLabel(publication: Publication | undefined, draftStatus: string) {
  if (publication?.status === "published") return "Published";
  if (publication?.status === "queued") return "Queued";
  if (publication?.status === "publishing") return "Publishing";
  if (publication?.status === "failed") return "Failed";
  if (publication?.status === "blocked") return "Blocked";
  if (draftStatus === "approved") return "Approved";
  if (draftStatus === "rejected") return "Rejected";
  return "Needs approval";
}

function providerLabel(provider: string) {
  if (provider === "meta") return "Meta";
  if (provider === "linkedin") return "LinkedIn";
  if (provider === "tiktok") return "TikTok";
  return humanize(provider);
}

export default async function ContentEnginePage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const { supabase, workspace, role } = await requireWorkspace();
  const canApprove = role === "owner" || role === "admin";

  const { data: profileRow, error: profileError } = await supabase
    .from("content_brand_profiles")
    .select("audience,voice,pillars,offers,proof_rules,default_cta,timezone,daily_target_count,daily_generation_enabled,generation_hour,approval_required")
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  if (profileError) throw new Error("Content Engine Brand Brain could not be loaded.");

  const profile = (profileRow as BrandProfile | null) ?? (workspace.name === "Urava" ? defaultUravaProfile : { ...defaultUravaProfile, timezone: "UTC", daily_generation_enabled: false });
  const today = localDate(profile.timezone);
  const metricsWindowStart = new Date(`${today}T00:00:00.000Z`);
  metricsWindowStart.setUTCDate(metricsWindowStart.getUTCDate() - 6);

  const [batchResult, connectionsResult, learningsResult, metricsResult, approvedProofResult] = await Promise.all([
    supabase
      .from("content_batches")
      .select("id,batch_date,status,focus,strategy_notes,generated_at,approved_at")
      .eq("workspace_id", workspace.id)
      .eq("batch_date", today)
      .maybeSingle(),
    supabase
      .from("integration_connections")
      .select("provider,status,provider_account_name")
      .eq("workspace_id", workspace.id)
      .in("provider", ["meta", "linkedin", "tiktok"]),
    supabase
      .from("content_learning_notes")
      .select("id,learned_on,signal_type,insight,action,confidence")
      .eq("workspace_id", workspace.id)
      .order("learned_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(4),
    supabase
      .from("content_metric_snapshots")
      .select("content_id,captured_at,impressions,reach,engagements,clicks,leads")
      .eq("workspace_id", workspace.id)
      .gte("captured_at", metricsWindowStart.toISOString())
      .order("captured_at", { ascending: false }),
    supabase
      .from("proofs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("status", "approved")
      .in("permission_scope", ["anonymous", "public"]),
  ]);
  if (batchResult.error || connectionsResult.error || learningsResult.error || metricsResult.error || approvedProofResult.error) {
    throw new Error("Content Engine operating data could not be loaded completely.");
  }

  const batch = batchResult.data as Batch | null;
  let drafts: Draft[] = [];
  let publications: Publication[] = [];
  let assets: ContentAsset[] = [];
  if (batch) {
    const draftResult = await supabase
      .from("content_drafts")
      .select("id,batch_id,proof_id,source_type,channel,format,goal,title,hook,body,cta,media_brief,scheduled_for,status,rejection_reason,sort_order,proofs(title)")
      .eq("workspace_id", workspace.id)
      .eq("batch_id", batch.id)
      .order("sort_order", { ascending: true });
    if (draftResult.error) throw new Error("Today’s Content Engine drafts could not be loaded.");
    drafts = (draftResult.data ?? []) as unknown as Draft[];

    if (drafts.length) {
      const contentIds = drafts.map((item) => item.id);
      const [publicationResult, assetResult] = await Promise.all([
        supabase
          .from("content_publications")
          .select("content_id,provider,status,scheduled_for,provider_post_url,attempts,last_error,published_at")
          .eq("workspace_id", workspace.id)
          .in("content_id", contentIds),
        supabase
          .from("content_assets")
          .select("id,content_id,status,source,asset_type,public_url,created_at")
          .eq("workspace_id", workspace.id)
          .eq("asset_type", "image")
          .in("content_id", contentIds)
          .order("created_at", { ascending: false }),
      ]);
      if (publicationResult.error || assetResult.error) throw new Error("Content review state could not be loaded completely.");
      publications = (publicationResult.data ?? []) as Publication[];
      assets = (assetResult.data ?? []) as ContentAsset[];
    }
  }

  const publicationByContent = new Map(publications.map((item) => [item.content_id, item]));
  const assetByContent = new Map<string, ContentAsset>();
  for (const asset of assets) {
    if (!assetByContent.has(asset.content_id) && asset.status === "ready") assetByContent.set(asset.content_id, asset);
  }
  const connections = (connectionsResult.data ?? []) as Connection[];
  const connectionByProvider = new Map(connections.map((item) => [item.provider, item]));
  const learnings = (learningsResult.data ?? []) as Learning[];
  const latestMetricByContent = new Map<string, Metric>();
  for (const row of metricsResult.data ?? []) {
    const contentId = String(row.content_id);
    if (latestMetricByContent.has(contentId)) continue;
    latestMetricByContent.set(contentId, {
      content_id: contentId,
      captured_at: String(row.captured_at),
      impressions: Number(row.impressions || 0),
      reach: Number(row.reach || 0),
      engagements: Number(row.engagements || 0),
      clicks: Number(row.clicks || 0),
      leads: Number(row.leads || 0),
    });
  }
  const metrics = [...latestMetricByContent.values()];
  const totals = metrics.reduce(
    (sum, row) => ({
      impressions: sum.impressions + row.impressions,
      reach: sum.reach + row.reach,
      engagements: sum.engagements + row.engagements,
      clicks: sum.clicks + row.clicks,
      leads: sum.leads + row.leads,
    }),
    { impressions: 0, reach: 0, engagements: 0, clicks: 0, leads: 0 },
  );

  const pendingCount = drafts.filter((item) => item.status === "review" || item.status === "draft").length;
  const approvedCount = drafts.filter((item) => item.status === "approved" || item.status === "scheduled" || item.status === "published").length;
  const publishedCount = publications.filter((item) => item.status === "published").length;
  const blockedCount = publications.filter((item) => item.status === "blocked" || item.status === "failed").length;
  const mediaBlockedCount = drafts.filter((item) =>
    (item.status === "review" || item.status === "draft")
    && item.channel === "instagram"
    && assetByContent.get(item.id)?.status !== "ready",
  ).length;
  const generationReady = contentGenerationConfigured();
  const profilePersisted = Boolean(profileRow);

  const providerCards = [
    { provider: "meta", label: "Instagram + Facebook", icon: <SiInstagram aria-hidden="true" /> },
    { provider: "linkedin", label: "LinkedIn", icon: <SiLinkedin aria-hidden="true" /> },
    { provider: "tiktok", label: "TikTok", icon: <SiTiktok aria-hidden="true" /> },
  ];

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}><Sparkles size={14} /> Urava-first operating loop</span>
          <h1>Content Engine</h1>
          <p>Orbit prepares the day, you approve the copy and visuals once, then publishing and performance move through a controlled queue.</p>
          <div className={styles.loopLine} aria-label="Content Engine daily loop">
            {[
              ["01", "Brand Brain"],
              ["02", "Generate"],
              ["03", "Approve"],
              ["04", "Publish"],
              ["05", "Learn"],
            ].map(([number, label], index) => (
              <span className={styles.loopStep} key={label}><i>{number}</i><strong>{label}</strong>{index < 4 ? <ChevronRight size={14} /> : null}</span>
            ))}
          </div>
        </div>
        <div className={styles.heroAction}>
          <span className={`${styles.engineState} ${generationReady && profilePersisted ? styles.stateGood : styles.stateWarn}`}>
            {generationReady && profilePersisted ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            {generationReady && profilePersisted ? "Daily generation ready" : "Setup needs attention"}
          </span>
          {batch ? (
            pendingCount > 0 && canApprove ? (
              <form action={approveDailyBatch}>
                <input name="batchId" type="hidden" value={batch.id} />
                <button className={styles.approveDay} type="submit" disabled={mediaBlockedCount > 0}>
                  {mediaBlockedCount ? <RefreshCw size={17} /> : <Check size={17} />}
                  {mediaBlockedCount ? `Waiting for ${mediaBlockedCount} visual${mediaBlockedCount === 1 ? "" : "s"}` : `Approve today · ${pendingCount}`}
                </button>
              </form>
            ) : (
              <span className={styles.completedAction}><CheckCircle2 size={17} /> Today’s review is clear</span>
            )
          ) : canApprove ? (
            <form action={generateTodayBatch}>
              <button className={styles.approveDay} type="submit" disabled={!generationReady || !profilePersisted}><Sparkles size={17} /> Generate today’s batch</button>
            </form>
          ) : null}
          <small>{formatDate(today, profile.timezone)} · {profile.timezone}</small>
        </div>
      </section>

      {query.notice ? <div className={styles.notice}><CheckCircle2 size={15} /> {query.notice}</div> : null}
      {query.error ? <div className={`${styles.notice} ${styles.noticeError}`}><AlertTriangle size={15} /> {query.error}</div> : null}

      {!profilePersisted ? (
        <section className={styles.setupBanner}>
          <div><BrainCircuit size={21} /><span><strong>Lock Urava’s Brand Brain first</strong><small>The defaults below are a starting point only. Save them once so daily generation has an explicit operating standard.</small></span></div>
          <a href="#brand-brain">Review Brand Brain <ArrowRight size={14} /></a>
        </section>
      ) : null}

      {!generationReady ? (
        <section className={styles.setupBanner}>
          <div><PlugZap size={21} /><span><strong>AI generation adapter is ready, but the server key is not configured</strong><small>Until OPENAI_API_KEY is present, Orbit will not pretend it generated a daily batch.</small></span></div>
          <span className={styles.setupMeta}>Model: {contentGenerationModel()}</span>
        </section>
      ) : null}

      <section className={styles.commandGrid}>
        <article><span>Today’s batch</span><strong>{drafts.length || "—"}</strong><small>{batch ? humanize(batch.status) : "Not generated"}</small></article>
        <article><span>Needs approval</span><strong>{pendingCount}</strong><small>{mediaBlockedCount ? `${mediaBlockedCount} visual${mediaBlockedCount === 1 ? "" : "s"} rendering` : pendingCount ? "Founder decision required" : "Review clear"}</small></article>
        <article><span>Approved</span><strong>{approvedCount}</strong><small>{blockedCount ? `${blockedCount} blocked downstream` : "Ready after provider checks"}</small></article>
        <article><span>Published</span><strong>{publishedCount}</strong><small>Provider-confirmed only</small></article>
        <article><span>Approved proof</span><strong>{approvedProofResult.count ?? 0}</strong><small>Safe for factual outcome claims</small></article>
      </section>

      <section className={styles.workspaceGrid}>
        <div className={styles.mainColumn}>
          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.sectionLabel}><Target size={13} /> Today’s strategy</span>
                <h2>{batch?.focus || "No daily strategy generated yet"}</h2>
                <p>{batch?.strategy_notes || "Once Brand Brain is locked, Orbit creates one focused plan for the day instead of random isolated posts."}</p>
              </div>
              <span className={styles.batchPill}>{batch ? humanize(batch.status) : "Waiting"}</span>
            </div>
            <div className={styles.strategyMeta}>
              <span><BrainCircuit size={14} /> {profile.pillars.slice(0, 3).join(" · ") || "Add content pillars"}</span>
              <span><Gauge size={14} /> Target {profile.daily_target_count} pieces</span>
              <span><ShieldCheck size={14} /> Copy + visual approval required</span>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.sectionLabel}><FileCheck2 size={13} /> Daily approval</span>
                <h2>Review the finished content, not the machinery</h2>
                <p>Every item carries its copy, purpose, platform, timing, evidence state and required generated visual. Nothing moves to publishing before the founder can see what will ship.</p>
              </div>
              {drafts.length ? <span className={styles.batchPill}>{pendingCount} pending</span> : null}
            </div>

            {drafts.length ? (
              <div className={styles.reviewList}>
                {drafts.map((item) => {
                  const publication = publicationByContent.get(item.id);
                  const state = publicationStatusLabel(publication, item.status);
                  const isPending = item.status === "review" || item.status === "draft";
                  const asset = assetByContent.get(item.id);
                  const visualReady = item.channel !== "instagram" || asset?.status === "ready";
                  return (
                    <article className={styles.contentCard} key={item.id}>
                      <div className={styles.contentTop}>
                        <span className={styles.channelMark}>{channelIcon(item.channel)}</span>
                        <div className={styles.contentIdentity}>
                          <div><strong>{channelLabel(item.channel)}</strong><span>{humanize(item.format)} · {humanize(item.goal)}</span></div>
                          <small><Clock3 size={12} /> {formatTime(item.scheduled_for, profile.timezone)}</small>
                        </div>
                        <span className={`${styles.status} ${styles[`status${state.replaceAll(" ", "")}`] ?? ""}`}>{state}</span>
                      </div>

                      <div className={styles.contentCopy}>
                        <h3>{item.title}</h3>
                        {item.hook ? <strong className={styles.hook}>{item.hook}</strong> : null}
                        <p>{item.body}</p>
                        {item.cta ? <span className={styles.cta}>CTA · {item.cta}</span> : null}
                      </div>

                      {item.channel === "instagram" ? (
                        asset?.status === "ready" ? (
                          <div className={mediaStyles.frame}>
                            <div className={mediaStyles.visual}>
                              <Image src={`/api/content-assets/${asset.id}`} alt={`Generated visual for ${item.title}`} width={1024} height={1024} unoptimized />
                            </div>
                            <div className={mediaStyles.copy}>
                              <span className={mediaStyles.ready}><CheckCircle2 size={12} /> Visual ready for review</span>
                              <strong>This image is part of your approval.</strong>
                              <span>Approve only if the copy and generated visual work together. Editing the item automatically invalidates this visual and forces a fresh generation.</span>
                            </div>
                          </div>
                        ) : (
                          <div className={mediaStyles.waiting}><RefreshCw size={14} /><span><strong>Visual is still being prepared.</strong><br />Orbit keeps Instagram approval locked until the finished generated image is available here.</span></div>
                        )
                      ) : null}

                      <div className={styles.contentEvidence}>
                        <span><ShieldCheck size={13} /> {item.proofs?.title ? `Grounded in approved proof: ${item.proofs.title}` : "No outcome claim requires proof"}</span>
                        {item.media_brief ? <span><Sparkles size={13} /> {item.media_brief}</span> : null}
                      </div>

                      {publication?.last_error ? <div className={styles.blockReason}><AlertTriangle size={13} /> {publication.last_error}</div> : null}

                      {canApprove ? (
                        <div className={styles.cardActions}>
                          {isPending ? (
                            <>
                              <form action={approveContentItem}>
                                <input name="id" type="hidden" value={item.id} />
                                <button className={styles.itemApprove} type="submit" disabled={!visualReady}><Check size={14} /> Approve</button>
                                {!visualReady ? <div className={mediaStyles.approvalLock}>Waiting for visual review</div> : null}
                              </form>
                              <details className={styles.actionDetail}>
                                <summary><Pencil size={14} /> Edit</summary>
                                <form action={updateContentItem} className={styles.editForm}>
                                  <input name="id" type="hidden" value={item.id} />
                                  <label>Title<input name="title" defaultValue={item.title} maxLength={180} required /></label>
                                  <label>Hook<textarea name="hook" defaultValue={item.hook ?? ""} maxLength={500} rows={2} /></label>
                                  <label>Copy<textarea name="body" defaultValue={item.body} maxLength={8000} rows={7} required /></label>
                                  <label>CTA<input name="cta" defaultValue={item.cta ?? ""} maxLength={500} /></label>
                                  <label>Media brief<textarea name="mediaBrief" defaultValue={item.media_brief ?? ""} maxLength={1500} rows={3} /></label>
                                  <button type="submit">Save edits</button>
                                </form>
                              </details>
                              <details className={styles.actionDetail}>
                                <summary className={styles.rejectSummary}><X size={14} /> Reject</summary>
                                <form action={rejectContentItem} className={styles.rejectForm}>
                                  <input name="id" type="hidden" value={item.id} />
                                  <input name="reason" placeholder="Reason (optional)" maxLength={1000} />
                                  <button type="submit">Reject item</button>
                                </form>
                              </details>
                            </>
                          ) : item.status === "rejected" ? (
                            <span className={styles.rejectedNote}>{item.rejection_reason || "Rejected during review."}</span>
                          ) : (
                            <span className={styles.approvedNote}><CheckCircle2 size={14} /> Founder approved</span>
                          )}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyReview}>
                <div className={styles.emptyIcon}><Sparkles size={24} /></div>
                <h3>Your first real daily batch starts here</h3>
                <p>Orbit will create platform-specific content from Brand Brain, approved proof and previous performance. The batch stays in review until you approve it.</p>
                {canApprove ? (
                  <form action={generateTodayBatch}>
                    <button type="submit" disabled={!generationReady || !profilePersisted}><RefreshCw size={15} /> Generate today’s batch</button>
                  </form>
                ) : null}
              </div>
            )}
          </section>
        </div>

        <aside className={styles.sideColumn}>
          <section className={styles.sidePanel}>
            <div className={styles.sideHeading}><span><Rocket size={14} /> Publishing rail</span><Link href="/dashboard/content/settings">Readiness <ExternalLink size={12} /></Link></div>
            <div className={styles.connectionList}>
              {providerCards.map((card) => {
                const connection = connectionByProvider.get(card.provider);
                const connected = connection?.status === "connected";
                return (
                  <div className={styles.connectionRow} key={card.provider}>
                    <span className={styles.connectionIcon}>{card.icon}</span>
                    <div><strong>{card.label}</strong><small>{connected ? connection?.provider_account_name || "Connected" : "Connection required"}</small></div>
                    <span className={connected ? styles.connected : styles.disconnected}>{connected ? "Connected" : "Setup"}</span>
                  </div>
                );
              })}
            </div>
            <div className={styles.queueList}>
              {drafts.length ? drafts.map((item) => {
                const publication = publicationByContent.get(item.id);
                const provider = providerForChannel(item.channel);
                const state = publicationStatusLabel(publication, item.status);
                return (
                  <div className={styles.queueRow} key={item.id}>
                    <span>{formatTime(item.scheduled_for, profile.timezone)}</span>
                    <div>{channelIcon(item.channel)}<strong>{channelLabel(item.channel)}</strong></div>
                    <small>{state === "Blocked" ? `${providerLabel(provider)} blocked` : state}</small>
                  </div>
                );
              }) : <p className={styles.muted}>The queue appears after today’s batch is generated.</p>}
            </div>
          </section>

          <section className={styles.sidePanel}>
            <div className={styles.sideHeading}><span><BarChart3 size={14} /> Last 7 days</span><small>Latest provider snapshot per post</small></div>
            <div className={styles.metricGrid}>
              <div><span>Reach</span><strong>{metricNumber(totals.reach)}</strong></div>
              <div><span>Engagement</span><strong>{metricNumber(totals.engagements)}</strong></div>
              <div><span>Clicks</span><strong>{metricNumber(totals.clicks)}</strong></div>
              <div><span>Leads</span><strong>{metricNumber(totals.leads)}</strong></div>
            </div>
            {!metrics.length ? <p className={styles.muted}>No invented analytics. Results appear after connected platforms return real metrics.</p> : null}
          </section>

          <section className={`${styles.sidePanel} ${styles.learningPanel}`}>
            <div className={styles.sideHeading}><span><BrainCircuit size={14} /> Orbit learning</span><small>{learnings.length ? `${learnings.length} recent signals` : "Awaiting data"}</small></div>
            {learnings.length ? (
              <div className={styles.learningList}>
                {learnings.map((learning) => (
                  <div key={learning.id}><span>{humanize(learning.signal_type)}</span><strong>{learning.insight}</strong>{learning.action ? <small>Next: {learning.action}</small> : null}</div>
                ))}
              </div>
            ) : (
              <p className={styles.muted}>Orbit will only claim a learning after it has measurable performance or a founder-entered insight.</p>
            )}
          </section>
        </aside>
      </section>

      <section className={styles.brandPanel} id="brand-brain">
        <div className={styles.brandIntro}>
          <span className={styles.sectionLabel}><Settings2 size={13} /> Brand Brain</span>
          <h2>The rules behind every generated post</h2>
          <p>Urava’s content should compound one identity. These settings are fed into the daily generation step and remain founder-controlled.</p>
          <div className={styles.brandSummary}>
            <span><strong>Audience</strong>{profile.audience}</span>
            <span><strong>Voice</strong>{profile.voice}</span>
            <span><strong>Pillars</strong>{profile.pillars.join(" · ") || "Not set"}</span>
          </div>
        </div>

        {canApprove ? (
          <details className={styles.brandEditor} open={!profilePersisted}>
            <summary><Pencil size={14} /> {profilePersisted ? "Edit Brand Brain" : "Lock these rules"}</summary>
            <form action={saveBrandBrain}>
              <label>Audience<textarea name="audience" defaultValue={profile.audience} rows={3} required /></label>
              <label>Voice<textarea name="voice" defaultValue={profile.voice} rows={3} required /></label>
              <div className={styles.formSplit}>
                <label>Content pillars<textarea name="pillars" defaultValue={profile.pillars.join("\n")} rows={5} placeholder="One per line" /></label>
                <label>Priority offers<textarea name="offers" defaultValue={profile.offers.join("\n")} rows={5} placeholder="One per line" /></label>
              </div>
              <label>Proof / claim rules<textarea name="proofRules" defaultValue={profile.proof_rules} rows={4} required /></label>
              <div className={styles.formSplit}>
                <label>Default CTA<input name="defaultCta" defaultValue={profile.default_cta} required /></label>
                <label>Timezone<input name="timezone" defaultValue={profile.timezone} required /></label>
              </div>
              <div className={styles.formSplit}>
                <label>Daily pieces<input name="dailyTargetCount" type="number" min={1} max={20} defaultValue={profile.daily_target_count} required /></label>
                <label className={styles.toggleField}><input name="dailyGenerationEnabled" type="checkbox" defaultChecked={profile.daily_generation_enabled} /><span><strong>Automatic daily generation</strong><small>Generate at 6:00 AM local time. Founder approval always remains required.</small></span></label>
              </div>
              <button type="submit"><Check size={14} /> Save Brand Brain</button>
            </form>
          </details>
        ) : null}
      </section>

      <section className={styles.guardrailBar}>
        <span><ShieldCheck size={14} /> Copy + generated visuals require human approval</span>
        <span><FileCheck2 size={14} /> Claims must trace to approved proof</span>
        <span><Clock3 size={14} /> Scheduling is separate from delivery confirmation</span>
        <span><BarChart3 size={14} /> Learning uses real metrics only</span>
      </section>
    </main>
  );
}
