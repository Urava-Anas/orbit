"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, Search, ShieldCheck, Truck } from "lucide-react";
import type { Carrier360Profile, CarrierFieldEvidence, CarrierRegulatoryIdentifier, CarrierVettingDecision } from "@/lib/carrier-intelligence/contracts";
import styles from "./carriers.module.css";

type LookupResult =
  | { status: "ok"; profile: Carrier360Profile; created: boolean; refreshed: boolean }
  | { status: "invalid_input" | "forbidden" | "not_found" | "source_gap" | "manual_review" | "source_unavailable" | "rate_limited"; message: string };

type PreflightState = "evidence" | "review" | "blocked";

type StoredCarrierSummaryView = {
  legalName: string;
  dotNumber: string | null;
  mcNumber: string | null;
  authorityStatus: string | null;
  insuranceStatus: string | null;
  decision: CarrierVettingDecision;
  lastVerifiedAt: string | null;
  updatedAt: string;
};

function isSuccess(result: LookupResult | null): result is Extract<LookupResult, { status: "ok" }> {
  return result?.status === "ok";
}

function valueOf<T>(evidence?: CarrierFieldEvidence<T>) {
  return evidence?.value ?? null;
}

function display(value: unknown, fallback = "Not available") {
  if (value === null || value === undefined || value === "") return fallback;
  if (Array.isArray(value)) return value.length ? value.join(", ") : fallback;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function compactDate(value: string | null) {
  if (!value) return "Not verified";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : "Unknown date";
}

function evidenceLabel(evidence?: CarrierFieldEvidence<unknown>) {
  if (!evidence) return "No evidence stored";
  return `${evidence.sourceName} · ${evidence.verificationState.replaceAll("_", " ")} · ${evidence.confidence}% confidence`;
}

function hasEvidence(evidence?: CarrierFieldEvidence<unknown>) {
  return Boolean(evidence && evidence.value !== null && evidence.value !== "" && evidence.verificationState !== "unknown");
}

function Fact({ label, evidence }: { label: string; evidence?: CarrierFieldEvidence<unknown> }) {
  return (
    <div className={styles.fact}>
      <span>{label}</span>
      <strong>{display(evidence?.value)}</strong>
      <small>{evidenceLabel(evidence)}</small>
    </div>
  );
}

function PreflightItem({
  label,
  state,
  value,
  detail,
}: {
  label: string;
  state: PreflightState;
  value: string;
  detail: string;
}) {
  return (
    <div className={styles.preflightItem} data-state={state}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export function CarrierLookup({
  canResearch,
  storedCarriers,
}: {
  canResearch: boolean;
  storedCarriers: StoredCarrierSummaryView[];
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"dot" | "mc">("dot");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim() || loading || !canResearch) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/carriers/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), kind }),
      });
      const payload = (await response.json()) as LookupResult;
      setResult(payload);
    } catch {
      setResult({ status: "source_unavailable", message: "Carrier lookup could not be reached safely." });
    } finally {
      setLoading(false);
    }
  }

  const profile = isSuccess(result) ? result.profile : null;
  const identity = profile?.identity;
  const authority = profile?.authority;
  const insurance = profile?.insurance;
  const safety = profile?.safety;
  const identifiers: CarrierRegulatoryIdentifier[] = valueOf(identity?.regulatoryIdentifiers) ?? [];
  const allowedToOperate = valueOf(safety?.allowedToOperate);
  const apexDecision = profile?.risk.decision ?? "unassessed";
  const decisionHardStop = apexDecision === "hold" || apexDecision === "reject";
  const federalOperatingHardStop = allowedToOperate === false;
  const hasLookupHardStop = decisionHardStop || federalOperatingHardStop;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.kicker}><Truck size={15} aria-hidden="true" /> Apex AI Dispatcher</span>
          <h1>Carrier Intelligence</h1>
          <p>Resolve an MC or USDOT number into a provenance-aware Carrier 360 profile before a human makes a booking or approval decision.</p>
        </div>
        <div className={styles.guardrail}><ShieldCheck size={20} aria-hidden="true" /><div><strong>Decision support only</strong><small>This screen cannot approve, reject or book a carrier.</small></div></div>
      </header>

      <section className={styles.lookupPanel} aria-labelledby="carrier-lookup-title">
        <div><span>Federal identity lookup</span><h2 id="carrier-lookup-title">Find a carrier</h2></div>
        <form onSubmit={onSubmit} className={styles.lookupForm}>
          <label><span>Identifier type</span><select value={kind} onChange={(event) => setKind(event.target.value as "dot" | "mc")} disabled={!canResearch || loading}><option value="dot">USDOT</option><option value="mc">MC</option></select></label>
          <label className={styles.queryField}><span>{kind === "dot" ? "USDOT number" : "MC number"}</span><input inputMode="numeric" autoComplete="off" maxLength={40} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={kind === "dot" ? "e.g. 1234567" : "e.g. 123456"} disabled={!canResearch || loading} /></label>
          <button className={styles.searchButton} type="submit" disabled={!canResearch || loading || !query.trim()}><Search size={17} aria-hidden="true" />{loading ? "Checking sources…" : "Build Carrier 360"}</button>
        </form>
        {!canResearch ? <p className={styles.notice}><AlertTriangle size={16} aria-hidden="true" /> Founder or admin access is required for live carrier research.</p> : null}
        {result && !isSuccess(result) ? <p className={styles.error} role="alert"><AlertTriangle size={16} aria-hidden="true" />{result.message}</p> : null}
      </section>

      {storedCarriers.length ? (
        <section className={styles.storedPanel} aria-labelledby="stored-carriers-title">
          <div className={styles.storedHead}>
            <div><span>Stored Carrier 360</span><h2 id="stored-carriers-title">Recently researched carriers</h2></div>
            <small>Database view only · no public-source refresh</small>
          </div>
          <div className={styles.storedList}>
            {storedCarriers.map((carrier, index) => (
              <div className={styles.storedRow} key={`${carrier.dotNumber ?? carrier.mcNumber ?? carrier.legalName}-${index}`}>
                <div className={styles.storedIdentity}>
                  <strong>{carrier.legalName}</strong>
                  <small>{[carrier.dotNumber ? `USDOT ${carrier.dotNumber}` : null, carrier.mcNumber ? `MC ${carrier.mcNumber}` : null].filter(Boolean).join(" · ") || "Identifier unavailable"}</small>
                </div>
                <div><span>Authority</span><strong>{display(carrier.authorityStatus, "Unknown")}</strong></div>
                <div><span>Insurance</span><strong>{display(carrier.insuranceStatus, "Unknown")}</strong></div>
                <div className={styles.storedDecision} data-decision={carrier.decision}><span>Apex decision</span><strong>{carrier.decision}</strong></div>
                <div><span>Last verified</span><strong>{compactDate(carrier.lastVerifiedAt)}</strong></div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!profile ? (
        <section className={styles.empty}>
          <Database size={28} aria-hidden="true" />
          <h2>No carrier loaded</h2>
          <p>Start with a federal identifier. Unknown or conflicting evidence stays unknown and is routed to manual review.</p>
        </section>
      ) : (
        <div className={styles.results}>
          <section className={styles.profileHead}>
            <div><span>Carrier 360</span><h2>{display(valueOf(identity?.legalName), "Unnamed carrier")}</h2><p>{identifiers.length ? identifiers.map((item) => `${item.type.toUpperCase()} ${item.value}`).join(" · ") : "Federal identifiers not reconstructed"}</p></div>
            <div className={styles.decision} data-decision={profile.risk.decision}><span>Apex decision</span><strong>{profile.risk.decision}</strong><small>{profile.risk.apexRiskScore === null || profile.risk.apexRiskScore === undefined ? "No Apex risk score" : `Apex score ${profile.risk.apexRiskScore}`}</small></div>
          </section>

          <section className={styles.warning}><AlertTriangle size={18} aria-hidden="true" /><p><strong>Verify before dispatch.</strong> FMCSA filings are regulatory evidence, not a substitute for a current commercial COI, identity check, or founder-approved carrier onboarding.</p></section>

          <section className={styles.preflight} aria-labelledby="carrier-preflight-title" data-state={hasLookupHardStop ? "blocked" : "review"}>
            <div className={styles.preflightHead}>
              <div>
                <span>Dispatch boundary</span>
                <h3 id="carrier-preflight-title">Operational preflight</h3>
                <p>Lookup evidence never completes operational preflight. Human onboarding and load-level approval remain required.</p>
              </div>
              <div className={styles.preflightStatus}>
                <AlertTriangle size={17} aria-hidden="true" />
                <div><span>Status</span><strong>{hasLookupHardStop ? "Hard stop" : "Onboarding required"}</strong></div>
              </div>
            </div>
            <div className={styles.preflightGrid}>
              <PreflightItem
                label="Federal identity"
                state={hasEvidence(identity?.legalName) && identifiers.length ? "evidence" : "review"}
                value={hasEvidence(identity?.legalName) && identifiers.length ? "Evidence found" : "Needs review"}
                detail="Federal identity evidence is useful for research, but it is not the human identity verification required for carrier onboarding."
              />
              <PreflightItem
                label="Operating authority"
                state={hasEvidence(authority?.status) ? "evidence" : "review"}
                value={hasEvidence(authority?.status) ? display(valueOf(authority?.status)) : "Not verified current"}
                detail="The filed status is shown as source evidence. Current applicability and authority clearance must be verified by the governed preflight workflow."
              />
              <PreflightItem
                label="Insurance"
                state={hasEvidence(insurance?.regulatoryStatus) ? "evidence" : "review"}
                value={hasEvidence(insurance?.regulatoryStatus) ? display(valueOf(insurance?.regulatoryStatus)) : "Not verified current"}
                detail="Regulatory filing evidence does not replace a current commercial COI or any required insurance verification."
              />
              <PreflightItem
                label="FMCSA operating fact"
                state={federalOperatingHardStop ? "blocked" : hasEvidence(safety?.allowedToOperate) ? "evidence" : "review"}
                value={allowedToOperate === false ? "Not allowed to operate" : allowedToOperate === true ? "Allowed to operate" : "Unknown"}
                detail={allowedToOperate === false ? "Federal source evidence is a hard stop for dispatch." : "A positive operating fact is one prerequisite only; it never approves the carrier."}
              />
              <PreflightItem
                label="Apex risk decision"
                state={decisionHardStop ? "blocked" : apexDecision === "approved" ? "evidence" : "review"}
                value={apexDecision}
                detail={decisionHardStop ? "Apex hold/reject is a hard stop." : "Even an Apex-approved risk record does not bypass onboarding, commercial COI, or load-level approval gates."}
              />
              <PreflightItem
                label="Operational readiness"
                state="review"
                value="Not established by lookup"
                detail="Contract, equipment, driver/HOS, credentials, communications, load source, audit, document storage, and exception ownership must be checked separately."
              />
            </div>
          </section>

          <div className={styles.grid}>
            <article className={styles.card}><div className={styles.cardHead}><h3>Identity & fleet</h3><CheckCircle2 size={17} aria-hidden="true" /></div><Fact label="Legal name" evidence={identity?.legalName} /><Fact label="Phone" evidence={identity?.phone} /><Fact label="Power units" evidence={profile.fleet.powerUnits} /><Fact label="Drivers" evidence={profile.fleet.drivers} /></article>
            <article className={styles.card}><div className={styles.cardHead}><h3>Authority</h3><ShieldCheck size={17} aria-hidden="true" /></div><Fact label="Status" evidence={authority?.status} /><Fact label="Authority types" evidence={authority?.authorityTypes} /><Fact label="Granted" evidence={authority?.grantedAt} /><Fact label="Authority age" evidence={authority?.authorityAgeDays} /></article>
            <article className={styles.card}><div className={styles.cardHead}><h3>Insurance filings</h3><ShieldCheck size={17} aria-hidden="true" /></div><Fact label="Regulatory status" evidence={insurance?.regulatoryStatus} /><Fact label="Insurer" evidence={insurance?.insurer} /><Fact label="Coverage" evidence={insurance?.coverageAmount} /><Fact label="Commercial COI" evidence={insurance?.commercialEvidenceStatus} /></article>
            <article className={styles.card}><div className={styles.cardHead}><h3>Safety snapshot</h3><AlertTriangle size={17} aria-hidden="true" /></div><Fact label="Allowed to operate" evidence={safety?.allowedToOperate} /><Fact label="Safety rating" evidence={safety?.safetyRating} /><Fact label="Total inspections" evidence={safety?.totalInspections} /><Fact label="Total crashes" evidence={safety?.totalCrashes} /></article>
          </div>
        </div>
      )}
    </main>
  );
}
