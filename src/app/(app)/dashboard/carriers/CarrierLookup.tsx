"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, Search, ShieldCheck, Truck } from "lucide-react";
import type { Carrier360Profile, CarrierFieldEvidence, CarrierRegulatoryIdentifier } from "@/lib/carrier-intelligence/contracts";
import styles from "./carriers.module.css";

type LookupResult =
  | { status: "ok"; profile: Carrier360Profile; created: boolean; refreshed: boolean }
  | { status: "invalid_input" | "forbidden" | "not_found" | "source_gap" | "manual_review" | "source_unavailable" | "rate_limited"; message: string };

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

function evidenceLabel(evidence?: CarrierFieldEvidence<unknown>) {
  if (!evidence) return "No evidence stored";
  return `${evidence.sourceName} · ${evidence.verificationState.replaceAll("_", " ")} · ${evidence.confidence}% confidence`;
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

export function CarrierLookup({ canResearch }: { canResearch: boolean }) {
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
