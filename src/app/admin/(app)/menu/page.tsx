import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getFullMenu, getPublicSettings } from "@/lib/menu";
import { formatMoney } from "@/lib/format";
import { AvailabilitySelect } from "@/components/admin/AvailabilitySelect";
import {
  createCategory,
  renameCategory,
  toggleCategoryHidden,
  deleteCategory,
  moveCategory,
  createItem,
  deleteItem,
  moveItem,
} from "@/lib/actions/menu";

export default async function MenuPage({
  searchParams,
}: {
  searchParams: { published?: string };
}) {
  const { restaurantId } = await requireAdmin();
  const supabase = createClient();
  const [menu, settings] = await Promise.all([
    getFullMenu(supabase, restaurantId, { includeHidden: true }),
    getPublicSettings(supabase, restaurantId),
  ]);
  const currency = settings?.currency ?? "USD";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Menu</h1>
        <div className="flex gap-2">
          <Link href="/admin/preview" className="btn-ghost text-sm">
            Preview customer menu
          </Link>
          <Link href="/admin/upload" className="btn-secondary text-sm">
            Upload menu file
          </Link>
        </div>
      </div>

      {searchParams.published && (
        <p className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
          Menu published. New items are live for customers now.
        </p>
      )}

      {/* Add category */}
      <form action={createCategory} className="mt-6 flex gap-2">
        <input
          name="name"
          className="input max-w-xs"
          placeholder="New category name (e.g. Specials)"
          aria-label="New category name"
        />
        <button className="btn-primary">Add category</button>
      </form>

      {menu.length === 0 && (
        <p className="mt-8 text-brand-muted">
          No categories yet. Add one above, or upload a menu file to get started.
        </p>
      )}

      <div className="mt-6 space-y-6">
        {menu.map((cat) => (
          <section key={cat.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <form action={renameCategory} className="flex items-center gap-2">
                <input type="hidden" name="id" value={cat.id} />
                <input
                  name="name"
                  defaultValue={cat.name}
                  aria-label="Category name"
                  className="input max-w-[220px] font-display text-lg font-bold"
                />
                <button className="btn-ghost text-xs">Rename</button>
              </form>

              <div className="flex items-center gap-1">
                {cat.is_hidden && (
                  <span className="chip bg-gray-200 text-gray-700">Hidden</span>
                )}
                <form action={moveCategory}>
                  <input type="hidden" name="id" value={cat.id} />
                  <input type="hidden" name="dir" value="up" />
                  <button className="btn-ghost px-2 text-xs" aria-label="Move category up">↑</button>
                </form>
                <form action={moveCategory}>
                  <input type="hidden" name="id" value={cat.id} />
                  <input type="hidden" name="dir" value="down" />
                  <button className="btn-ghost px-2 text-xs" aria-label="Move category down">↓</button>
                </form>
                <form action={toggleCategoryHidden}>
                  <input type="hidden" name="id" value={cat.id} />
                  <input type="hidden" name="hidden" value={(!cat.is_hidden).toString()} />
                  <button className="btn-ghost text-xs">
                    {cat.is_hidden ? "Show" : "Hide"}
                  </button>
                </form>
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={cat.id} />
                  <button className="btn-ghost text-xs text-red-600">Delete</button>
                </form>
              </div>
            </div>

            {/* Items */}
            <ul className="mt-4 divide-y divide-black/5">
              {cat.items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 py-2">
                  <div className="min-w-[160px] flex-1">
                    <p className="font-medium">
                      {item.name}
                      {item.modifier_groups && item.modifier_groups.length > 0 && (
                        <span className="ml-2 text-xs text-brand-muted">
                          {item.modifier_groups.length} modifier group
                          {item.modifier_groups.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </p>
                    {item.description && (
                      <p className="text-sm text-brand-muted">{item.description}</p>
                    )}
                  </div>
                  <span className="w-16 text-right font-semibold">
                    {formatMoney(item.price_cents, currency)}
                  </span>
                  <AvailabilitySelect itemId={item.id} value={item.availability} />
                  <div className="flex items-center gap-1">
                    <form action={moveItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="category_id" value={cat.id} />
                      <input type="hidden" name="dir" value="up" />
                      <button className="btn-ghost px-2 text-xs" aria-label="Move item up">↑</button>
                    </form>
                    <form action={moveItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="category_id" value={cat.id} />
                      <input type="hidden" name="dir" value="down" />
                      <button className="btn-ghost px-2 text-xs" aria-label="Move item down">↓</button>
                    </form>
                    <Link href={`/admin/menu/${item.id}`} className="btn-ghost text-xs">
                      Edit
                    </Link>
                    <form action={deleteItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <button className="btn-ghost text-xs text-red-600">Delete</button>
                    </form>
                  </div>
                </li>
              ))}
              {cat.items.length === 0 && (
                <li className="py-2 text-sm text-brand-muted">No items yet.</li>
              )}
            </ul>

            {/* Quick add item */}
            <form action={createItem} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="category_id" value={cat.id} />
              <input
                name="name"
                className="input max-w-[220px]"
                placeholder="New item name"
                aria-label="New item name"
              />
              <input
                name="price"
                className="input w-28"
                placeholder="$ price"
                inputMode="decimal"
                aria-label="New item price"
              />
              <button className="btn-secondary text-sm">Add item</button>
            </form>
          </section>
        ))}
      </div>
    </div>
  );
}
