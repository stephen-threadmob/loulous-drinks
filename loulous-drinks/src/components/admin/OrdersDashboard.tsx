"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { setSoundAlerts } from "@/lib/actions/settings";
import { formatMoney, formatDateTime, formatTimeAgo } from "@/lib/format";
import type { OrderStatus, SmsStatus } from "@/lib/types";

interface RawModifier {
  id: string;
  group_name_snapshot: string;
  option_name_snapshot: string;
  price_delta_cents: number;
}
interface RawItem {
  id: string;
  name_snapshot: string;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
  special_instructions: string | null;
  sort_order: number;
  order_item_modifiers: RawModifier[];
}
interface RawOrder {
  id: string;
  order_number: string;
  table_number: number;
  status: OrderStatus;
  subtotal_cents: number;
  currency: string;
  customer_notes: string | null;
  is_read: boolean;
  sms_status: SmsStatus;
  created_at: string;
  updated_at: string;
  order_items: RawItem[];
}

const ORDER_SELECT = `
  id, order_number, daily_seq, table_number, status, subtotal_cents, currency,
  customer_notes, is_read, sms_status, created_at, updated_at,
  order_items (
    id, name_snapshot, base_price_cents, unit_price_cents, quantity,
    line_total_cents, special_instructions, sort_order,
    order_item_modifiers ( id, group_name_snapshot, option_name_snapshot, price_delta_cents )
  )
`;

const STATUS_LABEL: Record<OrderStatus, string> = {
  new: "New",
  acknowledged: "Acknowledged",
  preparing: "Preparing",
  delivered: "Delivered",
  canceled: "Canceled",
};
const STATUS_STYLE: Record<OrderStatus, string> = {
  new: "bg-blue-100 text-blue-800",
  acknowledged: "bg-purple-100 text-purple-800",
  preparing: "bg-amber-100 text-amber-800",
  delivered: "bg-green-100 text-green-800",
  canceled: "bg-gray-200 text-gray-600",
};

