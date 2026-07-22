import type { PublicSettings } from "@/lib/types";

// Determine whether ordering is currently open, based on the restaurant's
// ordering_enabled flag and optional start/end times (interpreted in the
// restaurant's timezone). Null start/end means no time restriction.
export function isOrderingOpen(settings: PublicSettings, now = new Date()): {
  open: boolean;
  reason?: string;
} {
  if (!settings.ordering_enabled) {
    return { open: false, reason: "Online ordering is currently turned off." };
  }
  const start = settings.ordering_start;
  const end = settings.ordering_end;
  if (!start || !end) return { open: true };

  // Current HH:MM in the restaurant's timezone.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: settings.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  const cur = `${hh}:${mm}`;

  const startHM = start.slice(0, 5);
  const endHM = end.slice(0, 5);

  // Handle overnight ranges (e.g. 17:00 -> 02:00).
  const open =
    startHM <= endHM
      ? cur >= startHM && cur <= endHM
      : cur >= startHM || cur <= endHM;

  return open
    ? { open: true }
    : {
        open: false,
        reason: `Ordering is available between ${to12h(startHM)} and ${to12h(endHM)}.`,
      };
}

function to12h(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
