import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/format";
import type { Category, ModifierGroup, ModifierOption } from "@/lib/types";
import {
  updateItem,
  uploadItemImage,
  removeItemImage,
  addModifierGroup,
  deleteModifierGroup,
  addModifierOption,
  deleteModifierOption,
} from "@/lib/actions/menu";

export default async function ItemEditor({
  params,
}: {
  params: { itemId: string };
}) {
  const { restaurantId } = await requireAdmin();
  const supabase = createClient();

  const { data: item } = await supabase
    .from("menu_items")
    .select("*")
    .eq("id", params.itemId)
    .maybeSingle();
  if (!item) notFound();

  const [{ data: categories }, { data: groups }] = await Promise.all([
    supabase
      .from("categories")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("sort_order"),
    supabase
      .from("item_modifier_groups")
      .select("*")
      .eq("item_id", params.itemId)
      .order("sort_order"),
  ]);

  const groupList = (groups ?? []) as ModifierGroup[];
  let optionsByGroup = new Map<string, ModifierOption[]>();
  if (groupList.length > 0) {
    const { data: options } = await supabase
      .from("modifier_options")
      .select("*")
      .in(
        "group_id",
        groupList.map((g) => g.id)
      )
      .order("sort_order");
    for (const o of (options ?? []) as ModifierOption[]) {
      const arr = optionsByGroup.get(o.group_id) ?? [];
      arr.push(o);
      optionsByGroup.set(o.group_id, arr);
    }
  }

  return (
    <div className="max-w-2xl">
      <Link href="/admin/menu" className="text-sm text-brand-muted hover:underline">
        ← Back to menu
      </Link>
      <h1 className="mt-2 font-display text-2xl font-bold">Edit drink</h1>

      {/* Core fields */}
      <form action={updateItem} className="card mt-4 space-y-4 p-4">
        <input type="hidden" name="id" value={item.id} />
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" className="input" defaultValue={item.name} />
        </div>
        <div>
          <label className="label" htmlFor="description">Description</label>
          <input
            id="description"
            name="description"
            className="input"
            defaultValue={item.description ?? ""}
          />
        </div>
        <div className="flex gap-4">
          <div>
            <label className="label" htmlFor="price">Base price</label>
            <input
              id="price"
              name="price"
              className="input w-32"
              inputMode="decimal"
              defaultValue={(item.price_cents / 100).toFixed(2)}
            />
          </div>
          <div className="flex-1">
            <label className="label" htmlFor="category_id">Category</label>
            <select
              id="category_id"
              name="category_id"
              className="input"
              defaultValue={item.category_id ?? ""}
            >
              {(categories as Category[] | null)?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="image_alt">
            Image description (alt text for accessibility)
          </label>
          <input
            id="image_alt"
            name="image_alt"
            className="input"
            defaultValue={item.image_alt ?? ""}
            placeholder="e.g. Margarita in a salt-rimmed glass with lime"
          />
        </div>
        <button className="btn-primary">Save changes</button>
      </form>

      {/* Image */}
      <div className="card mt-4 p-4">
        <h2 className="font-semibold">Drink photo</h2>
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={item.image_alt ?? item.name}
            className="mt-3 h-40 w-40 rounded-xl object-cover"
          />
        ) : (
          <p className="mt-2 text-sm text-brand-muted">No photo yet.</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <form action={uploadItemImage} className="flex items-center gap-2">
            <input type="hidden" name="id" value={item.id} />
            <input
              type="file"
              name="image"
              accept="image/jpeg,image/png,image/webp"
              className="text-sm"
              aria-label="Upload drink photo"
            />
            <button className="btn-secondary text-sm">Upload</button>
          </form>
          {item.image_url && (
            <form action={removeItemImage}>
              <input type="hidden" name="id" value={item.id} />
              <button className="btn-ghost text-sm text-red-600">Remove photo</button>
            </form>
          )}
        </div>
      </div>

      {/* Modifiers */}
      <div className="card mt-4 p-4">
        <h2 className="font-semibold">Modifications</h2>
        <p className="text-sm text-brand-muted">
          Groups let guests customize a drink (e.g. Ice, Size, Whiskey). Options
          can add to the price.
        </p>

        <div className="mt-4 space-y-4">
          {groupList.map((g) => (
            <div key={g.id} className="rounded-xl border border-black/10 p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  {g.name}{" "}
                  <span className="text-xs text-brand-muted">
                    ({g.selection_type === "single" ? "choose one" : "choose any"}
                    {g.required ? ", required" : ""})
                  </span>
                </p>
                <form action={deleteModifierGroup}>
                  <input type="hidden" name="id" value={g.id} />
                  <input type="hidden" name="item_id" value={item.id} />
                  <button className="text-xs text-red-600 hover:underline">
                    Delete group
                  </button>
                </form>
              </div>

              <ul className="mt-2 space-y-1">
                {(optionsByGroup.get(g.id) ?? []).map((o) => (
                  <li key={o.id} className="flex items-center justify-between text-sm">
                    <span>
                      {o.name}
                      {o.price_delta_cents > 0 && (
                        <span className="ml-1 text-brand-muted">
                          +{formatMoney(o.price_delta_cents)}
                        </span>
                      )}
                    </span>
                    <form action={deleteModifierOption}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="item_id" value={item.id} />
                      <button className="text-xs text-red-600 hover:underline">
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>

              <form action={addModifierOption} className="mt-2 flex flex-wrap gap-2">
                <input type="hidden" name="group_id" value={g.id} />
                <input type="hidden" name="item_id" value={item.id} />
                <input
                  name="name"
                  className="input max-w-[180px] text-sm"
                  placeholder="Option name"
                  aria-label="Option name"
                />
                <input
                  name="price_delta"
                  className="input w-24 text-sm"
                  placeholder="+$0.00"
                  inputMode="decimal"
                  aria-label="Extra charge"
                />
                <button className="btn-ghost text-sm">Add option</button>
              </form>
            </div>
          ))}
        </div>

        {/* Add group */}
        <form action={addModifierGroup} className="mt-4 flex flex-wrap items-end gap-2 border-t border-black/10 pt-4">
          <input type="hidden" name="item_id" value={item.id} />
          <div>
            <label className="label" htmlFor="mg-name">New group</label>
            <input
              id="mg-name"
              name="name"
              className="input max-w-[180px]"
              placeholder="e.g. Ice"
            />
          </div>
          <div>
            <label className="label" htmlFor="mg-type">Type</label>
            <select id="mg-type" name="selection_type" className="input">
              <option value="multi">Choose any</option>
              <option value="single">Choose one</option>
            </select>
          </div>
          <label className="flex items-center gap-2 pb-3 text-sm">
            <input type="checkbox" name="required" /> Required
          </label>
          <button className="btn-secondary">Add group</button>
        </form>
      </div>
    </div>
  );
}
