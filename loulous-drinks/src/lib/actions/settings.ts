"use server";

import { revalidatePath } from "next/cache";
import { getAdminApiContext } from "@/lib/api-auth";
import {
  sanitizeText,
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
} from "@/lib/validation";

// Normalize a phone number to E.164-ish. We don't hard-validate carrier format
// (Twilio does that on send); we just strip formatting and keep a leading +.
function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length < 7) return null;
  // Default US country code if 10 digits and no +.
  if (!hasPlus && digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export async function updateSettings(formData: FormData) {
  const ctx = await getAdminApiContext();
  if (!ctx) throw new Error("Not authorized");
  const { supabase, restaurantId } = ctx;

  const tableMin = Math.max(
    1,
    Number.parseInt(String(formData.get("table_min") ?? "1"), 10) || 1
  );
  const tableMaxRaw =
    Number.parseInt(String(formData.get("table_max") ?? "40"), 10) || 40;
  const tableMax = Math.max(tableMin, tableMaxRaw);

  const startRaw = String(formData.get("ordering_start") ?? "").trim();
  const endRaw = String(formData.get("ordering_end") ?? "").trim();

  const patch: Record<string, unknown> = {
    display_name: sanitizeText(String(formData.get("display_name") ?? ""), 120),
    tagline: sanitizeText(String(formData.get("tagline") ?? ""), 160) || null,
    address: sanitizeText(String(formData.get("address") ?? ""), 200) || null,
    instagram: sanitizeText(String(formData.get("instagram") ?? ""), 80) || null,
    primary_color: sanitizeText(String(formData.get("primary_color") ?? ""), 9),
    secondary_color: sanitizeText(String(formData.get("secondary_color") ?? ""), 9),
    bg_color: sanitizeText(String(formData.get("bg_color") ?? ""), 9),
    ink_color: sanitizeText(String(formData.get("ink_color") ?? ""), 9),
    currency: sanitizeText(String(formData.get("currency") ?? "USD"), 8) || "USD",
    timezone:
      sanitizeText(String(formData.get("timezone") ?? ""), 60) || "America/New_York",
    table_min: tableMin,
    table_max: tableMax,
    ordering_enabled: String(formData.get("ordering_enabled") ?? "") === "on",
    sound_alerts: String(formData.get("sound_alerts") ?? "") === "on",
    ordering_start: startRaw || null,
    ordering_end: endRaw || null,
    owner_phone: normalizePhone(String(formData.get("owner_phone") ?? "")),
    order_disclaimer:
      sanitizeText(String(formData.get("order_disclaimer") ?? ""), 400) || null,
  };

  await supabase
    .from("restaurant_settings")
    .update(patch)
    .eq("restaurant_id", restaurantId);

  revalidatePath("/admin/settings");
  revalidatePath("/admin/dashboard");
  // The customer page reads theme + hours; revalidate it too.
  revalidatePath("/", "layout");
}

// Persist just the sound-alert preference (used by the dashboard toggle).
export async function setSoundAlerts(enabled: boolean) {
  const ctx = await getAdminApiContext();
  if (!ctx) return;
  await ctx.supabase
    .from("restaurant_settings")
    .update({ sound_alerts: enabled })
    .eq("restaurant_id", ctx.restaurantId);
}

export async function uploadLogo(formData: FormData) {
  const ctx = await getAdminApiContext();
  if (!ctx) throw new Error("Not authorized");
  const { supabase, restaurantId } = ctx;
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return;
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Logo must be JPG, PNG, or WEBP.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Logo must be under 5 MB.");
  }
  const ext = file.type.split("/")[1] || "png";
  const path = `${restaurantId}/logo-${Date.now()}.${ext}`;
  const buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));
  const { error } = await supabase.storage
    .from("restaurant-logos")
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (error) throw new Error("Logo upload failed.");
  const { data: pub } = supabase.storage
    .from("restaurant-logos")
    .getPublicUrl(path);
  await supabase
    .from("restaurant_settings")
    .update({ logo_url: pub.publicUrl })
    .eq("restaurant_id", restaurantId);
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
}