const FILTERS = [
  { key: "active", label: "Active" },
  { key: "new", label: "New" },
  { key: "all", label: "All" },
  { key: "delivered", label: "Delivered" },
  { key: "canceled", label: "Canceled" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

export function OrdersDashboard({
  restaurantId,
  initialOrders,
  soundDefault,
  timezone,
}: {
  restaurantId: string;
  initialOrders: RawOrder[];
  soundDefault: boolean;
  timezone: string;
}) {
  const [orders, setOrders] = useState<RawOrder[]>(initialOrders);
  const [filter, setFilter] = useState<FilterKey>("active");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(soundDefault);
  const [live, setLive] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const playBeep = useCallback(() => {
    if (!soundOn) return;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      // Two short pleasant tones.
      [880, 1174].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.16);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.18);
        osc.stop(ctx.currentTime + i * 0.18 + 0.18);
      });
    } catch {
      /* audio not available */
    }
  }, [soundOn]);

  const fetchOne = useCallback(
    async (id: string) => {
      const { data } = await supabase
        .from("orders")
        .select(ORDER_SELECT)
        .eq("id", id)
        .maybeSingle();
      return data as RawOrder | null;
    },
    [supabase]
  );

  // Realtime subscription for this restaurant's orders.
  useEffect(() => {
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        async (payload) => {
          const full = await fetchOne((payload.new as { id: string }).id);
          if (!full) return;
          setOrders((prev) =>
            prev.some((o) => o.id === full.id) ? prev : [full, ...prev]
          );
          playBeep();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        async (payload) => {
          const id = (payload.new as { id: string }).id;
          const full = await fetchOne(id);
          setOrders((prev) =>
            prev.map((o) => (o.id === id && full ? full : o))
          );
        }
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, restaurantId, fetchOne, playBeep]);

  async function patchOrder(id: string, body: Record<string, unknown>) {
    // Optimistic update.
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...(body as Partial<RawOrder>) } : o))
    );
    await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    // Unlock audio on this user gesture.
    if (next) {
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        audioCtxRef.current = audioCtxRef.current || new Ctx();
        await audioCtxRef.current.resume();
      } catch {
        /* ignore */
      }
    }
    await setSoundAlerts(next);
  }

  const newCount = orders.filter((o) => o.status === "new").length;

  const visible = orders.filter((o) => {
    switch (filter) {
      case "new":
        return o.status === "new";
      case "active":
        return ["new", "acknowledged", "preparing"].includes(o.status);
      case "delivered":
        return o.status === "delivered";
      case "canceled":
        return o.status === "canceled";
      default:
        return true;
    }
  });

  function drinkCount(o: RawOrder) {
    return o.order_items.reduce((s, i) => s + i.quantity, 0);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Orders</h1>
          <p className="flex items-center gap-2 text-sm text-brand-muted">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                live ? "bg-green-500" : "bg-gray-400"
              }`}
              aria-hidden
            />
            {live ? "Live — new orders appear automatically" : "Connecting…"}
            {newCount > 0 && (
              <span className="chip bg-blue-100 text-blue-800">
                {newCount} new
              </span>
            )}
          </p>
        </div>
        <button onClick={toggleSound} className="btn-ghost text-sm" aria-pressed={soundOn}>
          {soundOn ? "🔔 Sound on" : "🔕 Sound off"}
        </button>
      </div>

      {/* Filters */}
      <div className="mt-4 flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`chip shrink-0 border ${
              filter === f.key
                ? "border-brand-primary bg-brand-primary text-white"
                : "border-black/15 bg-white"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="mt-10 text-center text-brand-muted">
          No orders here yet. New orders will pop in automatically.
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {visible.map((o) => {
          const isOpen = expanded === o.id;
          const unread = !o.is_read && o.status === "new";
          return (
            <li
              key={o.id}
              className={`card overflow-hidden ${
                unread ? "ring-2 ring-blue-400 animate-pulse-ring" : ""
              }`}
            >
              <button
                className="flex w-full items-center gap-3 p-4 text-left"
                onClick={() => {
                  setExpanded(isOpen ? null : o.id);
                  if (unread) patchOrder(o.id, { is_read: true });
                }}
              >
                {unread && (
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" aria-label="Unread" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    #{o.order_number} · Table {o.table_number}
                  </p>
                  <p className="text-sm text-brand-muted">
                    {drinkCount(o)} drink{drinkCount(o) === 1 ? "" : "s"} ·{" "}
                    {formatMoney(o.subtotal_cents, o.currency)} ·{" "}
                    {formatTimeAgo(o.created_at)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`chip ${STATUS_STYLE[o.status]}`}>
                    {STATUS_LABEL[o.status]}
                  </span>
                  <SmsBadge status={o.sms_status} />
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-black/10 bg-black/[0.02] p-4">
                  <p className="text-xs text-brand-muted">
                    Submitted {formatDateTime(o.created_at, timezone)}
                  </p>
                  <ul className="mt-3 space-y-2">
                    {[...o.order_items]
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((it) => (
                        <li key={it.id} className="rounded-lg bg-white p-3">
                          <div className="flex justify-between font-medium">
                            <span>
                              {it.quantity} × {it.name_snapshot}
                            </span>
                            <span>{formatMoney(it.line_total_cents, o.currency)}</span>
                          </div>
                          {it.order_item_modifiers.length > 0 && (
                            <ul className="mt-1 text-sm text-brand-muted">
                              {it.order_item_modifiers.map((m) => (
                                <li key={m.id}>
                                  {m.group_name_snapshot}: {m.option_name_snapshot}
                                  {m.price_delta_cents > 0 &&
                                    ` (+${formatMoney(m.price_delta_cents, o.currency)})`}
                                </li>
                              ))}
                            </ul>
                          )}
                          {it.special_instructions && (
                            <p className="mt-1 text-sm italic text-brand-muted">
                              “{it.special_instructions}”
                            </p>
                          )}
                        </li>
                      ))}
                  </ul>

                  {o.customer_notes && (
                    <div className="mt-3 rounded-lg bg-white p-3 text-sm">
                      <span className="font-medium">Customer notes: </span>
                      {o.customer_notes}
                    </div>
                  )}

                  <div className="mt-3 flex justify-between border-t border-black/10 pt-2 font-semibold">
                    <span>Subtotal</span>
                    <span>{formatMoney(o.subtotal_cents, o.currency)}</span>
                  </div>

                  {o.sms_status === "failed" && (
                    <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                      ⚠ The SMS notification failed to send. The order is safe —
                      check your Twilio settings, then handle this order manually.
                    </p>
                  )}
                  {o.sms_status === "skipped" && (
                    <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      No SMS was sent (texting isn&apos;t configured). Add a phone
                      number and Twilio keys in Settings to enable alerts.
                    </p>
                  )}

                  {/* Status actions */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {o.status === "new" && (
                      <button className="btn-secondary text-sm" onClick={() => patchOrder(o.id, { status: "acknowledged" })}>
                        Acknowledge
                      </button>
                    )}
                    {o.status !== "preparing" && o.status !== "delivered" && o.status !== "canceled" && (
                      <button className="btn-ghost text-sm" onClick={() => patchOrder(o.id, { status: "preparing" })}>
                        Preparing
                      </button>
                    )}
                    {o.status !== "delivered" && o.status !== "canceled" && (
                      <button className="btn-primary text-sm" onClick={() => patchOrder(o.id, { status: "delivered" })}>
                        Delivered
                      </button>
                    )}
                    {o.status !== "canceled" && (
                      <button className="btn-ghost text-sm text-red-600" onClick={() => patchOrder(o.id, { status: "canceled" })}>
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SmsBadge({ status }: { status: SmsStatus }) {
  const map: Record<SmsStatus, { label: string; cls: string }> = {
    sent: { label: "✓ SMS sent", cls: "bg-green-100 text-green-700" },
    pending: { label: "SMS pending", cls: "bg-gray-100 text-gray-600" },
    failed: { label: "⚠ SMS failed", cls: "bg-red-100 text-red-700" },
    skipped: { label: "SMS off", cls: "bg-gray-100 text-gray-500" },
  };
  const s = map[status];
  return <span className={`chip ${s.cls}`}>{s.label}</span>;
}
