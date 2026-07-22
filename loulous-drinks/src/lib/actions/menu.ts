"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminApiContext } from "@/lib/api-auth";
import { parseMoneyToCents } from "@/lib/format";
import { sanitizeText, ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/validation";

// All actions here run RLS-scoped to the signed-in admin's restaurant, so a
// missing/invalid session simply results in no rows being affected. We still
// resolve the restaurant id to stamp new rows.

async function ctxOrThrow() {
  const ctx = await getAdminApiContext();
  if (!ctx) throw new Error("Not authorized");
  return ctx;
}

function refresh() {
  revalidatePath("/admin/menu");
  revalidatePath("/admin/preview");
}

// ---- Categories ------------------------------------------------------------
export async function createCategory(formData: FormData) {
  const { supabase, restaurantId } = await ctxOrThrow();
  const name = sanitizeText(String(formData.get("name") ?? ""), 80);
  if (!name) return;
  const { data } = await supabase
    .from("categories")
    .select("sort_order")
    .eq("restaurant_id", restaurantId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = (data?.sort_order ?? 0) + 1;
  await supabase
    .from("categories")
    .insert({ restaurant_id: restaurantId, name, sort_order: nextSort });
  refresh();
}

export async function renameCategory(formData: FormData) {
  const { supabase } = await ctxOrThrow();
  const id = String(formData.get("id") ?? "");
  const name = sanitizeText(String(formData.get("name") ?? ""), 80);
  if (!id || !name) return;
  await supabase.from("categories").update({ name }).eq("id", id);
  refresh();
}

export async function toggleCategoryHidden(formData: FormData) {
  const { supabase } = await ctxOrThrow();
  const id = String(formData.get("id") ?? "");
  const hidden = String(formData.get("hidden") ?? "") === "true";
  await supabase.from("categories").update({ is_hidden: hidden }).eq("id", id);
  refresh();
}

export async function deleteCategory(formData: FormData) {
  const { supabase } = await ctxOrThrow();
  const id = String(formData.get("id") ?? "");
  await supabase.from("categories").delete().eq("id", id);
  refresh();
}

// Swap sort_order with the adjacent category in the given direction.
export async function moveCategory(formData: FormData) {
  const { supabase, restaurantId } = await ctxOrThrow();
  const id = String(formData.get("id") ?? "");
  const dir = String(formData.get("dir") ?? "up");
  await swapSort(supabase, "categories", restaurantId, id, dir, null);
  refresh();
}

// ---- Items -----------------------------------------------------------------
export async function createItem(formData: FormData) {
  const { supabase, restaurantId } = await ctxOrThrow();
  const categoryId = String(formData.get("category_id") ?? "");
  const name = sanitizeText(String(formData.get("name") ?? ""), 120);
  const price = parseMoneyToCents(String(formData.get("price") ?? "")) ?? 0;
  if (!categoryId || !name) return;
  const { data } = await supabase
    .from("menu_items")
    .select("sort_order")
    .eq("category_id", categoryId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = (data?.sort_order ?? 0) + 1;
  await supabase.from("menu_items").insert({
    restaurant_id: restaurantId,
    category_id: categoryId,
    name,
    price_cents: price,
    sort_order: nextSort,
  });
  refresh();
}

export async function updateItem(formData: FormData) {
  const { supabase } = await ctxOrThrow();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const patch: Record<string, unknown> = {
    name: sanitizeText(String(formData.get("name") ?? ""), 120),
    description: sanitizeText(String(formData.get("description") ?? ""), 300) || null,
    price_cents: parseMoneyToCents(String(formData.get("price") ?? "")) ?? 0,
    image_alt: sanitizeText(String(formData.get("image_alt") ?? ""), 160) || null,
  };
  const categoryId = String(formData.get("category_id") ?? "");
  if (categoryId) patch.category_id = categoryId;
  await supabase.from("menu_items").update(patch).eq("id", id);
  revalidatePath("/admin/menu");
  revalidatePath(`/admin/menu/${id}`);
  revalidatePath("/admin/preview");
}

export async function setAvailability(formData: FormData) {
  const { supabase } = await ctxOrThrow();
  const id = String(formData.get("id") ?? "");
  const availability = String(formData.get("availability") ?? "available");
  if (!["available", "sold_out", "hidden"].includes(availability)) return;
  await supabase.from("menu_items").update({ availability }).eq("id", id);
  refresh();
}

export async function deleteItem(formData: FormData) {
  const { supabase } = await ctxOrThrow();
  const id = String(formData.get("id") ?? "");
  await supabase.from("menu_items").delete().eq("id", id);
  refresh();
}

export async function moveItem(formData: FormData) {
  const { supabase, restaurantId } = await ctxOrThrow();
  const id = String(formData.get("id") ?? "");
  const dir = String(formData.get("dir") ?? "up");
  const categoryId = String(formData.get("category_id") ?? "");
  await swapSort(supabase, "menu_items", restaurantId, id, dir, categoryId);
  refresh();
}

// ---- Item image ------------------------------------------------------------
export async function uploadItemImage(formData: FormData) {
  const { supabase, restaurantId } = await ctxOrThrow();
  const id = String(formData.get("id") ?? "");
  const file = formData.get("image");
  if (!id || !(file instanceof File) || file.size === 0) return;

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Image must be JPG, PNG, or WEBP.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be under 5 MB.");
  }

  const ext = file.type.split("/")[1] || "jpg";
  const path = `${restaurantId}/${id}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));
  const { error } = await supabase.storage
    .from("drink-images")
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (error) throw new Error("Image upload failed.");

  const { data: pub } = supabase.storage.from("drink-images").getPublicUrl(path);
  await supabase
    .from("menu_items")
    .update({ image_url: pub.publicUrl })
    .eq("id", id);
  revalidatePath(`/admin/menu/${id}`);
  refresh();
}

export async function removeItemImage(formData: FormData) {
  const { supabase } = await ctxOrThrow();
  const id = String(formData.get("id") ?? "");
  await supabase.from("menu_items").update({ image_url: null }).eq("id", id);
  revalidatePath(`/admin/menu/${id}`);
  refresh();
}

// ---- Modifier groups + options --------------------------------------------
export async function addModifierGroup(formData: FormData) {
  const { supabase, restaurantId } = await ctxOrThrow();
  const itemId = String(formData.get("item_id") ?? "");
  const name = sanitizeText(String(formData.get("name") ?? ""), 60);
  const selection = String(formData.get("selection_type") ?? "multi");
  const required = String(formData.get("required") ?? "") === "on";
  if (!itemId || !name) return;
  const { data } = await supabase
    .from("item_modifier_groups")
    .select("sort_order")
    .eq("item_id", itemId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  await supabase.from("item_modifier_groups").insert({
    restaurant_id: restaurantId,
    item_id: itemId,
    name,
    selection_type: selection === "single" ? "single" : "multi",
    required,
    min_select: required ? 1 : 0,
    max_select: selection === "single" ? 1 : null,
    sort_order: (data?.sort_order ?? 0) + 1,
  });
  revalidatePath(`/admin/menu/${itemId}`);
}

export async function deleteModifierGroup(formData: FormData) {
  const { supabase } = await ctxOrThrow();
  const id = String(formData.get("id") ?? "");
  const itemId = String(formData.get("item_id") ?? "");
  await supabase.from("item_modifier_groups").delete().eq("id", id);
  revalidatePath(`/admin/menu/${itemId}`);
}

export async function addModifierOption(formData: FormData) {
  const { supabase, restaurantId } = await ctxOrThrow();
  const groupId = String(formData.get("group_id") ?? "");
  const itemId = String(formData.get("item_id") ?? "");
  const name = sanitizeText(String(formData.get("name") ?? ""), 60);
  const priceDelta = parseMoneyToCents(String(formData.get("price_delta") ?? "")) ?? 0;
  if (!groupId || !name) return;
  const { data } = await supabase
    .from("modifier_options")
    .select("sort_order")
    .eq("group_id", groupId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  await supabase.from("modifier_options").insert({
    restaurant_id: restaurantId,
    group_id: groupId,
    name,
    price_delta_cents: priceDelta,
    sort_order: (data?.sort_order ?? 0) + 1,
  });
  revalidatePath(`/admin/menu/${itemId}`);
}

export async function deleteModifierOption(formData: FormData) {
  const { supabase } = await ctxOrThrow();
  const id = String(formData.get("id") ?? "");
  const itemId = String(formData.get("item_id") ?? "");
  await supabase.from("modifier_options").delete().eq("id", id);
  revalidatePath(`/admin/menu/${itemId}`);
}

// ---- helper: swap sort_order with the neighbor -----------------------------
async function swapSort(
  supabase: ReturnType<typeof createClient>,
  table: "categories" | "menu_items",
  restaurantId: string,
  id: string,
  dir: string,
  categoryId: string | null
) {
  const { data: current } = await supabase
    .from(table)
    .select("id, sort_order")
    .eq("id", id)
    .maybeSingle();
  if (!current) return;

  let q = supabase
    .from(table)
    .select("id, sort_order")
    .eq("restaurant_id", restaurantId);
  if (categoryId) q = q.eq("category_id", categoryId);

  if (dir === "up") {
    q = q.lt("sort_order", current.sort_order).order("sort_order", { ascending: false });
  } else {
    q = q.gt("sort_order", current.sort_order).order("sort_order", { ascending: true });
  }
  const { data: neighbor } = await q.limit(1).maybeSingle();
  if (!neighbor) return;

  await supabase.from(table).update({ sort_order: neighbor.sort_order }).eq("id", current.id);
  await supabase.from(table).update({ sort_order: current.sort_order }).eq("id", neighbor.id);
}
