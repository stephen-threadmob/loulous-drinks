# Deployment & Setup Guide

This walks you all the way from nothing to a live app, in plain steps. Where you
must paste a key or a phone number, it says exactly where.

There are three services: **Supabase** (data + logins + files), **Twilio**
(texts), and **Vercel** (hosting). Twilio is optional to start.

---

## Step 1 — Supabase (required)

1. Go to <https://supabase.com>, sign up, and click **New project**. Give it a
   name (e.g. "loulous-drinks"), set a database password (save it), pick a
   region near you, and create it. Wait ~2 minutes for it to provision.

2. In the left sidebar open **SQL Editor → New query**. Open the file
   `supabase/setup.sql` from this project, copy **all** of it, paste it in, and
   press **Run**. You should see "Success". This creates every table, all the
   security rules, the three storage buckets, and loads the Lou Lou's + Foster's
   menu.
   - (Advanced: if you prefer, run `schema.sql`, then `policies.sql`, then
     `seed.sql` individually in that order — `setup.sql` is just the three
     combined.)

3. Get your keys: **Project Settings → API**. You'll need three values:
   - **Project URL** → env var `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`
     ⚠️ The service_role key is a master key. Only ever put it in server-side
     environment variables (never in a webpage). This project keeps it server-only.

4. **Create your admin login and link it to the restaurant.**
   - Go to **Authentication → Users → Add user**. Enter your email + a password,
     and tick "Auto Confirm User".
   - Copy that user's **UID** (shown in the user list).
   - Go back to **SQL Editor** and run this (replace the UID):

     ```sql
     insert into admin_users (user_id, restaurant_id, role)
     select 'PASTE-USER-UID-HERE', id, 'owner'
     from restaurants where slug = 'lou-lous-fosters';
     ```

   That links your login to the restaurant so you can see its dashboard.

5. **Turn on Realtime for live orders.**
   - Go to **Database → Replication** (or **Database → Publications →
     `supabase_realtime`**).
   - Make sure the **`orders`** table is included. Toggle it on if it isn't.
   - This is what makes new orders appear on the dashboard without refreshing.

6. **Verify storage buckets.** Go to **Storage**. You should see three buckets:
   `menu-uploads` (private), `drink-images` (public), `restaurant-logos`
   (public). The setup SQL creates them; if any are missing, create them with
   those exact names and public settings.

---

## Step 2 — Twilio (optional, for text alerts)

You can launch without this — orders still save and show on the dashboard, and
each order will simply be marked "SMS off". Add this whenever you're ready.

1. Sign up at <https://twilio.com>. From the **Console dashboard** copy:
   - **Account SID** → `TWILIO_ACCOUNT_SID`
   - **Auth Token** → `TWILIO_AUTH_TOKEN`
2. **Get a phone number:** Phone Numbers → Buy a number (with SMS capability).
   Put it, in `+1XXXXXXXXXX` format, into `TWILIO_FROM_NUMBER`.
3. **Trial accounts** can only text *verified* numbers — verify your own cell
   under **Verified Caller IDs**, or upgrade the account to text freely.
4. Your **notification phone** (the cell that receives orders) is **not** an env
   var — you set it in the app under **Admin → Settings → Order notification
   cell phone**. It's stored privately and never shown to customers.

---

## Step 3 — Vercel (required, hosting)

1. Push this project to a GitHub repo (or use the Vercel CLI). At
   <https://vercel.com> click **Add New → Project** and import the repo.
2. Before deploying, open **Environment Variables** and add everything from
   `.env.example` that you have:

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | from Supabase step 3 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase step 3 |
   | `SUPABASE_SERVICE_ROLE_KEY` | from Supabase step 3 (keep secret) |
   | `NEXT_PUBLIC_SITE_URL` | your Vercel URL, e.g. `https://loulous-drinks.vercel.app` |
   | `NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG` | `lou-lous-fosters` |
   | `TWILIO_ACCOUNT_SID` | from Twilio (optional) |
   | `TWILIO_AUTH_TOKEN` | from Twilio (optional) |
   | `TWILIO_FROM_NUMBER` | from Twilio (optional) |
   | `ORDER_SIGNING_SECRET` | any long random string (`openssl rand -hex 32`) |
   | `MENU_EXTRACTION_PROVIDER` | leave blank for now |
   | `MENU_EXTRACTION_API_KEY` | leave blank for now |

3. Click **Deploy**. When it finishes, copy your live URL and — important —
   update `NEXT_PUBLIC_SITE_URL` to that URL, then redeploy once. This makes the
   QR code point to the right place.

4. **Custom domain (optional):** In Vercel → Project → Domains you can add a
   domain like `order.yourbar.com`. Update `NEXT_PUBLIC_SITE_URL` to match.

---

## Step 4 — Final setup inside the app

1. Visit `https://YOUR-URL/admin` and sign in with the user from Supabase step 4.
2. Go to **Settings** and set:
   - **Order notification cell phone** (your number, e.g. `+1 706 555 1234`).
   - **Table number range** (lowest and highest table numbers you use).
   - **Ordering hours** (optional — leave blank to accept orders any time).
   - Colors and logo if you want to tweak the look.
3. Go to **Menu**, review the drinks, and add photos where you like.
4. Go to **QR code**, download the PNG/SVG, or print the poster for the tables.
5. Scan the code with your phone and place a test order to confirm the text
   arrives and the order shows on the dashboard.

---

## Turning on real menu extraction (optional, later)

Out of the box, uploading a menu file returns a realistic **mock** result so you
can try the review-and-publish flow. To read real files automatically:

1. Get an API key from a vision-capable provider (Anthropic or OpenAI).
2. Set env vars: `MENU_EXTRACTION_PROVIDER=anthropic` (or `openai`) and
   `MENU_EXTRACTION_API_KEY=your-key`.
3. Redeploy. The integration lives in `src/lib/extraction/providers.ts` — the
   request/response shape is already implemented; confirm the current model name
   against your provider's docs. Uploaded data still always goes to the **review
   screen** and is never published without your approval.

---

## Production hardening notes

- **Rate limiting** here is in-memory (per server instance) — good enough to
  blunt bursts. For strict global limits, wire `src/lib/rate-limit.ts` to a
  shared store like Upstash Redis (`@upstash/ratelimit`).
- **Secrets**: only `NEXT_PUBLIC_*` variables reach the browser. The service
  role key, Twilio token, and extraction key are server-only and are never
  imported into client components (`src/lib/supabase/admin.ts` and the SMS/
  extraction modules use `import "server-only"` to enforce this at build time).
- **Backups**: Supabase includes automatic backups on paid tiers; export
  periodically on free.
- **Row-Level Security** is on for every table. Customers (anon) can read only
  the published menu; they cannot read orders or your phone number, and orders
  can only be created through the server route.
