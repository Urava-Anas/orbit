import { humanize } from "@/lib/format";

type StatusPillProps = {
  value: string;
};

export function StatusPill({ value }: StatusPillProps) {
  return <span className={`status status-${value}`}>{humanize(value)}</span>;
}

