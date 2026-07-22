-- =============================================================================
-- Lou Lou's + Foster's — Drink Ordering App
-- 01_schema.sql  —  Tables, enums, functions, triggers
--
-- Run order in the Supabase SQL editor:
--   1. supabase/schema.sql      (this file)
--   2. supabase/policies.sql    (row-level security + storage policies)
--   3. supabase/seed.sql        (sample restaurant + real menu)
--
-- Multi-tenant by design: every row is scoped to a restaurant_id so the system
-- can support multiple restaurants later without a rebuild.
-- =============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type order_status as enum
    ('new', 'acknowledged', 'preparing', 'delivered', 'canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type item_availability as enum ('available', 'sold_out', 'hidden');
exception when duplicate_object then null; end $$;

do $$ begin
  create type upload_status as enum
    ('uploaded', 'processing', 'extracted', 'failed', 'published');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sms_status as enum ('pending', 'sent', 'failed', 'skipped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type modifier_selection as enum ('single', 'multi');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- updated_at helper
-- -----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =============================================================================
-- Core tenant tables
-- =============================================================================
create table if not exists restaurants (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_restaurants_updated before update on restaurants
  for each row execute function set_updated_at();

-- Public-safe theme + operational settings (NO secrets here except owner_phone,
-- which is deliberately excluded from the public_settings view below).
create table if not exists restaurant_settings (
  restaurant_id     uuid primary key references restaurants(id) on delete cascade,
  display_name      text not null,
  tagline           text,
  address           text,
  instagram         text,
  logo_url          text,
  primary_color     text not null default '#1c1c1c',
  secondary_color   text not null default '#b08d57',
  bg_color          text not null default '#f5f1e8',
  ink_color         text not null default '#1c1c1c',
  currency          text not null default 'USD',
  timezone          text not null default 'America/New_York',
  table_min         int  not null default 1,
  table_max         int  not null default 60,
  ordering_enabled  boolean not null default true,
  ordering_start    time,                 -- null = no start restriction
  ordering_end      time,                 -- null = no end restriction
  sound_alerts      boolean not null default true,
  order_disclaimer  text not null default
    'Submitting your order does not guarantee every item or modification is available. Our staff may need to confirm your request.',
  -- The cell phone that receives SMS order notifications. E.164, e.g. +17065551234.
  -- NEVER exposed to customers (excluded from public_settings view; RLS admin-only).
  owner_phone       text,
  extra_recipients  text[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger trg_settings_updated before update on restaurant_settings
  for each row execute function set_updated_at();

-- Links a Supabase auth user to a restaurant they administer.
create table if not exists admin_users (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  role           text not null default 'admin',
  created_at     timestamptz not null default now(),
  unique (user_id, restaurant_id)
);
create index if not exists idx_admin_users_user on admin_users(user_id);

-- =============================================================================
-- Menu structure
-- =============================================================================
create table if not exists categories (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  name           text not null,
  description    text,
  sort_order     int not null default 0,
  is_hidden      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_categories_restaurant on categories(restaurant_id, sort_order);
create trigger trg_categories_updated before update on categories
  for each row execute function set_updated_at();

create table if not exists menu_items (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  category_id    uuid references categories(id) on delete set null,
  name           text not null,
  description    text,
  price_cents    int not null default 0,          -- base price (by-the-glass for wine)
  image_url      text,
  image_alt      text,
  availability   item_availability not null default 'available',
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_items_restaurant on menu_items(restaurant_id);
create index if not exists idx_items_category on menu_items(category_id, sort_order);
create trigger trg_items_updated before update on menu_items
  for each row execute function set_updated_at();

create table if not exists item_modifier_groups (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  item_id        uuid not null references menu_items(id) on delete cascade,
  name           text not null,                   -- "Ice", "Size", "Bourbon"
  selection_type modifier_selection not null default 'multi',
  required       boolean not null default false,
  min_select     int not null default 0,
  max_select     int,                             -- null = unlimited
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_modgroups_item on item_modifier_groups(item_id, sort_order);
create trigger trg_modgroups_updated before update on item_modifier_groups
  for each row execute function set_updated_at();

create table if not exists modifier_options (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references restaurants(id) on delete cascade,
  group_id          uuid not null references item_modifier_groups(id) on delete cascade,
  name              text not null,                -- "No salt", "Bottle", "Maker's Mark"
  price_delta_cents int not null default 0,
  is_default        boolean not null default false,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_modopts_group on modifier_options(group_id, sort_order);
create trigger trg_modopts_updated before update on modifier_options
  for each row execute function set_updated_at();

-- =============================================================================
-- Menu uploads + extraction drafts
-- =============================================================================
create table if not exists menu_uploads (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references restaurants(id) on delete cascade,
  file_path           text not null,              -- storage path in "menu-uploads" bucket
  file_name           text not null,
  file_type           text not null,
  file_size           bigint not null default 0,
  status              upload_status not null default 'uploaded',
  extraction_provider text,
  extracted           jsonb,                       -- draft menu (categories/items/mods)
  extraction_notes    text,                        -- flags for uncertain/incomplete data
  error               text,
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_uploads_restaurant on menu_uploads(restaurant_id, created_at desc);
create trigger trg_uploads_updated before update on menu_uploads
  for each row execute function set_updated_at();

-- =============================================================================
-- Orders
-- =============================================================================
create table if not exists orders (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  order_number    text not null,
  daily_seq       int not null,
  table_number    int not null,
  status          order_status not null default 'new',
  subtotal_cents  int not null default 0,
  currency        text not null default 'USD',
  customer_notes  text,
  is_read         boolean not null default false,
  sms_status      sms_status not null default 'pending',
  -- Idempotency: a client-supplied token that de-duplicates double submissions.
  idempotency_key text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (restaurant_id, order_number),
  unique (restaurant_id, idempotency_key)
);
create index if not exists idx_orders_restaurant on orders(restaurant_id, created_at desc);
create index if not exists idx_orders_status on orders(restaurant_id, status);
create trigger trg_orders_updated before update on orders
  for each row execute function set_updated_at();

create table if not exists order_items (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references orders(id) on delete cascade,
  restaurant_id        uuid not null references restaurants(id) on delete cascade,
  item_id              uuid references menu_items(id) on delete set null,
  name_snapshot        text not null,
  base_price_cents     int not null default 0,
  unit_price_cents     int not null default 0,     -- base + option deltas, per unit
  quantity             int not null default 1,
  line_total_cents     int not null default 0,     -- unit_price_cents * quantity
  special_instructions text,
  sort_order           int not null default 0,
  created_at           timestamptz not null default now()
);
create index if not exists idx_orderitems_order on order_items(order_id, sort_order);

create table if not exists order_item_modifiers (
  id                  uuid primary key default gen_random_uuid(),
  order_item_id       uuid not null references order_items(id) on delete cascade,
  restaurant_id       uuid not null references restaurants(id) on delete cascade,
  group_name_snapshot text not null,
  option_name_snapshot text not null,
  price_delta_cents   int not null default 0,
  created_at          timestamptz not null default now()
);
create index if not exists idx_orderitemmods_item on order_item_modifiers(order_item_id);

create table if not exists sms_logs (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_id      uuid references orders(id) on delete set null,
  to_number     text,
  status        sms_status not null default 'pending',
  provider      text not null default 'twilio',
  provider_sid  text,
  segments      int not null default 1,
  body          text,
  error         text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_smslogs_order on sms_logs(order_id);

-- =============================================================================
-- Per-restaurant, per-day order number counter
-- =============================================================================
create table if not exists order_counters (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  day           date not null,
  seq           int not null default 0,
  primary key (restaurant_id, day)
);

-- Atomically allocate the next human-friendly order number for a restaurant.
-- Returns e.g. seq=14, order_number='0722-014'. Day is computed in the
-- restaurant's timezone so the daily counter resets at local midnight.
create or replace function next_order_number(p_restaurant uuid, p_tz text default 'America/New_York')
returns table(seq int, order_number text)
language plpgsql
as $$
declare
  v_day date;
  v_seq int;
begin
  v_day := (now() at time zone p_tz)::date;
  insert into order_counters(restaurant_id, day, seq)
    values (p_restaurant, v_day, 1)
  on conflict (restaurant_id, day)
    do update set seq = order_counters.seq + 1
  returning order_counters.seq into v_seq;

  seq := v_seq;
  order_number := to_char(v_day, 'MMDD') || '-' || lpad(v_seq::text, 3, '0');
  return next;
end $$;

-- Helper used by RLS policies: is the current auth user an admin of this restaurant?
create or replace function is_admin_of(p_restaurant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from admin_users
    where user_id = auth.uid() and restaurant_id = p_restaurant
  );
$$;

-- =============================================================================
-- Public settings view — everything EXCEPT owner_phone / extra_recipients.
-- Customers read theme + table range + hours from here; the phone is never
-- selectable by the anon role because the column does not exist in the view.
-- =============================================================================
create or replace view public_settings as
select
  restaurant_id, display_name, tagline, address, instagram, logo_url,
  primary_color, secondary_color, bg_color, ink_color, currency, timezone,
  table_min, table_max, ordering_enabled, ordering_start, ordering_end,
  order_disclaimer
from restaurant_settings;
