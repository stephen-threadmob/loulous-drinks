-- =============================================================
-- ONE-PASTE SETUP for Lou Lou's + Foster's drink app.
-- Paste this whole file into the Supabase SQL editor and Run.
-- It combines schema.sql + policies.sql + seed.sql in order.
-- =============================================================

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


-- =============================================================================
-- Lou Lou's + Foster's — Drink Ordering App
-- 02_policies.sql  —  Row-Level Security, grants, and Storage policies
--
-- Run AFTER schema.sql.
--
-- Security model:
--   * anon (customers)      : read published menu; read public_settings view.
--                             CANNOT read orders or owner phone. CANNOT write.
--   * authenticated (admins): full access to THEIR OWN restaurant's rows only.
--   * service_role (server) : bypasses RLS; used by API routes for order writes.
-- =============================================================================

-- Make sure the API roles can reach the tables (RLS still gates every row).
grant usage on schema public to anon, authenticated;
grant select on public_settings to anon, authenticated;
grant select on restaurants, categories, menu_items, item_modifier_groups,
  modifier_options to anon, authenticated;
grant all on restaurant_settings, categories, menu_items, item_modifier_groups,
  modifier_options, menu_uploads, orders, order_items, order_item_modifiers,
  sms_logs, admin_users, order_counters, restaurants to authenticated;

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere
-- -----------------------------------------------------------------------------
alter table restaurants           enable row level security;
alter table restaurant_settings   enable row level security;
alter table admin_users           enable row level security;
alter table categories            enable row level security;
alter table menu_items            enable row level security;
alter table item_modifier_groups  enable row level security;
alter table modifier_options      enable row level security;
alter table menu_uploads          enable row level security;
alter table orders                enable row level security;
alter table order_items           enable row level security;
alter table order_item_modifiers  enable row level security;
alter table sms_logs              enable row level security;
alter table order_counters        enable row level security;

-- -----------------------------------------------------------------------------
-- restaurants
-- -----------------------------------------------------------------------------
drop policy if exists restaurants_public_read on restaurants;
create policy restaurants_public_read on restaurants
  for select using (true);                       -- name/slug are public

drop policy if exists restaurants_admin_all on restaurants;
create policy restaurants_admin_all on restaurants
  for all using (is_admin_of(id)) with check (is_admin_of(id));

-- -----------------------------------------------------------------------------
-- restaurant_settings — admin only (owner_phone lives here).
-- Customers use the public_settings view instead.
-- -----------------------------------------------------------------------------
drop policy if exists settings_admin_all on restaurant_settings;
create policy settings_admin_all on restaurant_settings
  for all using (is_admin_of(restaurant_id)) with check (is_admin_of(restaurant_id));

-- -----------------------------------------------------------------------------
-- admin_users — a user can see their own membership rows.
-- -----------------------------------------------------------------------------
drop policy if exists admin_users_self_read on admin_users;
create policy admin_users_self_read on admin_users
  for select using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- categories — public reads visible categories; admins manage their own.
-- -----------------------------------------------------------------------------
drop policy if exists categories_public_read on categories;
create policy categories_public_read on categories
  for select using (is_hidden = false);

drop policy if exists categories_admin_all on categories;
create policy categories_admin_all on categories
  for all using (is_admin_of(restaurant_id)) with check (is_admin_of(restaurant_id));

-- -----------------------------------------------------------------------------
-- menu_items — public reads non-hidden items; admins manage their own.
-- -----------------------------------------------------------------------------
drop policy if exists items_public_read on menu_items;
create policy items_public_read on menu_items
  for select using (availability <> 'hidden');

drop policy if exists items_admin_all on menu_items;
create policy items_admin_all on menu_items
  for all using (is_admin_of(restaurant_id)) with check (is_admin_of(restaurant_id));

