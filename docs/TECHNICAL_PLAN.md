# Technical Plan — Lou Lou's + Foster's Drink Ordering

## 1. Goal

A mobile-first web app where a bar guest scans a QR code at their table, browses
the drink menu, customizes drinks, enters their table number, and submits an
order. The owner instantly receives a formatted SMS and sees the order in a
real-time admin dashboard. No customer accounts. No online payment in v1.

The sample tenant is **Lou Lou's + Foster's** (1350 13th Street, Columbus GA
31901, @loulousbistro_fostersbar), seeded from the bar's real drink menu.

## 2. Stack

| Concern            | Choice                                             |
| ------------------ | -------------------------------------------------- |
| Framework          | Next.js 14 (App Router) + TypeScript               |
| Styling            | Tailwind CSS (brand colors via CSS variables)      |
| DB / Auth / Storage| Supabase (Postgres + Row-Level Security + Storage) |
| SMS                | Twilio                                             |
| QR codes           | `qrcode` (PNG + SVG, generated server-side)        |
| Validation         | `zod` on every server input                        |
| Hosting            | Vercel                                             |

## 3. Architecture decisions (documented MVP choices)

These are business decisions the brief left open; we chose the most practical
option for a bar MVP and note them here.

1. **Multi-tenant from day one, single tenant in use.** Every table has a
   `restaurant_id`. A `restaurants` row + `slug` identifies the tenant. The
   customer URL is `/{slug}`. This satisfies "eventually support multiple
   restaurants" without a rewrite, while we only seed one.
2. **Auth = Supabase email/password**, admins linked to a restaurant via an
   `admin_users` join table. RLS ensures an admin only ever sees their own
   restaurant's data. The public (anon) role can read only *published* menu data
   and can *insert* orders through a locked-down server route — never directly.
3. **Order writes go through a server route** using the service-role key, not
   directly from the browser. This lets us validate, rate-limit, de-duplicate,
   compute authoritative prices server-side (never trust the client's totals),
   and send SMS. Customers never touch the service key.
4. **Wine glass/bottle pricing is modeled as a "Size" modifier group.** The base
   price is the by-the-glass price; a "Bottle" option carries the price delta.
   This reuses the modifier system rather than adding a special-case schema.
5. **Menu extraction is mocked but real-API-ready.** `lib/extraction` has a
   provider interface; the default `mock` provider returns a realistic parsed
   menu. Swapping in Anthropic/OpenAI vision is one env var + one file. Extracted
   data is written to a `menu_uploads` row as a *draft* and is NEVER published
   until an admin approves it in the review screen.
6. **Prices stored as integer cents** to avoid floating-point money bugs.
7. **Order numbers** are human-friendly per-restaurant daily sequences, e.g.
   `A-014`, generated atomically in the DB.
8. **Timezone** stored per-restaurant (`America/New_York` for Columbus GA); all
   customer-facing timestamps render in the restaurant's zone.

## 4. Data model (see `supabase/schema.sql`)

```
restaurants ──1:N── admin_users (─ auth.users)
      │
      ├─1:1── restaurant_settings (phone, colors, table range, hours, sound…)
      ├─1:N── menu_uploads (original file + extracted draft JSON + status)
      ├─1:N── categories ──1:N── menu_items
      │                              ├─1:N── item_modifier_groups ──1:N── modifier_options
      │                              └─(availability, image, sort_order)
      └─1:N── orders ──1:N── order_items ──1:N── order_item_modifiers
                        └── sms_logs (per send attempt)
```

Every table has `created_at`/`updated_at`. Status fields use Postgres enums.
RLS policies in `supabase/policies.sql`.

## 5. Route map

Customer (public):
- `/{slug}` — menu + cart + checkout (single-page ordering flow)
- `/{slug}/confirmation/{orderNumber}` — confirmation

Admin (authenticated):
- `/admin/login`
- `/admin/dashboard` — realtime orders
- `/admin/orders/{id}` — full order breakdown
- `/admin/menu` — categories, items, modifiers management
- `/admin/upload` — upload a menu file
- `/admin/upload/{id}/review` — review & approve extracted draft
- `/admin/settings` — restaurant profile, phone, colors, table range, hours
- `/admin/qr` — generate / download QR + printable poster
- `/admin/preview` — preview customer menu before publishing

API (server):
- `POST /api/orders` — submit order (validate, rate-limit, de-dupe, save, SMS)
- `PATCH /api/orders/{id}` — update status (admin)
- `POST /api/uploads` — accept + store file, kick off extraction
- `POST /api/uploads/{id}/publish` — publish approved draft into live menu
- `GET  /api/qr` — QR as PNG or SVG

## 6. Security posture

Service-role key server-only; anon key + RLS in the browser; zod validation on
all inputs; per-IP + per-table rate limiting and a signed idempotency token on
order submit; file type/size allow-list on upload; owner phone never sent to any
public route; server errors logged without leaking internals to customers.

## 7. Build order

Matches the brief: plan → schema → scaffold → auth → upload/review → menu mgmt →
customer menu → cart/checkout → order API → SMS → dashboard → QR → hardening →
sample data → docs → testing.
