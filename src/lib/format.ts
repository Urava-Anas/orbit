const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(value: number, currency = "PKR") {
  if (!currencyFormatters.has(currency)) {
    currencyFormatters.set(
      currency,
      new Intl.NumberFormat("en-PK", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }),
    );
  }

  return currencyFormatters.get(currency)!.format(value);
}

export function formatDate(value: string | null) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatRelativeDate(value: string) {
  const days = Math.round(
    (new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );

  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1 && days < 14) return `In ${days} days`;
  if (days < -1 && days > -14) return `${Math.abs(days)} days ago`;

  return formatDate(value);
}

export function humanize(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