-- -----------------------------------------------------------------------------
-- item_modifier_groups / modifier_options — public read; admin manage.
-- (Kept simple: modifiers of a hidden item are harmless to read; the item
--  itself won't render.)
-- -----------------------------------------------------------------------------
drop policy if exists modgroups_public_read on item_modifier_groups;
create policy modgroups_public_read on item_modifier_groups
  for select using (true);

drop policy if exists modgroups_admin_all on item_modifier_groups;
create policy modgroups_admin_all on item_modifier_groups
  for all using (is_admin_of(restaurant_id)) with check (is_admin_of(restaurant_id));

drop policy if exists modopts_public_read on modifier_options;
create policy modopts_public_read on modifier_options
  for select using (true);

drop policy if exists modopts_admin_all on modifier_options;
create policy modopts_admin_all on modifier_options
  for all using (is_admin_of(restaurant_id)) with check (is_admin_of(restaurant_id));

-- -----------------------------------------------------------------------------
-- menu_uploads — admin only.
-- -----------------------------------------------------------------------------
drop policy if exists uploads_admin_all on menu_uploads;
create policy uploads_admin_all on menu_uploads
  for all using (is_admin_of(restaurant_id)) with check (is_admin_of(restaurant_id));

-- -----------------------------------------------------------------------------
-- orders / order_items / order_item_modifiers / sms_logs — ADMIN READ ONLY.
-- Customers never read or write these directly; the server (service_role)
-- inserts orders and bypasses RLS. This prevents guests from seeing other
-- tables' orders.
-- -----------------------------------------------------------------------------
drop policy if exists orders_admin_all on orders;
create policy orders_admin_all on orders
  for all using (is_admin_of(restaurant_id)) with check (is_admin_of(restaurant_id));

drop policy if exists orderitems_admin_all on order_items;
create policy orderitems_admin_all on order_items
  for all using (is_admin_of(restaurant_id)) with check (is_admin_of(restaurant_id));

drop policy if exists orderitemmods_admin_all on order_item_modifiers;
create policy orderitemmods_admin_all on order_item_modifiers
  for all using (is_admin_of(restaurant_id)) with check (is_admin_of(restaurant_id));

drop policy if exists smslogs_admin_all on sms_logs;
create policy smslogs_admin_all on sms_logs
  for all using (is_admin_of(restaurant_id)) with check (is_admin_of(restaurant_id));

drop policy if exists counters_admin_read on order_counters;
create policy counters_admin_read on order_counters
  for select using (is_admin_of(restaurant_id));

-- =============================================================================
-- Storage buckets + policies
-- Create three buckets in the Supabase dashboard (Storage) OR run the inserts
-- below. "menu-uploads" is PRIVATE; the image buckets are PUBLIC-read.
-- =============================================================================
insert into storage.buckets (id, name, public)
values
  ('menu-uploads',    'menu-uploads',    false),
  ('drink-images',    'drink-images',    true),
  ('restaurant-logos','restaurant-logos',true)
on conflict (id) do nothing;

-- Public read for image buckets
drop policy if exists "public read drink images" on storage.objects;
create policy "public read drink images" on storage.objects
  for select using (bucket_id in ('drink-images', 'restaurant-logos'));

-- Authenticated (admin) can manage image + upload buckets. The service role
-- bypasses these anyway; this covers admin uploads made from the browser.
drop policy if exists "admin manage images" on storage.objects;
create policy "admin manage images" on storage.objects
  for all to authenticated
  using (bucket_id in ('drink-images', 'restaurant-logos', 'menu-uploads'))
  with check (bucket_id in ('drink-images', 'restaurant-logos', 'menu-uploads'));


-- =============================================================================
-- Lou Lou's + Foster's — Drink Ordering App
-- 03_seed.sql  —  Sample restaurant + REAL drink menu
--
-- Run AFTER schema.sql and policies.sql.
--
-- This seeds one restaurant (slug "lou-lous-fosters") with settings themed to
-- the bar, and the full drink menu transcribed from the Lou Lou's + Foster's
-- "VINO" menu (1350 13th Street, Columbus GA 31901). Wines with a glass and a
-- bottle price are modeled with a required "Size" modifier group (Glass is the
-- base price; Bottle carries the price difference). Signature cocktails get
-- realistic modifier groups (ice, salt, whiskey choice, extras).
--
-- Idempotent-ish: safe to re-run for a fresh restaurant; it clears the demo
-- restaurant's menu first. It does NOT create the admin login — see README /
-- DEPLOYMENT for creating the auth user and linking it via admin_users.
-- =============================================================================

-- Helper: insert a wine priced by the glass + bottle.
create or replace function seed_wine(
  p_rest uuid, p_cat uuid, p_name text, p_desc text,
  p_glass int, p_bottle int, p_sort int
) returns void language plpgsql as $$
declare v_item uuid; v_grp uuid;
begin
  insert into menu_items(restaurant_id, category_id, name, description, price_cents, sort_order)
    values (p_rest, p_cat, p_name, p_desc, p_glass, p_sort)
    returning id into v_item;
  insert into item_modifier_groups(restaurant_id, item_id, name, selection_type, required, min_select, max_select, sort_order)
    values (p_rest, v_item, 'Size', 'single', true, 1, 1, 0)
    returning id into v_grp;
  insert into modifier_options(restaurant_id, group_id, name, price_delta_cents, is_default, sort_order)
    values
      (p_rest, v_grp, 'Glass',  0,                  true,  0),
      (p_rest, v_grp, 'Bottle', p_bottle - p_glass, false, 1);
end $$;

-- Helper: insert a simple single-price item (bottle-only wine, beer, N/A, etc.)
create or replace function seed_item(
  p_rest uuid, p_cat uuid, p_name text, p_desc text, p_price int, p_sort int
) returns uuid language plpgsql as $$
declare v_item uuid;
begin
  insert into menu_items(restaurant_id, category_id, name, description, price_cents, sort_order)
    values (p_rest, p_cat, p_name, p_desc, p_price, p_sort)
    returning id into v_item;
  return v_item;
end $$;

do $$
declare
  r_id uuid;
  c_cocktails uuid; c_white uuid; c_red uuid; c_rose uuid;
  c_bubbles uuid; c_beer uuid; c_na uuid;
  it uuid; g uuid;
begin
  -- ---- Restaurant --------------------------------------------------------
  insert into restaurants(slug, name)
    values ('lou-lous-fosters', 'Lou Lou''s + Foster''s')
    on conflict (slug) do update set name = excluded.name
    returning id into r_id;

  -- Clear any previous demo menu so re-runs stay clean.
  delete from menu_uploads where restaurant_id = r_id;
  delete from categories   where restaurant_id = r_id;   -- cascades to items/mods

  -- ---- Settings (theme + operations) -------------------------------------
  insert into restaurant_settings(
    restaurant_id, display_name, tagline, address, instagram, logo_url,
    primary_color, secondary_color, bg_color, ink_color, currency, timezone,
    table_min, table_max, ordering_enabled, sound_alerts, owner_phone
  ) values (
    r_id, 'Lou Lou''s + Foster''s', 'Bistro & Bar',
    '1350 13th Street, Columbus, GA 31901', '@loulousbistro_fostersbar', null,
    '#1c1c1c', '#b08d57', '#f4efe4', '#1c1c1c', 'USD', 'America/New_York',
    1, 40, true, true,
    -- Owner cell that receives SMS order alerts. Set this in admin Settings
    -- (or here) to your real number in E.164 format, e.g. '+17065551234'.
    null
  )
  on conflict (restaurant_id) do update set
    display_name = excluded.display_name,
    tagline = excluded.tagline,
    address = excluded.address,
    instagram = excluded.instagram,
    primary_color = excluded.primary_color,
    secondary_color = excluded.secondary_color,
    bg_color = excluded.bg_color,
    ink_color = excluded.ink_color,
    timezone = excluded.timezone,
    table_min = excluded.table_min,
    table_max = excluded.table_max;

  -- ---- Categories --------------------------------------------------------
  insert into categories(restaurant_id, name, description, sort_order) values
    (r_id, 'Cocktails', 'House cocktails — $12 each', 1) returning id into c_cocktails;
  insert into categories(restaurant_id, name, description, sort_order) values
    (r_id, 'White Wine', 'Vin Blanc — by the glass or bottle', 2) returning id into c_white;
  insert into categories(restaurant_id, name, description, sort_order) values
    (r_id, 'Red Wine', 'Vin Rouge — by the glass or bottle', 3) returning id into c_red;
  insert into categories(restaurant_id, name, description, sort_order) values
    (r_id, 'Rosé', 'By the glass or bottle', 4) returning id into c_rose;
  insert into categories(restaurant_id, name, description, sort_order) values
    (r_id, 'Bubbles', 'Sparkling & Champagne', 5) returning id into c_bubbles;
  insert into categories(restaurant_id, name, description, sort_order) values
    (r_id, 'Beer', null, 6) returning id into c_beer;
  insert into categories(restaurant_id, name, description, sort_order) values
    (r_id, 'Non-Alcoholic', null, 7) returning id into c_na;

  -- ======================================================================
  -- COCKTAILS ($12) — signature cocktails get modifier groups
  -- ======================================================================
  it := seed_item(r_id, c_cocktails, 'Smoked Bloody Mary',
        'New Amsterdam Vodka, housemade smoky bloody mix, fixins', 1200, 1);

  it := seed_item(r_id, c_cocktails, 'Lou Lou''s Lemonade',
        'New Amsterdam Vodka, club soda, lemon', 1200, 2);

  it := seed_item(r_id, c_cocktails, 'Frenchie''s 75',
        'LaMarca Prosecco, St. Germain, gin', 1200, 3);

  -- Foster's Old Fashion — whiskey choice + extras
  it := seed_item(r_id, c_cocktails, 'Foster''s Old Fashion',
        'Bulleit Rye or Bourbon, simple syrup, Angostura, zest of orange and lemon', 1200, 4);
  insert into item_modifier_groups(restaurant_id, item_id, name, selection_type, required, min_select, max_select, sort_order)
    values (r_id, it, 'Whiskey', 'single', true, 1, 1, 0) returning id into g;
  insert into modifier_options(restaurant_id, group_id, name, price_delta_cents, is_default, sort_order) values
    (r_id, g, 'Bulleit Rye', 0, true, 0),
    (r_id, g, 'Bulleit Bourbon', 0, false, 1);
  insert into item_modifier_groups(restaurant_id, item_id, name, selection_type, required, min_select, max_select, sort_order)
    values (r_id, it, 'Extras', 'multi', false, 0, null, 1) returning id into g;
  insert into modifier_options(restaurant_id, group_id, name, price_delta_cents, is_default, sort_order) values
    (r_id, g, 'Less sweet', 0, false, 0),
    (r_id, g, 'Extra orange zest', 0, false, 1),
    (r_id, g, 'Add a shot', 400, false, 2);

  it := seed_item(r_id, c_cocktails, 'Tony''s Negroni',
        'Gray Whale Gin, Campari, sweet vermouth, orange', 1200, 5);
  insert into item_modifier_groups(restaurant_id, item_id, name, selection_type, required, min_select, max_select, sort_order)
    values (r_id, it, 'Ice', 'single', false, 0, 1, 0) returning id into g;
  insert into modifier_options(restaurant_id, group_id, name, price_delta_cents, is_default, sort_order) values
    (r_id, g, 'Regular ice', 0, true, 0),
    (r_id, g, 'Light ice', 0, false, 1),
    (r_id, g, 'Neat (no ice)', 0, false, 2);

  it := seed_item(r_id, c_cocktails, 'Summer Spritz',
        'Select Aperitivo, LaMarca Prosecco, club soda, orange', 1200, 6);

  -- Fresh Squeezed Margarita — salt + ice + extras
  it := seed_item(r_id, c_cocktails, 'Fresh Squeezed Margarita',
        'Altos Blanco, fresh lime, triple sec, agave', 1200, 7);
  insert into item_modifier_groups(restaurant_id, item_id, name, selection_type, required, min_select, max_select, sort_order)
    values (r_id, it, 'Rim', 'single', false, 0, 1, 0) returning id into g;
  insert into modifier_options(restaurant_id, group_id, name, price_delta_cents, is_default, sort_order) values
    (r_id, g, 'Salt rim', 0, true, 0),
    (r_id, g, 'No salt', 0, false, 1),
    (r_id, g, 'Sugar rim', 0, false, 2);
  insert into item_modifier_groups(restaurant_id, item_id, name, selection_type, required, min_select, max_select, sort_order)
    values (r_id, it, 'Ice', 'single', false, 0, 1, 1) returning id into g;
  insert into modifier_options(restaurant_id, group_id, name, price_delta_cents, is_default, sort_order) values
    (r_id, g, 'Regular ice', 0, true, 0),
    (r_id, g, 'Light ice', 0, false, 1),
    (r_id, g, 'Extra ice', 0, false, 2),
    (r_id, g, 'Frozen', 0, false, 3);
  insert into item_modifier_groups(restaurant_id, item_id, name, selection_type, required, min_select, max_select, sort_order)
    values (r_id, it, 'Extras', 'multi', false, 0, null, 2) returning id into g;
  insert into modifier_options(restaurant_id, group_id, name, price_delta_cents, is_default, sort_order) values
    (r_id, g, 'Extra lime', 0, false, 0),
    (r_id, g, 'No lime', 0, false, 1),
    (r_id, g, 'Less sweet', 0, false, 2),
    (r_id, g, 'Add a shot', 400, false, 3);

  it := seed_item(r_id, c_cocktails, 'Colga Cosmo',
        'New Amsterdam Vodka, Cointreau, splash of cranberry juice', 1200, 8);

  -- Midtown Manhattan — whiskey choice + cherry
  it := seed_item(r_id, c_cocktails, 'Midtown Manhattan',
        'Bulleit Rye or Bourbon, sweet vermouth, Angostura, Brandied cherry', 1200, 9);
  insert into item_modifier_groups(restaurant_id, item_id, name, selection_type, required, min_select, max_select, sort_order)
    values (r_id, it, 'Whiskey', 'single', true, 1, 1, 0) returning id into g;
  insert into modifier_options(restaurant_id, group_id, name, price_delta_cents, is_default, sort_order) values
    (r_id, g, 'Bulleit Rye', 0, true, 0),
    (r_id, g, 'Bulleit Bourbon', 0, false, 1);
  insert into item_modifier_groups(restaurant_id, item_id, name, selection_type, required, min_select, max_select, sort_order)
    values (r_id, it, 'Extras', 'multi', false, 0, null, 1) returning id into g;
  insert into modifier_options(restaurant_id, group_id, name, price_delta_cents, is_default, sort_order) values
    (r_id, g, 'Extra cherry', 0, false, 0),
    (r_id, g, 'Less sweet', 0, false, 1),
    (r_id, g, 'Up (no ice)', 0, false, 2);

  it := seed_item(r_id, c_cocktails, 'The Lakebottom',
        'Meyer''s Dark Rum, Gosling''s ginger beer, lime', 1200, 10);
  insert into item_modifier_groups(restaurant_id, item_id, name, selection_type, required, min_select, max_select, sort_order)
    values (r_id, it, 'Ice', 'single', false, 0, 1, 0) returning id into g;
  insert into modifier_options(restaurant_id, group_id, name, price_delta_cents, is_default, sort_order) values
    (r_id, g, 'Regular ice', 0, true, 0),
    (r_id, g, 'Light ice', 0, false, 1),
    (r_id, g, 'Extra ice', 0, false, 2);

  -- ======================================================================
  -- WHITE WINE (Vin Blanc)
  -- ======================================================================
  perform seed_wine(r_id, c_white, 'La Vieille Ferme', 'White Blend', 800, 2800, 1);
  perform seed_wine(r_id, c_white, 'J. Vineyards Pinot Gris', 'Russian River Valley, CA', 1100, 3900, 2);
  perform seed_wine(r_id, c_white, 'Whitehaven Sauvignon Blanc', 'Marlborough, NZ', 1400, 4900, 3);
  perform seed_wine(r_id, c_white, 'Frei Brothers Stoller Chardonnay', 'Russian River Valley', 1200, 4300, 4);
  perform seed_wine(r_id, c_white, 'Domaine Moillard Sauvignon Blanc', 'Saint-Bris, France', 1100, 3900, 5);
  perform seed_wine(r_id, c_white, 'Umami Ranchi Pecorino', 'Italy', 1200, 4200, 6);
  it := seed_item(r_id, c_white, 'Sancerre', 'Sancerre, France (bottle only)', 6500, 7);
  perform seed_wine(r_id, c_white, 'Stoller Unoaked Chardonnay', 'Willamette Valley, Oregon', 1100, 3900, 8);

  -- ======================================================================
  -- RED WINE (Vin Rouge)
  -- ======================================================================
  perform seed_wine(r_id, c_red, 'La Vieille Ferme', 'Red Blend', 800, 2800, 1);
  perform seed_wine(r_id, c_red, 'Love Oregon Pinot Noir', 'Willamette Valley, OR', 1500, 5300, 2);
  perform seed_wine(r_id, c_red, 'Knuttel Estate Pinot Noir', 'Sonoma Coast, CA', 1300, 4700, 3);
  perform seed_wine(r_id, c_red, 'My Story Malbec', 'Paso Robles, CA', 1400, 4800, 4);
  perform seed_wine(r_id, c_red, 'Gru Montepulciano', 'Italy', 1100, 4200, 5);
  it := seed_item(r_id, c_red, 'Chateau D''Issan Le Haut-Medoc', 'Bordeaux, France (bottle only)', 6100, 6);
  it := seed_item(r_id, c_red, 'Chateau De Pez 2nd', 'Bordeaux, France (bottle only)', 6800, 7);
  it := seed_item(r_id, c_red, 'Orin Swift Bloodlines Cabernet Sauvignon', 'Napa Valley, CA (bottle only)', 6400, 8);
  it := seed_item(r_id, c_red, 'Stag''s Leap Wine Cellars Artemis Cabernet Sauvignon', 'Napa Valley, CA (bottle only)', 12500, 9);
  perform seed_wine(r_id, c_red, 'Noah River Cabernet Sauvignon', 'Napa Valley, CA', 1500, 5200, 10);

  -- ======================================================================
  -- ROSÉ
  -- ======================================================================
  perform seed_wine(r_id, c_rose, 'La Vieille Ferme', 'France', 800, 2800, 1);
  perform seed_wine(r_id, c_rose, 'Fleur De Prairie', 'Provence, France', 1200, 4300, 2);

  -- ======================================================================
  -- BUBBLES
  -- ======================================================================
  perform seed_wine(r_id, c_bubbles, 'Prince De Richemont Brut', 'France', 900, 3200, 1);
  perform seed_wine(r_id, c_bubbles, 'LaMarca Prosecco', 'Italy', 1200, 4400, 2);
  perform seed_wine(r_id, c_bubbles, 'Kila Cava', 'Spain', 1100, 3900, 3);
  it := seed_item(r_id, c_bubbles, 'Veuve Clicquot', 'Champagne, France (bottle only)', 12000, 4);

  -- ======================================================================
  -- BEER
  -- ======================================================================
  it := seed_item(r_id, c_beer, 'Tropicalia', 'IPA', 700, 1);
  it := seed_item(r_id, c_beer, 'Michelob Ultra', null, 500, 2);
  it := seed_item(r_id, c_beer, 'Miller Lite', null, 400, 3);
  it := seed_item(r_id, c_beer, 'Miller High Life', null, 300, 4);
  it := seed_item(r_id, c_beer, 'Modelo Especial', null, 550, 5);
  it := seed_item(r_id, c_beer, 'PBR', 'Pabst Blue Ribbon', 300, 6);
  it := seed_item(r_id, c_beer, 'Stella Artois', null, 600, 7);
  it := seed_item(r_id, c_beer, 'Peroni', null, 600, 8);
  it := seed_item(r_id, c_beer, 'High Noon', 'Vodka seltzer', 750, 9);
  it := seed_item(r_id, c_beer, 'Montucky Cold Snack', null, 450, 10);
  it := seed_item(r_id, c_beer, 'Blue Moon', null, 500, 11);
  it := seed_item(r_id, c_beer, 'Bud Light', null, 400, 12);
  it := seed_item(r_id, c_beer, 'Budweiser', null, 400, 13);
  it := seed_item(r_id, c_beer, 'Coors Light', null, 400, 14);
  it := seed_item(r_id, c_beer, 'Coors Banquet', null, 400, 15);
  it := seed_item(r_id, c_beer, 'Corona Extra', null, 550, 16);
  it := seed_item(r_id, c_beer, 'Corona Light', null, 550, 17);
  it := seed_item(r_id, c_beer, 'Guinness', null, 700, 18);

  -- ======================================================================
  -- NON-ALCOHOLIC
  -- ======================================================================
  -- Soft Drinks with a flavor choice to demonstrate a required single-select.
  it := seed_item(r_id, c_na, 'Soft Drinks', 'Fountain soda', 350, 1);
  insert into item_modifier_groups(restaurant_id, item_id, name, selection_type, required, min_select, max_select, sort_order)
    values (r_id, it, 'Choose flavor', 'single', true, 1, 1, 0) returning id into g;
  insert into modifier_options(restaurant_id, group_id, name, price_delta_cents, is_default, sort_order) values
    (r_id, g, 'Coke', 0, true, 0),
    (r_id, g, 'Diet Coke', 0, false, 1),
    (r_id, g, 'Sprite', 0, false, 2),
    (r_id, g, 'Ginger Ale', 0, false, 3),
    (r_id, g, 'Club Soda', 0, false, 4);

  it := seed_item(r_id, c_na, 'Sparkling Water', null, 500, 2);
  it := seed_item(r_id, c_na, 'Juice', 'Orange, cranberry, or pineapple', 400, 3);
  it := seed_item(r_id, c_na, 'Hot Tea', null, 350, 4);
  it := seed_item(r_id, c_na, 'Iced Tea', null, 325, 5);
  it := seed_item(r_id, c_na, 'Coffee', null, 325, 6);

  raise notice 'Seeded restaurant % with full menu.', r_id;
end $$;

-- Clean up helper functions.
drop function if exists seed_wine(uuid, uuid, text, text, int, int, int);
drop function if exists seed_item(uuid, uuid, text, text, int, int);
