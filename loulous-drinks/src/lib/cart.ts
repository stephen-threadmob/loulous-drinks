import type { CartLine, MenuItem, OrderPayloadItem } from "@/lib/types";

// Per-unit price = base + sum of selected option deltas.
export function lineUnitCents(line: CartLine): number {
  const mods = line.modifiers.reduce((sum, m) => sum + m.price_delta_cents, 0);
  return line.base_price_cents + mods;
}

export function lineTotalCents(line: CartLine): number {
  return lineUnitCents(line) * line.quantity;
}

export function cartSubtotalCents(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + lineTotalCents(l), 0);
}

export function cartItemCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

// A stable key so identical configurations of the same drink merge into one
// cart line (and different modifiers become separate lines).
export function lineKey(
  itemId: string,
  optionIds: string[],
  specialInstructions: string
): string {
  const sorted = [...optionIds].sort();
  return `${itemId}|${sorted.join(",")}|${specialInstructions.trim().toLowerCase()}`;
}

// Convert cart lines into the minimal payload the server needs. The server
// re-derives prices from the database — the client's numbers are never trusted.
export function toOrderItems(lines: CartLine[]): OrderPayloadItem[] {
  return lines.map((l) => ({
    item_id: l.item_id,
    quantity: l.quantity,
    special_instructions: l.special_instructions || undefined,
    modifiers: l.modifiers.map((m) => ({
      group_id: m.group_id,
      option_id: m.option_id,
    })),
  }));
}

// Validate that required single-select groups have a choice before add-to-cart.
export function validateSelection(
  item: MenuItem,
  selectedByGroup: Record<string, string[]>
): string | null {
  for (const g of item.modifier_groups ?? []) {
    const chosen = selectedByGroup[g.id] ?? [];
    if (g.required && chosen.length < Math.max(1, g.min_select)) {
      return `Please choose ${g.name.toLowerCase()}.`;
    }
    if (g.max_select != null && chosen.length > g.max_select) {
      return `You can choose at most ${g.max_select} for ${g.name.toLowerCase()}.`;
    }
  }
  return null;
}
