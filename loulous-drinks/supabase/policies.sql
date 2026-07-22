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
