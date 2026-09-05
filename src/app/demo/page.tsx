import type { Metadata } from "next";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "Apex Operations Demo",
  robots: { index: false, follow: false },
};

const demoAccounts = [
  { carrier: "Northline Freight", lane: "Dallas → Phoenix", status: "Dispatch ready", value: "$18,400" },
  { carrier: "Blue Ridge Transport", lane: "Atlanta → Nashville", status: "Documents in review", value: "$11,250" },
  { carrier: "Summit Haulage", lane: "Chicago → Columbus", status: "Follow-up scheduled", value: "$9,800" },
];

/**
 * A deliberately isolated public view for demonstrations. It contains no
 * authenticated components, database clients, server actions, or live data.
 * Disable immediately with ORBIT_PUBLIC_DEMO=false, or remove this route.
 */
export default function ApexDemoPage() {
  if (process.env.ORBIT_PUBLIC_DEMO === "false") {
    return <main className="page"><p>Demo access is currently unavailable.</p></main>;
  }

  return (
    <main className="page">
      <PageHeader
        kicker="Apex Logistics · read-only demo"
        title="Founder Dashboard"
        description="A safe preview of the Apex operating view. Every account, amount, and activity below is fictional sample data."
      />

      <section className="metrics-grid" aria-label="Sample operating metrics">
        <MetricCard label="Carrier prospects" value="24" note="sample pipeline records" />
        <MetricCard label="Dispatch accounts" value="8" note="sample active accounts" />
        <MetricCard label="Revenue collected" value="$42,600" note="sample month-to-date" />
        <MetricCard label="Service risk" value="2" note="sample items needing review" />
      </section>

      <section className="panel" aria-labelledby="demo-accounts">
        <div className="panel-head">
          <div><h2 id="demo-accounts">Carrier operations</h2><span>Illustrative data only</span></div>
          <span className="badge">Read-only</span>
        </div>
        <div className="table-wrap"><table><thead><tr><th>Carrier</th><th>Lane</th><th>State</th><th>Sample value</th></tr></thead>
          <tbody>{demoAccounts.map((account) => <tr key={account.carrier}><td>{account.carrier}</td><td>{account.lane}</td><td><span className="status-pill status-active">{account.status}</span></td><td>{account.value}</td></tr>)}</tbody>
        </table></div>
      </section>

      <section className="panel" aria-label="Demo safeguards">
        <div className="panel-head"><div><h2>Demo safeguards</h2><span>Production access remains protected</span></div></div>
        <ul className="check-list">
          <li><CheckCircle2 size={18} aria-hidden="true" /> No live customer, carrier, financial, or operational data</li>
          <li><CheckCircle2 size={18} aria-hidden="true" /> No add, edit, send, connect, payment, or other write actions</li>
          <li><LockKeyhole size={18} aria-hidden="true" /> The authenticated <a href="/dashboard">Apex dashboard</a> remains unchanged</li>
        </ul>
      </section>
    </main>
  );
}
