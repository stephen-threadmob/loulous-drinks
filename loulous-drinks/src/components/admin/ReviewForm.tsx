"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ExtractionResult, ExtractedItem } from "@/lib/types";

type EditItem = ExtractedItem & { _uncertain?: boolean };
interface EditCategory {
  name: string;
  items: EditItem[];
}

function centsToDollars(c: number | null | undefined): string {
  if (c == null) return "";
  return (c / 100).toFixed(2);
}
function dollarsToCents(s: string): number | null {
  const cleaned = s.replace(/[^0-9.]/g, "").trim();
  if (cleaned === "") return null;
  const n = Number.parseFloat(cleaned);
  return Number.isNaN(n) ? null : Math.round(n * 100);
}

export function ReviewForm({
  uploadId,
  initial,
}: {
  uploadId: string;
  initial: ExtractionResult;
}) {
  const router = useRouter();
  const [cats, setCats] = useState<EditCategory[]>(
    initial.categories.map((c) => ({
      name: c.name,
      items: c.items.map((i) => ({ ...i, _uncertain: i.uncertain })),
    }))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateItem(ci: number, ii: number, patch: Partial<EditItem>) {
    setCats((prev) => {
      const next = structuredClone(prev);
      next[ci].items[ii] = { ...next[ci].items[ii], ...patch };
      return next;
    });
  }
  function removeItem(ci: number, ii: number) {
    setCats((prev) => {
      const next = structuredClone(prev);
      next[ci].items.splice(ii, 1);
      return next;
    });
  }
  function addItem(ci: number) {
    setCats((prev) => {
      const next = structuredClone(prev);
      next[ci].items.push({ name: "", description: "", price_cents: 0 });
      return next;
    });
  }
  function updateCatName(ci: number, name: string) {
    setCats((prev) => {
      const next = structuredClone(prev);
      next[ci].name = name;
      return next;
    });
  }

  async function publish() {
    setBusy(true);
    setError(null);
    // Drop empty items/categories.
    const payload = {
      categories: cats
        .map((c) => ({
          name: c.name.trim(),
          items: c.items
            .filter((i) => i.name.trim() !== "")
            .map((i) => ({
              name: i.name.trim(),
              description: i.description?.trim() || undefined,
              price_cents: i.price_cents,
              bottle_price_cents: i.bottle_price_cents ?? undefined,
              modifier_groups: i.modifier_groups,
            })),
        }))
        .filter((c) => c.name !== "" && c.items.length > 0),
    };
    if (payload.categories.length === 0) {
      setError("Add at least one category with one item before publishing.");
      setBusy(false);
      return;
    }
    try {
      const res = await fetch(`/api/uploads/${uploadId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Publishing failed. Please try again.");
        setBusy(false);
        return;
      }
      router.push("/admin/menu?published=1");
    } catch {
      setError("Publishing failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {cats.map((cat, ci) => (
        <div key={ci} className="card p-4">
          <input
            className="input mb-3 font-display text-lg font-bold"
            value={cat.name}
            aria-label="Category name"
            onChange={(e) => updateCatName(ci, e.target.value)}
          />
          <div className="space-y-3">
            {cat.items.map((item, ii) => (
              <div
                key={ii}
                className={`rounded-xl border p-3 ${
                  item._uncertain || item.price_cents == null
                    ? "border-amber-400 bg-amber-50"
                    : "border-black/10"
                }`}
              >
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    className="input"
                    placeholder="Drink name"
                    value={item.name}
                    aria-label="Drink name"
                    onChange={(e) => updateItem(ci, ii, { name: e.target.value })}
                  />
                  <div className="flex items-center gap-2">
                    <span aria-hidden>$</span>
                    <input
                      className="input w-24"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={centsToDollars(item.price_cents)}
                      aria-label="Price"
                      onChange={(e) =>
                        updateItem(ci, ii, {
                          price_cents: dollarsToCents(e.target.value),
                          _uncertain: false,
                        })
                      }
                    />
                  </div>
                </div>
                <input
                  className="input mt-2"
                  placeholder="Description (optional)"
                  value={item.description ?? ""}
                  aria-label="Description"
                  onChange={(e) =>
                    updateItem(ci, ii, { description: e.target.value })
                  }
                />
                {item.bottle_price_cents != null && (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <span className="text-brand-muted">Bottle price $</span>
                    <input
                      className="input w-24"
                      inputMode="decimal"
                      value={centsToDollars(item.bottle_price_cents)}
                      aria-label="Bottle price"
                      onChange={(e) =>
                        updateItem(ci, ii, {
                          bottle_price_cents: dollarsToCents(e.target.value),
                        })
                      }
                    />
                    <span className="text-brand-muted">
                      (glass above becomes the base price)
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  className="mt-2 text-sm text-red-600 hover:underline"
                  onClick={() => removeItem(ci, ii)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn-ghost mt-3 text-sm"
            onClick={() => addItem(ci)}
          >
            + Add item
          </button>
        </div>
      ))}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="sticky bottom-16 z-10 flex gap-3 rounded-xl bg-white/90 p-3 shadow-lift backdrop-blur md:bottom-0">
        <button className="btn-primary" disabled={busy} onClick={publish}>
          {busy ? "Publishing…" : "Publish to live menu"}
        </button>
        <a href="/admin/menu" className="btn-ghost">
          Cancel
        </a>
      </div>
    </div>
  );
}
