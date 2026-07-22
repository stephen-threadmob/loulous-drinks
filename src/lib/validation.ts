import { z } from "zod";

// ---- File upload constraints ----------------------------------------------
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "text/csv": "csv",
  "application/vnd.ms-excel": "csv", // some browsers send this for .csv
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB for drink/logo images
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// ---- Order submission payload ---------------------------------------------
export const orderPayloadSchema = z.object({
  restaurant_slug: z.string().min(1).max(120),
  table_number: z.number().int().positive().max(100000),
  customer_notes: z.string().max(500).optional().default(""),
  idempotency_key: z.string().min(8).max(200),
  items: z
    .array(
      z.object({
        item_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(50),
        special_instructions: z.string().max(300).optional().default(""),
        modifiers: z
          .array(
            z.object({
              group_id: z.string().uuid(),
              option_id: z.string().uuid(),
            })
          )
          .max(50)
          .optional()
          .default([]),
      })
    )
    .min(1, "Your order is empty.")
    .max(100),
});

export type OrderPayloadInput = z.infer<typeof orderPayloadSchema>;

// ---- Order status update ---------------------------------------------------
export const orderStatusSchema = z.object({
  status: z.enum([
    "new",
    "acknowledged",
    "preparing",
    "delivered",
    "canceled",
  ]),
});

// ---- Basic string sanitizing (defense in depth; DB stores as text) ---------
export function sanitizeText(
  input: string | null | undefined,
  max = 500
): string {
  if (!input) return "";
  // Strip ASCII control characters (0x00-0x1F and 0x7F), then trim + cap length.
  let out = "";
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) continue;
    out += ch;
  }
  return out.trim().slice(0, max);
}
