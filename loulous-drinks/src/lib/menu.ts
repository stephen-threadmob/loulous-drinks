import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Category,
  CategoryWithItems,
  MenuItem,
  ModifierGroup,
  ModifierOption,
  PublicSettings,
  Restaurant,
} from "@/lib/types";

// Loads a restaurant by slug. Returns null when not found.
export async function getRestaurantBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<Restaurant | null> {
  const { data } = await supabase
    .from("restaurants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  return (data as Restaurant) ?? null;
}

export async function getPublicSettings(
  supabase: SupabaseClient,
  restaurantId: string
): Promise<PublicSettings | null> {
  const { data } = await supabase
    .from("public_settings")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  return (data as PublicSettings) ?? null;
}

interface LoadMenuOptions {
  // When true (admin), include hidden categories/items. When false (customer),
  // only visible categories and non-hidden items are returned.
  includeHidden?: boolean;
}

// Loads the full menu (categories -> items -> modifier groups -> options) for a
// restaurant in a small number of queries, then stitches it together in memory.
export async function getFullMenu(
  supabase: SupabaseClient,
  restaurantId: string,
  { includeHidden = false }: LoadMenuOptions = {}
): Promise<CategoryWithItems[]> {
  let catQuery = supabase
    .from("categories")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("sort_order", { ascending: true });
  if (!includeHidden) catQuery = catQuery.eq("is_hidden", false);

  const { data: categories } = await catQuery;
  if (!categories || categories.length === 0) return [];

  let itemQuery = supabase
    .from("menu_items")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("sort_order", { ascending: true });
  if (!includeHidden) itemQuery = itemQuery.neq("availability", "hidden");

  const { data: items } = await itemQuery;
  const itemList = (items ?? []) as MenuItem[];

  const itemIds = itemList.map((i) => i.id);
  let groups: ModifierGroup[] = [];
  let options: ModifierOption[] = [];

  if (itemIds.length > 0) {
    const { data: g } = await supabase
      .from("item_modifier_groups")
      .select("*")
      .in("item_id", itemIds)
      .order("sort_order", { ascending: true });
    groups = (g ?? []) as ModifierGroup[];

    const groupIds = groups.map((x) => x.id);
    if (groupIds.length > 0) {
      const { data: o } = await supabase
        .from("modifier_options")
        .select("*")
        .in("group_id", groupIds)
        .order("sort_order", { ascending: true });
      options = (o ?? []) as ModifierOption[];
    }
  }

  // Stitch options -> groups
  const optionsByGroup = new Map<string, ModifierOption[]>();
  for (const opt of options) {
    const arr = optionsByGroup.get(opt.group_id) ?? [];
    arr.push(opt);
    optionsByGroup.set(opt.group_id, arr);
  }
  for (const grp of groups) {
    grp.options = optionsByGroup.get(grp.id) ?? [];
  }

  // Stitch groups -> items
  const groupsByItem = new Map<string, ModifierGroup[]>();
  for (const grp of groups) {
    const arr = groupsByItem.get(grp.item_id) ?? [];
    arr.push(grp);
    groupsByItem.set(grp.item_id, arr);
  }
  for (const it of itemList) {
    it.modifier_groups = groupsByItem.get(it.id) ?? [];
  }

  // Stitch items -> categories
  const itemsByCat = new Map<string, MenuItem[]>();
  for (const it of itemList) {
    if (!it.category_id) continue;
    const arr = itemsByCat.get(it.category_id) ?? [];
    arr.push(it);
    itemsByCat.set(it.category_id, arr);
  }

  return (categories as Category[]).map((c) => ({
    ...c,
    items: itemsByCat.get(c.id) ?? [],
  }));
}
