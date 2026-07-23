type MetricCardProps = {
  label: string;
  value: string | number;
  note: string;
};

export function MetricCard({ label, value, note }: MetricCardProps) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

