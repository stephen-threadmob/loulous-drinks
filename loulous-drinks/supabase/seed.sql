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
