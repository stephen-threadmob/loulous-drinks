import { NextRequest, NextResponse } from "next/server";
import { getAdminApiContext } from "@/lib/api-auth";
import { sanitizeText } from "@/lib/validation";
import type { ExtractedCategory } from "@/lib/types";

export const runtime = "nodejs";

// POST /api/uploads/[id]/publish
// Publishes an admin-reviewed draft into the live menu. The body is the edited
// list of categories (the admin may have corrected names/prices/mods on the
// review screen). Categories are matched to existing ones by name; new items
// are appended. The upload is then marked "published".
//
// IMPORTANT: publishing is a deliberate admin action — extraction alone never
// writes to the live menu.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getAdminApiContext();
  if (!ctx) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const { supabase, restaurantId } = ctx;

  let body: { categories?: ExtractedCategory[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const categories = Array.isArray(body.categories) ? body.categories : [];
  if (categories.length === 0) {
    return NextResponse.json(
      { error: "There are no categories to publish." },
      { status: 400 }
    );
  }

  // Load existing categories to match by name (case-insensitive).
  const { data: existingCats } = await supabase
    .from("categories")
    .select("id, name, sort_order")
    .eq("restaurant_id", restaurantId);

  const byName = new Map<string, { id: string }>();
  let maxSort = 0;
  for (const c of existingCats ?? []) {
    byName.set(c.name.trim().toLowerCase(), { id: c.id });
    if (c.sort_order > maxSort) maxSort = c.sort_order;
  }

  let itemsCreated = 0;

  for (const cat of categories) {
    const catName = sanitizeText(cat.name, 80) || "Uncategorized";
    let categoryId: string | undefined = byName.get(catName.toLowerCase())?.id;

    if (!categoryId) {
      maxSort += 1;
      const { data: newCat, error } = await supabase
        .from("categories")
        .insert({
          restaurant_id: restaurantId,
          name: catName,
          sort_order: maxSort,
        })
        .select("id")
        .single();
      if (error || !newCat) continue;
      categoryId = newCat.id as string;
      byName.set(catName.toLowerCase(), { id: categoryId });
    }
    // At this point categoryId is guaranteed set; guard keeps TS + runtime safe.
    if (!categoryId) continue;

    // Determine current max item sort in this category.
    const { data: sortRow } = await supabase
      .from("menu_items")
      .select("sort_order")
      .eq("category_id", categoryId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    let itemSort = sortRow?.sort_order ?? 0;

    for (const item of cat.items ?? []) {
      const name = sanitizeText(item.name, 120);
      if (!name) continue;
      itemSort += 1;

      const { data: newItem, error: itemErr } = await supabase
        .from("menu_items")
        .insert({
          restaurant_id: restaurantId,
          category_id: categoryId,
          name,
          description: sanitizeText(item.description ?? "", 300) || null,
          price_cents: Math.max(0, Math.round(item.price_cents ?? 0)),
          sort_order: itemSort,
          // Items with an unreadable price are hidden until the admin sets one.
          availability: item.price_cents == null ? "hidden" : "available",
        })
        .select("id")
        .single();
      if (itemErr || !newItem) continue;
      itemsCreated += 1;

      let groupSort = 0;

      // Glass/bottle wines -> a required Size group.
      if (item.bottle_price_cents != null && item.price_cents != null) {
        groupSort += 1;
        const { data: grp } = await supabase
          .from("item_modifier_groups")
          .insert({
            restaurant_id: restaurantId,
            item_id: newItem.id,
            name: "Size",
            selection_type: "single",
            required: true,
            min_select: 1,
            max_select: 1,
            sort_order: groupSort,
          })
          .select("id")
          .single();
        if (grp) {
          await supabase.from("modifier_options").insert([
            {
              restaurant_id: restaurantId,
              group_id: grp.id,
              name: "Glass",
              price_delta_cents: 0,
              is_default: true,
              sort_order: 0,
            },
            {
              restaurant_id: restaurantId,
              group_id: grp.id,
              name: "Bottle",
              price_delta_cents: item.bottle_price_cents - item.price_cents,
              is_default: false,
              sort_order: 1,
            },
          ]);
        }
      }

      // Any extracted modifier groups.
      for (const mg of item.modifier_groups ?? []) {
        groupSort += 1;
        const { data: grp } = await supabase
          .from("item_modifier_groups")
          .insert({
            restaurant_id: restaurantId,
            item_id: newItem.id,
            name: sanitizeText(mg.name, 60) || "Options",
            selection_type: mg.selection_type === "single" ? "single" : "multi",
            required: !!mg.required,
            min_select: mg.required ? 1 : 0,
            max_select: mg.selection_type === "single" ? 1 : null,
            sort_order: groupSort,
          })
          .select("id")
          .single();
        if (!grp) continue;

        const optionRows = (mg.options ?? []).map((o, idx) => ({
          restaurant_id: restaurantId,
          group_id: grp.id,
          name: sanitizeText(o.name, 60) || `Option ${idx + 1}`,
          price_delta_cents: Math.max(0, Math.round(o.price_delta_cents ?? 0)),
          is_default: false,
          sort_order: idx,
        }));
        if (optionRows.length > 0) {
          await supabase.from("modifier_options").insert(optionRows);
        }
      }
    }
  }

  // Mark the upload published.
  await supabase
    .from("menu_uploads")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("restaurant_id", restaurantId);

  return NextResponse.json({ ok: true, itemsCreated });
}
