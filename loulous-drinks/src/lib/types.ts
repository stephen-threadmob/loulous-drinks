// Shared domain types. These mirror the Postgres schema (supabase/schema.sql).

export type OrderStatus =
  | "new"
  | "acknowledged"
  | "preparing"
  | "delivered"
  | "canceled";

export type ItemAvailability = "available" | "sold_out" | "hidden";

export type UploadStatus =
  | "uploaded"
  | "processing"
  | "extracted"
  | "failed"
  | "published";

export type SmsStatus = "pending" | "sent" | "failed" | "skipped";

export type ModifierSelection = "single" | "multi";

export interface Restaurant {
  id: string;
  slug: string;
  name: string;
}

export interface PublicSettings {
  restaurant_id: string;
  display_name: string;
  tagline: string | null;
  address: string | null;
  instagram: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  bg_color: string;
  ink_color: string;
  currency: string;
  timezone: string;
  table_min: number;
  table_max: number;
  ordering_enabled: boolean;
  ordering_start: string | null;
  ordering_end: string | null;
  order_disclaimer: string;
}

export interface RestaurantSettings extends PublicSettings {
  sound_alerts: boolean;
  owner_phone: string | null;
  extra_recipients: string[];
}

export interface Category {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_hidden: boolean;
}

export interface ModifierOption {
  id: string;
  group_id: string;
  restaurant_id: string;
  name: string;
  price_delta_cents: number;
  is_default: boolean;
  sort_order: number;
}

export interface ModifierGroup {
  id: string;
  item_id: string;
  restaurant_id: string;
  name: string;
  selection_type: ModifierSelection;
  required: boolean;
  min_select: number;
  max_select: number | null;
  sort_order: number;
  options: ModifierOption[];
}

export interface MenuItem {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  image_alt: string | null;
  availability: ItemAvailability;
  sort_order: number;
  modifier_groups?: ModifierGroup[];
}

export interface CategoryWithItems extends Category {
  items: MenuItem[];
}

// ---- Cart (client-side only) ----------------------------------------------

export interface CartModifier {
  group_id: string;
  group_name: string;
  option_id: string;
  option_name: string;
  price_delta_cents: number;
}

export interface CartLine {
  // A unique key per configured line (same drink w/ different mods = 2 lines).
  key: string;
  item_id: string;
  name: string;
  base_price_cents: number;
  quantity: number;
  modifiers: CartModifier[];
  special_instructions: string;
}

// ---- Order submission payload (client -> /api/orders) ----------------------

export interface OrderPayloadModifier {
  group_id: string;
  option_id: string;
}

export interface OrderPayloadItem {
  item_id: string;
  quantity: number;
  modifiers: OrderPayloadModifier[];
  special_instructions?: string;
}

export interface OrderPayload {
  restaurant_slug: string;
  table_number: number;
  customer_notes?: string;
  idempotency_key: string;
  items: OrderPayloadItem[];
}

// ---- Orders (admin dashboard) ----------------------------------------------

export interface OrderItemModifier {
  id: string;
  group_name_snapshot: string;
  option_name_snapshot: string;
  price_delta_cents: number;
}

export interface OrderItem {
  id: string;
  name_snapshot: string;
  base_price_cents: number;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
  special_instructions: string | null;
  sort_order: number;
  modifiers: OrderItemModifier[];
}

export interface Order {
  id: string;
  restaurant_id: string;
  order_number: string;
  daily_seq: number;
  table_number: number;
  status: OrderStatus;
  subtotal_cents: number;
  currency: string;
  customer_notes: string | null;
  is_read: boolean;
  sms_status: SmsStatus;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

// ---- Extraction draft (menu upload review) ---------------------------------

export interface ExtractedOption {
  name: string;
  price_delta_cents?: number;
}

export interface ExtractedModifierGroup {
  name: string;
  selection_type: ModifierSelection;
  required: boolean;
  options: ExtractedOption[];
}

export interface ExtractedItem {
  name: string;
  description?: string;
  price_cents: number | null;
  bottle_price_cents?: number | null;
  uncertain?: boolean;
  modifier_groups?: ExtractedModifierGroup[];
}

export interface ExtractedCategory {
  name: string;
  items: ExtractedItem[];
}

export interface ExtractionResult {
  provider: string;
  categories: ExtractedCategory[];
  notes: string[];
}
