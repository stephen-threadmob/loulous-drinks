import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AdminApiContext {
  supabase: SupabaseClient;
  userId: string;
  restaurantId: string;
}

// Authenticates the caller of an admin API route via the session cookie and
// resolves their restaurant. Returns null when unauthenticated / unlinked, so
// callers can respond 401. The returned Supabase client is RLS-scoped to the
// admin, so all writes are automatically restricted to their restaurant.
export async function getAdminApiContext(): Promise<AdminApiContext | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("admin_users")
    .select("restaurant_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  return {
    supabase,
    userId: user.id,
    restaurantId: membership.restaurant_id as string,
  };
}
