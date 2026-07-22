import { formatMoney, formatDateTime } from "@/lib/format";

export interface SmsModifier {
  group_name: string;
  option_name: string;
  price_delta_cents: number;
}
export interface SmsItem {
  quantity: number;
  name: string;
  line_total_cents: number;
  modifiers: SmsModifier[];
  special_instructions?: string | null;
}
export interface SmsOrderData {
  restaurantName: string;
  orderNumber: string;
  tableNumber: number;
  createdAtIso: string;
  timezone: string;
  currency: string;
  subtotalCents: number;
  items: SmsItem[];
  customerNotes?: string | null;
}

// Build the full notification body in the format the owner expects.
export function buildOrderSms(d: SmsOrderData): string {
  const lines: string[] = [];
  lines.push("NEW DRINK ORDER");
  lines.push("");
  lines.push(`Restaurant: ${d.restaurantName}`);
  lines.push(`Order Number: ${d.orderNumber}`);
  lines.push(`Table: ${d.tableNumber}`);
  lines.push(`Submitted: ${formatDateTime(d.createdAtIso, d.timezone)}`);
  lines.push("");
  lines.push("ORDER:");
  lines.push("");

  for (const item of d.items) {
    lines.push(
      `${item.quantity} x ${item.name} — ${formatMoney(
        item.line_total_cents,
        d.currency
      )}`
    );
    for (const m of item.modifiers) {
      const extra =
        m.price_delta_cents > 0
          ? ` (+${formatMoney(m.price_delta_cents, d.currency)})`
          : "";
      lines.push(`  - ${m.group_name}: ${m.option_name}${extra}`);
    }
    if (item.special_instructions) {
      lines.push(`  - Special request: ${item.special_instructions}`);
    }
    lines.push("");
  }

  lines.push(`Subtotal: ${formatMoney(d.subtotalCents, d.currency)}`);

  if (d.customerNotes && d.customerNotes.trim()) {
    lines.push("");
    lines.push("Customer Notes:");
    lines.push(d.customerNotes.trim());
  }

  return lines.join("\n").trim();
}

// Split a long message into numbered parts on line boundaries, so no order
// information is lost and no item is cut mid-way. Twilio auto-concatenates up to
// ~1600 chars, but we split proactively for very large orders and number each
// part "(i/n)" as the brief requires.
export function splitSms(full: string, maxLen = 1400): string[] {
  if (full.length <= maxLen) return [full];

  const sourceLines = full.split("\n");
  const chunks: string[] = [];
  let current = "";

  for (const line of sourceLines) {
    // +1 accounts for the newline we'll re-add.
    if (current.length + line.length + 1 > maxLen && current.length > 0) {
      chunks.push(current.trimEnd());
      current = "";
    }
    current += line + "\n";
  }
  if (current.trim().length > 0) chunks.push(current.trimEnd());

  const total = chunks.length;
  if (total === 1) return chunks;
  return chunks.map((c, i) => `(${i + 1}/${total})\n${c}`);
}
