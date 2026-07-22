import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { orderPayloadSchema, sanitizeText } from "@/lib/validation";
import { rateLimit, sweepRateLimiter } from "@/lib/rate-limit";
import { buildOrderSms, type SmsItem } from "@/lib/sms/format";
import { sendOrderSms } from "@/lib/sms/twilio";

export const runtime = "nodejs";

// POST /api/orders — the ONLY way a customer order enters the system.
// Validates input, rate-limits, de-duplicates (idempotency), re-derives all
// prices from the database (never trusts the client), saves the order, then
// sends the SMS and records its status.
export async function POST(req: NextRequest) {
  sweepRateLimiter();

  // ---- Parse + validate ----------------------------------------------------
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = orderPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid order." },
      { status: 400 }
    );
  }
  const payload = parsed.data;

  // ---- Rate limiting -------------------------------------------------------
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const ipLimit = rateLimit(`order:ip:${ip}`, 10, 60_000); // 10/min per IP
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "Too many orders too quickly. Please wait a moment." },
      { status: 429 }
    );
  }
  const tableLimit = rateLimit(
    `order:tbl:${payload.restaurant_slug}:${payload.table_number}`,
    6,
    60_000
  ); // 6/min per table
  if (!tableLimit.ok) {
    return NextResponse.json(
      { error: "This table just sent several orders. Please wait a moment." },
      { status: 429 }
    );
  }

  const supabase = createAdminClient();

  // ---- Restaurant + settings ----------------------------------------------
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, name")
    .eq("slug", payload.restaurant_slug)
    .maybeSingle();
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found." }, { status: 404 });
  }

  const { data: settings } = await supabase
    .from("restaurant_settings")
    .select(
      "display_name, currency, timezone, table_min, table_max, ordering_enabled, owner_phone"
    )
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();
  if (!settings) {
    return NextResponse.json(
      { error: "This restaurant isn't accepting orders yet." },
      { status: 400 }
    );
  }
  if (!settings.ordering_enabled) {
    return NextResponse.json(
      { error: "Ordering is currently closed." },
      { status: 400 }
    );
  }

  // ---- Table number range --------------------------------------------------
  if (
    payload.table_number < settings.table_min ||
    payload.table_number > settings.table_max
  ) {
    return NextResponse.json(
      {
        error: `Table number must be between ${settings.table_min} and ${settings.table_max}.`,
      },
      { status: 400 }
    );
  }

  // ---- Idempotency: return the existing order if this key was already used --
  {
    const { data: existing } = await supabase
      .from("orders")
      .select("order_number, sms_status")
      .eq("restaurant_id", restaurant.id)
      .eq("idempotency_key", payload.idempotency_key)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({
        order_number: existing.order_number,
        sms_status: existing.sms_status,
        duplicate: true,
      });
    }
  }

  // ---- Load + validate items/modifiers, re-derive prices -------------------
  const itemIds = [...new Set(payload.items.map((i) => i.item_id))];
  const { data: dbItems } = await supabase
    .from("menu_items")
    .select("id, name, price_cents, availability, restaurant_id")
    .eq("restaurant_id", restaurant.id)
    .in("id", itemIds);
  const itemMap = new Map<string, any>(
    (dbItems ?? []).map((i: any) => [i.id, i])
  );

  const { data: dbGroups } = await supabase
    .from("item_modifier_groups")
    .select("id, item_id, name, required, min_select, max_select")
    .eq("restaurant_id", restaurant.id)
    .in("item_id", itemIds);
  const groupMap = new Map<string, any>(
    (dbGroups ?? []).map((g: any) => [g.id, g])
  );
  const groupsByItem = new Map<string, any[]>();
  for (const g of (dbGroups ?? []) as any[]) {
    const arr = groupsByItem.get(g.item_id) ?? [];
    arr.push(g);
    groupsByItem.set(g.item_id, arr);
  }

  const allOptionIds = [
    ...new Set(payload.items.flatMap((i) => i.modifiers.map((m) => m.option_id))),
  ];
  let optionMap = new Map<string, any>();
  if (allOptionIds.length > 0) {
    const { data: dbOptions } = await supabase
      .from("modifier_options")
      .select("id, group_id, name, price_delta_cents, restaurant_id")
      .eq("restaurant_id", restaurant.id)
      .in("id", allOptionIds);
    optionMap = new Map<string, any>((dbOptions ?? []).map((o: any) => [o.id, o]));
  }

  interface BuiltItem {
    item_id: string;
    name: string;
    base_price_cents: number;
    unit_price_cents: number;
    quantity: number;
    line_total_cents: number;
    special_instructions: string;
    modifiers: {
      group_name: string;
      option_name: string;
      price_delta_cents: number;
    }[];
  }
  const built: BuiltItem[] = [];

  for (const line of payload.items) {
    const dbItem = itemMap.get(line.item_id);
    if (!dbItem) {
      return NextResponse.json(
        { error: "One of your drinks is no longer on the menu. Please review your order." },
        { status: 409 }
      );
    }
    if (dbItem.availability !== "available") {
      return NextResponse.json(
        {
          error: `"${dbItem.name}" is currently unavailable. Please remove it and try again.`,
          unavailable_item_id: dbItem.id,
        },
        { status: 409 }
      );
    }

    let unit = dbItem.price_cents;
    const mods: BuiltItem["modifiers"] = [];
    const selectedByGroup = new Map<string, number>();

    for (const m of line.modifiers) {
      const opt = optionMap.get(m.option_id);
      const grp = groupMap.get(m.group_id);
      // The option must exist, belong to the claimed group, and that group must
      // belong to THIS item — defeats tampering with IDs.
      if (!opt || !grp || opt.group_id !== grp.id || grp.item_id !== dbItem.id) {
        return NextResponse.json(
          { error: "Invalid drink customization. Please rebuild your order." },
          { status: 400 }
        );
      }
      unit += opt.price_delta_cents;
      mods.push({
        group_name: grp.name,
        option_name: opt.name,
        price_delta_cents: opt.price_delta_cents,
      });
      selectedByGroup.set(grp.id, (selectedByGroup.get(grp.id) ?? 0) + 1);
    }

    // Enforce required groups + max_select server-side.
    for (const grp of groupsByItem.get(dbItem.id) ?? []) {
      const chosen = selectedByGroup.get(grp.id) ?? 0;
      if (grp.required && chosen < Math.max(1, grp.min_select)) {
        return NextResponse.json(
          { error: `Please choose ${grp.name.toLowerCase()} for ${dbItem.name}.` },
          { status: 400 }
        );
      }
      if (grp.max_select != null && chosen > grp.max_select) {
        return NextResponse.json(
          { error: `Too many choices for ${grp.name} on ${dbItem.name}.` },
          { status: 400 }
        );
      }
    }

    built.push({
      item_id: dbItem.id,
      name: dbItem.name,
      base_price_cents: dbItem.price_cents,
      unit_price_cents: unit,
      quantity: line.quantity,
      line_total_cents: unit * line.quantity,
      special_instructions: sanitizeText(line.special_instructions ?? "", 300),
      modifiers: mods,
    });
  }

  const subtotal = built.reduce((s, b) => s + b.line_total_cents, 0);

  // ---- Allocate order number ----------------------------------------------
  const { data: numData, error: numErr } = await supabase.rpc(
    "next_order_number",
    { p_restaurant: restaurant.id, p_tz: settings.timezone }
  );
  if (numErr || !numData || !numData[0]) {
    return NextResponse.json(
      { error: "Could not create your order. Please try again." },
      { status: 500 }
    );
  }
  const { seq, order_number } = numData[0];

  // ---- Insert order (handle idempotency race) ------------------------------
  const { data: orderRow, error: orderErr } = await supabase
    .from("orders")
    .insert({
      restaurant_id: restaurant.id,
      order_number,
      daily_seq: seq,
      table_number: payload.table_number,
      status: "new",
      subtotal_cents: subtotal,
      currency: settings.currency,
      customer_notes: sanitizeText(payload.customer_notes ?? "", 500) || null,
      sms_status: "pending",
      idempotency_key: payload.idempotency_key,
    })
    .select("id, created_at, order_number")
    .single();

  if (orderErr || !orderRow) {
    // Likely a duplicate idempotency key from a simultaneous double-tap.
    const { data: dup } = await supabase
      .from("orders")
      .select("order_number, sms_status")
      .eq("restaurant_id", restaurant.id)
      .eq("idempotency_key", payload.idempotency_key)
      .maybeSingle();
    if (dup) {
      return NextResponse.json({
        order_number: dup.order_number,
        sms_status: dup.sms_status,
        duplicate: true,
      });
    }
    return NextResponse.json(
      { error: "Could not save your order. Please try again." },
      { status: 500 }
    );
  }

  // ---- Insert order items + their modifiers --------------------------------
  for (let idx = 0; idx < built.length; idx++) {
    const b = built[idx];
    const { data: oiRow } = await supabase
      .from("order_items")
      .insert({
        order_id: orderRow.id,
        restaurant_id: restaurant.id,
        item_id: b.item_id,
        name_snapshot: b.name,
        base_price_cents: b.base_price_cents,
        unit_price_cents: b.unit_price_cents,
        quantity: b.quantity,
        line_total_cents: b.line_total_cents,
        special_instructions: b.special_instructions || null,
        sort_order: idx,
      })
      .select("id")
      .single();

    if (oiRow && b.modifiers.length > 0) {
      await supabase.from("order_item_modifiers").insert(
        b.modifiers.map((m) => ({
          order_item_id: oiRow.id,
          restaurant_id: restaurant.id,
          group_name_snapshot: m.group_name,
          option_name_snapshot: m.option_name,
          price_delta_cents: m.price_delta_cents,
        }))
      );
    }
  }

  // ---- Send SMS (only after the order is safely saved) ---------------------
  const smsItems: SmsItem[] = built.map((b) => ({
    quantity: b.quantity,
    name: b.name,
    line_total_cents: b.line_total_cents,
    modifiers: b.modifiers,
    special_instructions: b.special_instructions,
  }));
  const body = buildOrderSms({
    restaurantName: settings.display_name || restaurant.name,
    orderNumber: orderRow.order_number,
    tableNumber: payload.table_number,
    createdAtIso: orderRow.created_at,
    timezone: settings.timezone,
    currency: settings.currency,
    subtotalCents: subtotal,
    items: smsItems,
    customerNotes: payload.customer_notes,
  });

  const smsResult = await sendOrderSms(settings.owner_phone, body);

  await supabase.from("sms_logs").insert({
    restaurant_id: restaurant.id,
    order_id: orderRow.id,
    to_number: settings.owner_phone,
    status: smsResult.status,
    provider_sid: smsResult.providerSid ?? null,
    segments: smsResult.segments,
    body,
    error: smsResult.error ?? null,
  });
  await supabase
    .from("orders")
    .update({ sms_status: smsResult.status })
    .eq("id", orderRow.id);

  return NextResponse.json({
    order_number: orderRow.order_number,
    sms_status: smsResult.status,
  });
}
