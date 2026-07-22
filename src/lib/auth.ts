import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// Returns the signed-in admin's user + the restaurant they administer.
// Redirects to /admin/login if not authenticated, or shows an error state if
// the user isn't linked to any restaurant.
export async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data: membership } = await supabase
    .from("admin_users")
    .select("restaurant_id, role, restaurants(id, slug, name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    // Authenticated but not linked to a restaurant.
    redirect("/admin/no-access");
  }

  const restaurant = Array.isArray(membership.restaurants)
    ? membership.restaurants[0]
    : membership.restaurants;

  return {
    user,
    restaurantId: membership.restaurant_id as string,
    role: membership.role as string,
    restaurant: restaurant as { id: string; slug: string; name: string },
  };
}
