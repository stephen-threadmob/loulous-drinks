// Money + date formatting helpers. Prices are stored as integer cents.

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format((cents ?? 0) / 100);
}

// Parse a user-entered price like "$12.50" or "12" into integer cents. Returns
// null when the input isn't a recognizable number.
export function parseMoneyToCents(input: string): number | null {
  if (input == null) return null;
  const cleaned = String(input).replace(/[^0-9.]/g, "").trim();
  if (cleaned === "") return null;
  const value = Number.parseFloat(cleaned);
  if (Number.isNaN(value)) return null;
  return Math.round(value * 100);
}

export function formatDateTime(iso: string, timezone = "America/New_York"): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString("en-US");
  }
}

export function formatTimeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
