import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getRestaurantBySlug,
  getPublicSettings,
  getFullMenu,
} from "@/lib/menu";
import { isOrderingOpen } from "@/lib/hours";
import { ThemeStyle } from "@/components/ThemeStyle";
import { CustomerMenu } from "@/components/customer/CustomerMenu";
import type { Metadata } from "next";

export const dynamic = "force-dynamic"; // menu/availability should be fresh

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const supabase = createClient();
  const restaurant = await getRestaurantBySlug(supabase, params.slug);
  return {
    title: restaurant ? `Order Drinks — ${restaurant.name}` : "Order Drinks",
  };
}

export default async function CustomerMenuPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createClient();
  const restaurant = await getRestaurantBySlug(supabase, params.slug);
  if (!restaurant) notFound();

  const [settings, menu] = await Promise.all([
    getPublicSettings(supabase, restaurant.id),
    getFullMenu(supabase, restaurant.id, { includeHidden: false }),
  ]);
  if (!settings) notFound();

  // Only show categories that actually have visible items.
  const visibleMenu = menu.filter((c) => c.items.length > 0);
  const ordering = isOrderingOpen(settings);

  return (
    <>
      <ThemeStyle
        primary={settings.primary_color}
        secondary={settings.secondary_color}
        bg={settings.bg_color}
        ink={settings.ink_color}
      />
      <CustomerMenu
        slug={restaurant.slug}
        restaurantName={settings.display_name}
        settings={settings}
        menu={visibleMenu}
        orderingOpen={ordering.open}
        orderingClosedReason={ordering.reason}
      />
    </>
  );
}
