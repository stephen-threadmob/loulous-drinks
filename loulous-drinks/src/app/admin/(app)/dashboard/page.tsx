import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OrdersDashboard } from "@/components/admin/OrdersDashboard";

const ORDER_SELECT = `
  id, order_number, daily_seq, table_number, status, subtotal_cents, currency,
  customer_notes, is_read, sms_status, created_at, updated_at,
  order_items (
    id, name_snapshot, base_price_cents, unit_price_cents, quantity,
    line_total_cents, special_instructions, sort_order,
    order_item_modifiers ( id, group_name_snapshot, option_name_snapshot, price_delta_cents )
  )
`;

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { restaurantId } = await requireAdmin();
  const supabase = createClient();

  const [{ data: orders }, { data: settings }] = await Promise.all([
    supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("restaurant_settings")
      .select("sound_alerts, timezone")
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
  ]);

  return (
    <OrdersDashboard
      restaurantId={restaurantId}
      initialOrders={(orders as any[]) ?? []}
      soundDefault={settings?.sound_alerts ?? true}
      timezone={settings?.timezone ?? "America/New_York"}
    />
  );
}
