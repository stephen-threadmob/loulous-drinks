"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

// Browser Supabase client (anon key). All access is gated by RLS. Used for the
// admin dashboard's realtime subscription and authenticated admin reads/writes.
export function createClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
