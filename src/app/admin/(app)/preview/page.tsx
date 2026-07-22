import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPublicSettings, getFullMenu } from "@/lib/menu";
import { ThemeStyle } from "@/components/ThemeStyle";
import { CustomerMenu } from "@/components/customer/CustomerMenu";

export const dynamic = "force-dynamic";

// Admin preview of the live customer menu. Ordering is disabled (preview mode).
export default async function PreviewPage() {
  const { restaurant, restaurantId } = await requireAdmin();
  const supabase = createClient();
  const [settings, menu] = await Promise.all([
    getPublicSettings(supabase, restaurantId),
    getFullMenu(supabase, restaurantId, { includeHidden: false }),
  ]);
  if (!settings) return <p>Settings not found.</p>;
  const visibleMenu = menu.filter((c) => c.items.length > 0);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between rounded-xl bg-brand-primary px-4 py-3 text-white">
        <p className="text-sm font-medium">
          Preview mode — this is what guests see. Ordering is disabled.
        </p>
        <Link href="/admin/menu" className="text-sm underline">
          Back to menu
        </Link>
      </div>
      <div className="overflow-hidden rounded-3xl border border-black/10 shadow-lift">
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
          orderingOpen={true}
          preview
        />
      </div>
    </div>
  );
}
