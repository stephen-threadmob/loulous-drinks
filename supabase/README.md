# Database setup — two ways

Pick **one** of these. Don't run both against the same Supabase project.

## Option A — Supabase GitHub integration (recommended for you)

You already have Supabase connected to GitHub, so the database sets itself up
from these files:

```
supabase/migrations/
  20260722010000_init_schema.sql   <- tables, security rules, storage buckets
  20260722010100_seed_menu.sql     <- the Lou Lou's + Foster's menu
```

When you push this project to your repo, the integration applies the migrations
(preview branches first, then production when merged). Nothing to paste by hand.

Notes:
- The two files run in filename order — schema first, then the menu. Keep them
  in the `supabase/migrations/` folder with these names.
- `seed.sql` (in this folder) is the same menu data in Supabase's local-seed
  location; it's used for `supabase db reset` and preview branches. The menu is
  also included as migration #2 so **production** gets it too.
- If you later change the menu through the admin UI, that's fine — migrations
  only run once and won't overwrite your edits.

## Option B — Paste it once (no integration)

If you're not using the integration, open the Supabase SQL Editor and run the
single combined file:

```
supabase/setup.sql
```

That's schema + policies + seed in one paste. (Or run `schema.sql`,
`policies.sql`, `seed.sql` individually, in that order.)

---

Either way, after the database is set up, finish with **DEPLOYMENT.md step 4**
(create your admin login) and **step 5** (turn on Realtime for the `orders`
table).
