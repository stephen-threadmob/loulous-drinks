import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

// Service-role Supabase client. BYPASSES Row-Level Security. SERVER ONLY.
// Used exclusively by trusted API routes (order submission, menu publishing)
// where we must write on behalf of an unauthenticated customer or across the
// full tenant. The "server-only" import above makes the build fail loudly if
// this file is ever pulled into client code.
export function createAdminClient() {
  const { supabaseUrl, supabaseServiceRoleKey } = serverEnv();
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL). " +
        "Set these in .env.local / Vercel before using server order routes."
    );
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
