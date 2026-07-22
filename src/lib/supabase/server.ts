import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

// Server Supabase client (anon key + user session from cookies). Respects RLS,
// so this is used for authenticated admin server components / actions and for
// reading published menu data on the customer page.
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component. This can be
          // ignored if you have middleware refreshing user sessions.
        }
      },
    },
  });
}
