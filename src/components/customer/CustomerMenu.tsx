"use client";

import { useMemo, useRef, useState } from "react";
import type {
  CartLine,
  CartModifier,
  CategoryWithItems,
  MenuItem,
  ModifierGroup,
  PublicSettings,
} from "@/lib/types";
import { formatMoney } from "@/lib/format";
import {
  cartItemCount,
  cartSubtotalCents,
  lineKey,
  lineTotalCents,
  lineUnitCents,
  toOrderItems,
  validateSelection,
} from "@/lib/cart";

type View = "menu" | "review" | "confirm";

interface Props {
  slug: string;
  restaurantName: string;
  settings: PublicSettings;
  menu: CategoryWithItems[];
  orderingOpen: boolean;
  orderingClosedReason?: string;
  preview?: boolean;
}

export function CustomerMenu({
  slug,
  restaurantName,
  settings,
  menu,
  orderingOpen,
  orderingClosedReason,
  preview = false,
}: Props) {
  const currency = settings.currency || "USD";
  const [lines, setLines] = useState<CartLine[]>([]);
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);
  const [view, setView] = useState<View>("menu");
  const [confirmed, setConfirmed] = useState<{
    orderNumber: string;
    table: number;
    smsStatus: string;
  } | null>(null);

  const subtotal = cartSubtotalCents(lines);
  const count = cartItemCount(lines);

  function addLine(newLine: CartLine) {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.key === newLine.key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          quantity: next[idx].quantity + newLine.quantity,
        };
        return next;
      }
      return [...prev, newLine];
    });
  }

  function setQty(key: string, qty: number) {
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.key !== key)
        : prev.map((l) => (l.key === key ? { ...l, quantity: qty } : l))
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-brand-bg">
      <Header
        name={restaurantName}
        tagline={settings.tagline}
        logoUrl={settings.logo_url}
      />

      {!orderingOpen && (
        <div className="mx-4 mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {orderingClosedReason ?? "Ordering is currently closed."} You can still
          browse the menu.
        </div>
      )}

      {view === "menu" && (
        <MenuView
          menu={menu}
          currency={currency}
          onSelect={(item) => setActiveItem(item)}
        />
      )}

      {view === "review" && (
        <ReviewView
          lines={lines}
          currency={currency}
          settings={settings}
          slug={slug}
          orderingOpen={orderingOpen}
          preview={preview}
          onBack={() => setView("menu")}
          onQty={setQty}
          onConfirmed={(info) => {
            setConfirmed(info);
            setLines([]);
            setView("confirm");
          }}
        />
      )}

      {view === "confirm" && confirmed && (
        <ConfirmView
          info={confirmed}
          restaurantName={restaurantName}
          onDone={() => {
            setConfirmed(null);
            setView("menu");
          }}
        />
      )}

      {/* Sticky cart bar — appears once something is added, on the menu view */}
      {view === "menu" && count > 0 && (
        <div className="sticky bottom-0 z-30 animate-slide-up p-3">
          <button
            onClick={() => setView("review")}
            className="btn-primary w-full justify-between text-base shadow-lift"
          >
            <span className="flex items-center gap-2">
              <span className="chip bg-white/20">{count}</span> View order
            </span>
            <span>{formatMoney(subtotal, currency)}</span>
          </button>
        </div>
      )}

      {activeItem && (
        <ItemModal
          item={activeItem}
          currency={currency}
          onClose={() => setActiveItem(null)}
          onAdd={(line) => {
            addLine(line);
            setActiveItem(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Header({
  name,
  tagline,
  logoUrl,
}: {
  name: string;
  tagline: string | null;
  logoUrl: string | null;
}) {
  return (
    <header className="bg-brand-primary px-5 py-6 text-center text-white">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={`${name} logo`}
          className="mx-auto mb-2 h-14 w-auto object-contain"
        />
      ) : null}
      <h1 className="font-display text-2xl font-bold">{name}</h1>
      {tagline && <p className="mt-1 text-sm opacity-80">{tagline}</p>}
      <p className="mt-2 text-xs uppercase tracking-widest opacity-70">
        Order to your table
      </p>
    </header>
  );
}

// ---------------------------------------------------------------------------
function MenuView({
  menu,
  currency,
  onSelect,
}: {
  menu: CategoryWithItems[];
  currency: string;
  onSelect: (item: MenuItem) => void;
}) {
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  return (
    <div className="pb-28">
      {/* Category quick-nav */}
      <nav
        aria-label="Drink categories"
        className="sticky top-0 z-20 flex gap-2 overflow-x-auto border-b border-black/10 bg-brand-bg/95 px-4 py-3 backdrop-blur"
      >
        {menu.map((c) => (
          <button
            key={c.id}
            onClick={() =>
              sectionRefs.current[c.id]?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
            className="chip shrink-0 border border-black/15 bg-white"
          >
            {c.name}
          </button>
        ))}
      </nav>

      {menu.map((cat) => (
        <section
          key={cat.id}
          ref={(el) => {
            sectionRefs.current[cat.id] = el;
          }}
          className="scroll-mt-16 px-4 pt-6"
        >
          <h2 className="font-display text-xl font-bold">{cat.name}</h2>
          {cat.description && (
            <p className="text-sm text-brand-muted">{cat.description}</p>
          )}
          <ul className="mt-3 space-y-3">
            {cat.items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                currency={currency}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ItemCard({
  item,
  currency,
  onSelect,
}: {
  item: MenuItem;
  currency: string;
  onSelect: (item: MenuItem) => void;
}) {
  const soldOut = item.availability === "sold_out";
  return (
    <li>
      <button
        disabled={soldOut}
        onClick={() => onSelect(item)}
        className="card flex w-full items-stretch gap-3 p-3 text-left disabled:opacity-60"
      >
        {item.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={item.image_alt ?? item.name}
            className="h-20 w-20 shrink-0 rounded-xl object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">{item.name}</span>
            <span className="shrink-0 font-semibold">
              {formatMoney(item.price_cents, currency)}
            </span>
          </div>
          {item.description && (
            <p className="mt-0.5 line-clamp-2 text-sm text-brand-muted">
              {item.description}
            </p>
          )}
          {soldOut ? (
            <span className="chip mt-1 bg-gray-200 text-gray-700">Sold out</span>
          ) : (
            <span className="mt-1 inline-block text-sm font-medium text-brand-secondary">
              {(item.modifier_groups?.length ?? 0) > 0 ? "Customize +" : "Add +"}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
function ItemModal({
  item,
  currency,
  onClose,
  onAdd,
}: {
  item: MenuItem;
  currency: string;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}) {
  const groups = item.modifier_groups ?? [];
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    // Pre-select defaults.
    const init: Record<string, string[]> = {};
    for (const g of groups) {
      const defaults = g.options.filter((o) => o.is_default).map((o) => o.id);
      init[g.id] = defaults;
    }
    return init;
  });
  const [qty, setQty] = useState(1);
  const [special, setSpecial] = useState("");
  const [error, setError] = useState<string | null>(null);

  const unitCents = useMemo(() => {
    let sum = item.price_cents;
    for (const g of groups) {
      for (const optId of selected[g.id] ?? []) {
        const opt = g.options.find((o) => o.id === optId);
        if (opt) sum += opt.price_delta_cents;
      }
    }
    return sum;
  }, [item, groups, selected]);

  function toggle(group: ModifierGroup, optionId: string) {
    setSelected((prev) => {
      const cur = prev[group.id] ?? [];
      if (group.selection_type === "single") {
        return { ...prev, [group.id]: [optionId] };
      }
      // multi
      const exists = cur.includes(optionId);
      const next = exists
        ? cur.filter((id) => id !== optionId)
        : [...cur, optionId];
      return { ...prev, [group.id]: next };
    });
  }

  function add() {
    const err = validateSelection(item, selected);
    if (err) {
      setError(err);
      return;
    }
    const modifiers: CartModifier[] = [];
    for (const g of groups) {
      for (const optId of selected[g.id] ?? []) {
        const opt = g.options.find((o) => o.id === optId);
        if (opt) {
          modifiers.push({
            group_id: g.id,
            group_name: g.name,
            option_id: opt.id,
            option_name: opt.name,
            price_delta_cents: opt.price_delta_cents,
          });
        }
      }
    }
    const optionIds = modifiers.map((m) => m.option_id);
    onAdd({
      key: lineKey(item.id, optionIds, special),
      item_id: item.id,
      name: item.name,
      base_price_cents: item.price_cents,
      quantity: qty,
      modifiers,
      special_instructions: special.trim(),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Customize ${item.name}`}
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg animate-slide-up overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-bold">{item.name}</h3>
            {item.description && (
              <p className="mt-1 text-sm text-brand-muted">{item.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-2xl leading-none hover:bg-black/5"
          >
            ×
          </button>
        </div>

        {groups.map((g) => (
          <fieldset key={g.id} className="mt-5">
            <legend className="font-semibold">
              {g.name}{" "}
              <span className="text-xs font-normal text-brand-muted">
                {g.required ? "(required)" : "(optional)"} ·{" "}
                {g.selection_type === "single" ? "choose one" : "choose any"}
              </span>
            </legend>
            <div className="mt-2 space-y-1">
              {g.options.map((o) => {
                const checked = (selected[g.id] ?? []).includes(o.id);
                return (
                  <label
                    key={o.id}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-3 ${
                      checked
                        ? "border-brand-secondary bg-brand-secondary/10"
                        : "border-black/10"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type={g.selection_type === "single" ? "radio" : "checkbox"}
                        name={`grp-${g.id}`}
                        checked={checked}
                        onChange={() => toggle(g, o.id)}
                        className="h-5 w-5"
                      />
                      {o.name}
                    </span>
                    {o.price_delta_cents > 0 && (
                      <span className="text-sm text-brand-muted">
                        +{formatMoney(o.price_delta_cents, currency)}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        <div className="mt-5">
          <label className="label" htmlFor="special">
            Special instructions (optional)
          </label>
          <textarea
            id="special"
            className="input py-3"
            rows={2}
            maxLength={300}
            placeholder="e.g. extra cold, easy on the mixer"
            value={special}
            onChange={(e) => setSpecial(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <div className="flex items-center rounded-xl border border-black/15">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="px-4 py-3 text-xl"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-8 text-center font-semibold" aria-live="polite">
              {qty}
            </span>
            <button
              onClick={() => setQty((q) => Math.min(50, q + 1))}
              className="px-4 py-3 text-xl"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <button onClick={add} className="btn-primary flex-1 justify-between">
            <span>Add to order</span>
            <span>{formatMoney(unitCents * qty, currency)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function ReviewView({
  lines,
  currency,
  settings,
  slug,
  orderingOpen,
  preview,
  onBack,
  onQty,
  onConfirmed,
}: {
  lines: CartLine[];
  currency: string;
  settings: PublicSettings;
  slug: string;
  orderingOpen: boolean;
  preview: boolean;
  onBack: () => void;
  onQty: (key: string, qty: number) => void;
  onConfirmed: (info: {
    orderNumber: string;
    table: number;
    smsStatus: string;
  }) => void;
}) {
  const [table, setTable] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One idempotency key per checkout attempt; regenerated on failure retry.
  const idemRef = useRef<string>(cryptoRandom());

  const subtotal = cartSubtotalCents(lines);
  const tableNum = Number.parseInt(table, 10);
  const tableValid =
    Number.isInteger(tableNum) &&
    tableNum >= settings.table_min &&
    tableNum <= settings.table_max;

  async function submit() {
    setError(null);
    if (preview) {
      setError("This is a preview. Ordering is disabled here.");
      return;
    }
    if (!orderingOpen) {
      setError("Ordering is currently closed.");
      return;
    }
    if (lines.length === 0) {
      setError("Your order is empty.");
      return;
    }
    if (!tableValid) {
      setError(
        `Please enter a valid table number between ${settings.table_min} and ${settings.table_max}.`
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restaurant_slug: slug,
          table_number: tableNum,
          customer_notes: notes.trim() || undefined,
          idempotency_key: idemRef.current,
          items: toOrderItems(lines),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "We couldn't submit your order. Please try again.");
        // New key so a genuine retry isn't blocked as a duplicate.
        idemRef.current = cryptoRandom();
        setSubmitting(false);
        return;
      }
      onConfirmed({
        orderNumber: json.order_number,
        table: tableNum,
        smsStatus: json.sms_status,
      });
    } catch {
      setError("Network error. Please check your connection and try again.");
      idemRef.current = cryptoRandom();
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 pb-28 pt-4">
      <button onClick={onBack} className="text-sm text-brand-muted hover:underline">
        ← Add more drinks
      </button>
      <h2 className="mt-2 font-display text-2xl font-bold">Your order</h2>

      <ul className="mt-4 space-y-3">
        {lines.map((line) => (
          <li key={line.key} className="card p-3">
            <div className="flex justify-between gap-2">
              <span className="font-semibold">{line.name}</span>
              <span className="font-semibold">
                {formatMoney(lineTotalCents(line), currency)}
              </span>
            </div>
            {line.modifiers.length > 0 && (
              <ul className="mt-1 text-sm text-brand-muted">
                {line.modifiers.map((m) => (
                  <li key={m.option_id}>
                    {m.group_name}: {m.option_name}
                    {m.price_delta_cents > 0 &&
                      ` (+${formatMoney(m.price_delta_cents, currency)})`}
                  </li>
                ))}
              </ul>
            )}
            {line.special_instructions && (
              <p className="mt-1 text-sm italic text-brand-muted">
                “{line.special_instructions}”
              </p>
            )}
            <div className="mt-2 flex items-center gap-3">
              <div className="flex items-center rounded-lg border border-black/15">
                <button
                  onClick={() => onQty(line.key, line.quantity - 1)}
                  className="px-3 py-1.5 text-lg"
                  aria-label={`Decrease ${line.name}`}
                >
                  −
                </button>
                <span className="w-7 text-center text-sm font-semibold">
                  {line.quantity}
                </span>
                <button
                  onClick={() => onQty(line.key, line.quantity + 1)}
                  className="px-3 py-1.5 text-lg"
                  aria-label={`Increase ${line.name}`}
                >
                  +
                </button>
              </div>
              <span className="text-sm text-brand-muted">
                {formatMoney(lineUnitCents(line), currency)} each
              </span>
              <button
                onClick={() => onQty(line.key, 0)}
                className="ml-auto text-sm text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex justify-between border-t border-black/10 pt-3 text-lg font-bold">
        <span>Estimated subtotal</span>
        <span>{formatMoney(subtotal, currency)}</span>
      </div>

      {/* Table number */}
      <div className="mt-5">
        <label className="label" htmlFor="table">
          Table number <span aria-hidden className="text-red-600">*</span>
          <span className="ml-1 font-normal text-brand-muted">
            (required · {settings.table_min}–{settings.table_max})
          </span>
        </label>
        <input
          id="table"
          className="input text-lg"
          inputMode="numeric"
          required
          value={table}
          onChange={(e) => setTable(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder={`e.g. ${settings.table_min}`}
          aria-invalid={table !== "" && !tableValid}
        />
        {table !== "" && !tableValid && (
          <p className="mt-1 text-sm text-red-600">
            Enter a table number between {settings.table_min} and{" "}
            {settings.table_max}.
          </p>
        )}
      </div>

      {/* Order notes */}
      <div className="mt-4">
        <label className="label" htmlFor="notes">
          Notes for the bar (optional)
        </label>
        <textarea
          id="notes"
          className="input py-3"
          rows={2}
          maxLength={500}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. celebrating a birthday, please bring straws"
        />
      </div>

      <p className="mt-4 rounded-xl bg-black/5 p-3 text-xs text-brand-muted">
        {settings.order_disclaimer}
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 z-30 mt-4 -mx-4 border-t border-black/10 bg-brand-bg/95 p-4 backdrop-blur">
        <button
          onClick={submit}
          disabled={submitting || lines.length === 0 || preview}
          className="btn-primary w-full justify-between text-base"
        >
          <span>
            {preview
              ? "Preview — ordering disabled"
              : submitting
              ? "Submitting…"
              : "Submit order"}
          </span>
          <span>{formatMoney(subtotal, currency)}</span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function ConfirmView({
  info,
  restaurantName,
  onDone,
}: {
  info: { orderNumber: string; table: number; smsStatus: string };
  restaurantName: string;
  onDone: () => void;
}) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-4xl">
        ✓
      </div>
      <h2 className="mt-5 font-display text-2xl font-bold">Order received!</h2>
      <p className="mt-2 text-brand-muted">
        Thanks — {restaurantName} has your order for table {info.table}. Please
        hang tight; a server will bring your drinks over.
      </p>
      <div className="mt-5 rounded-2xl bg-white px-6 py-4 shadow-card">
        <p className="text-sm text-brand-muted">Your order number</p>
        <p className="font-display text-3xl font-bold">{info.orderNumber}</p>
      </div>
      <p className="mt-4 text-xs text-brand-muted">
        Submitting an order doesn&apos;t guarantee every item is available; staff
        may confirm with you.
      </p>
      <button onClick={onDone} className="btn-ghost mt-6">
        Order more drinks
      </button>
    </div>
  );
}

// Small helper — uses the Web Crypto UUID where available, else a fallback.
function cryptoRandom(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `k-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}
