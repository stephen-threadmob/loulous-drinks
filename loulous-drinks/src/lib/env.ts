// Centralized, typed access to environment variables with clear errors when a
// required value is missing. Server-only secrets are read lazily so they never
// get bundled into client code.

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  defaultRestaurantSlug:
    process.env.NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG ?? "lou-lous-fosters",
};

export function assertPublicEnv() {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Copy .env.example to .env.local and fill in your Supabase keys."
    );
  }
}

// Server-only. Never import this into a client component.
export function serverEnv() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
    twilioFromNumber: process.env.TWILIO_FROM_NUMBER ?? "",
    extractionProvider: (process.env.MENU_EXTRACTION_PROVIDER ?? "").toLowerCase(),
    extractionApiKey: process.env.MENU_EXTRACTION_API_KEY ?? "",
    orderSigningSecret: process.env.ORDER_SIGNING_SECRET ?? "dev-insecure-secret",
  };
}
