# Lou Lou's + Foster's — Table Drink Ordering

A mobile-first web app where guests scan a QR code at their table, browse the
drink menu, customize and submit an order, and the bar instantly gets a text
message plus a live order on the admin dashboard. No customer accounts, **no
customer data stored**, and no online payments — staff take payment as usual.

Built with **Next.js + TypeScript + Tailwind + Supabase + Twilio**, deployable
free/cheaply on **Vercel**.

---

## What it does

**For guests (no app, no login):**
scan QR → browse drinks → tap a drink → choose size/ice/etc. → add to cart →
enter table number → submit → see an order number. That's it.

**For you (the bar):**
a private admin area to see live orders (with a sound alert), update each
order's status, manage the menu, upload a menu file to auto-fill drinks, set
your notification phone number and hours, and print a QR poster.

The sample data is the **real Lou Lou's + Foster's menu** (cocktails, wines by
the glass/bottle, bubbles, beer, non-alcoholic), so the app is usable the moment
it's set up.

---

## The 15-minute setup (non-technical)

You'll create three free accounts and copy a few keys. Full click-by-click
steps with screenshots-worth of detail are in **[DEPLOYMENT.md](./DEPLOYMENT.md)**.
Short version:

1. **Supabase** (database + logins + file storage) — create a project, then
   paste the file `supabase/setup.sql` into the SQL editor and press Run. This
   builds every table, security rule, and loads the menu in one step.
2. **Twilio** (text messages) — *optional to start.* Get a phone number and two
   keys. If you skip this, orders still work and show on the dashboard; they just
   won't text you until you add it.
3. **Vercel** (hosting) — connect this project, paste your keys as environment
   variables, and deploy. You get a public web address.
4. Create your **admin login** and set your **notification phone number** in
   Settings.
5. Open the **QR code** page, print the poster, put it on the tables.

Everything you must fill in (keys, phone number) is listed in `.env.example`
and explained in DEPLOYMENT.md.

---

## Run it on your computer (for developers)

```bash
npm install
cp .env.example .env.local     # then fill in your Supabase keys (min. required)
npm run dev                    # http://localhost:3000
```

- Customer menu: `http://localhost:3000/lou-lous-fosters`
- Admin: `http://localhost:3000/admin` (sign in with the user you create in Supabase)

`npm run typecheck` and `npm run build` verify the project compiles.

---

## Accounts / services you need

| Service      | What it's for                         | Needed to launch?             | Free tier                        |
| ------------ | ------------------------------------- | ----------------------------- | -------------------------------- |
| **Supabase** | Database, admin logins, file storage  | **Yes**                       | Yes (free project)               |
| **Vercel**   | Hosting the website                   | **Yes**                       | Yes (Hobby)                      |
| **Twilio**   | Sending order text messages           | Recommended (can add later)   | Trial credit; then pay-as-you-go |
| AI/OCR key   | Reading an uploaded menu file for you | Optional (a mock is built in) | Depends on provider              |

You do **not** need a payments provider — v1 takes no online payment.

---

## Estimated monthly cost

For a single bar with typical volume:

| Item                    | Typical monthly cost                                        |
| ----------------------- | ----------------------------------------------------------- |
| Supabase                | **$0** on the free tier (upgrade to ~$25 only if you grow)  |
| Vercel                  | **$0** on Hobby (a custom domain is optional, ~$1–2/mo)     |
| Twilio phone number     | ~**$1.15/month**                                            |
| Twilio SMS              | ~**$0.008 per text** (≈ $8 for 1,000 orders/month)          |
| Domain name (optional)  | ~**$10–15/year**                                            |
| **Realistic total**     | **≈ $2–15/month** at low–moderate volume                    |

Heavy nights with very long orders may send a second text (still fractions of a
cent each). See DEPLOYMENT.md for how to keep costs down.

---

## Launch checklist

- [ ] Ran `supabase/setup.sql` in Supabase (tables + menu loaded).
- [ ] Created the three storage buckets (the SQL does this; verify they exist).
- [ ] Created an admin user in Supabase Auth and linked it (DEPLOYMENT.md step 4).
- [ ] Enabled Realtime on the `orders` table (DEPLOYMENT.md step 5).
- [ ] Deployed to Vercel with all environment variables set.
- [ ] Set `NEXT_PUBLIC_SITE_URL` to your real web address.
- [ ] Signed in to `/admin`, set your **notification phone number** in Settings.
- [ ] (If texting) Added Twilio keys and sent yourself a test order.
- [ ] Set your **table number range** and (optional) **ordering hours**.
- [ ] Reviewed the menu, added drink photos where you want them.
- [ ] Printed the QR poster and tested it with your own phone.
- [ ] Walked through the [testing checklist](./TESTING.md).

---

## Recommended improvements for version 2

- **Online payment / tabs** (Stripe) if you later want pre-payment or tipping.
- **Live extraction key** so uploaded menu files are read automatically (the
  integration point is already built — just add a key).
- **Order history & simple analytics** (busiest hours, top drinks).
- **Staff accounts with roles** (bartender vs. manager) and per-device logins.
- **Multiple restaurants / locations** — the database already supports this;
  add a location switcher and per-location QR codes.
- **Guest order status** — let the guest watch "preparing → on its way" from
  their phone (would introduce a lightweight, anonymous order token).
- **Two-way SMS / printer** — send to a kitchen printer or reply to acknowledge.
- **"Buzz me" waitlist / call-server button.**

---

## How it's built (for the curious)

- `src/app/[slug]` — the customer menu + cart + checkout (one smooth flow).
- `src/app/admin` — the protected dashboard, menu manager, upload, settings, QR.
- `src/app/api/orders` — the secure server route that saves orders and texts you.
- `src/lib` — Supabase clients, pricing, SMS formatting, extraction, validation.
- `supabase/` — the database schema, security rules, and the seeded menu.

See **[docs/TECHNICAL_PLAN.md](./docs/TECHNICAL_PLAN.md)** for the architecture
and the design decisions we made where the brief left a choice open.
