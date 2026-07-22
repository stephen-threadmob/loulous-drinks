# Testing Checklist

Work through these on a phone (or browser dev tools in mobile view) against the
customer menu at `/{slug}` and the admin dashboard at `/admin/dashboard`. Each
row lists what to do, what you should see, and where it's handled in the code.

Legend: ✅ = expected result.

---

## Required order scenarios

| # | Scenario | Steps | Expected | Handled in |
| - | -------- | ----- | -------- | ---------- |
| 1 | **One drink** | Add a beer, set table, submit | ✅ Order number shown; dashboard shows 1 drink; text arrives (if Twilio on) | `api/orders`, `CustomerMenu` |
| 2 | **Several drinks** | Add a margarita, a wine, a beer; submit | ✅ All appear in order, subtotal correct | cart + `api/orders` pricing |
| 3 | **Multiple of same drink** | Add 3× the same beer (no mods) | ✅ Shows "3 × …", price ×3 | cart merge by `lineKey` |
| 4 | **Different mods, same drink** | Add a margarita "No salt", then another "Sugar rim, extra lime" | ✅ Two separate lines, each priced right | `lineKey` includes options |
| 5 | **Drink with no modifications** | Add a beer | ✅ Adds instantly, no modal choices required | item has no groups |
| 6 | **Special instructions** | On a cocktail, type "extra cold"; submit | ✅ Note appears on dashboard + in the text | `special_instructions` snapshot |
| 7 | **Invalid / missing table number** | Try to submit with table blank, `0`, or above your max | ✅ Blocked with a clear message; can't submit | client validation + server range check |
| 8 | **Sold-out drink** | In admin set a drink to "Sold out", reload menu | ✅ Shows "Sold out", not tappable; server also rejects if forced | `availability`, `items_public_read`, `api/orders` 409 |
| 9 | **Double-tap submit** | Tap Submit twice fast | ✅ Only **one** order is created (same order number returned) | idempotency key + unique constraint |
| 10 | **SMS failure** | Put a bad number in Settings (or a Twilio trial + unverified number) and order | ✅ Order still saves; dashboard shows "⚠ SMS failed" | SMS after save; `sms_logs`; dashboard badge |
| 11 | **Incomplete menu file** | Upload any file; on the review screen note the flagged/blank items | ✅ Uncertain items highlighted; blank-price item is hidden until you set a price; nothing publishes until you press Publish | `extraction`, `ReviewForm`, publish route |
| 12 | **Menu update, same QR** | Edit/add a drink in admin; re-scan the same QR | ✅ New menu shows; QR/URL unchanged | permanent `/{slug}` URL |
| 13 | **Simultaneous orders** | Submit from two phones at once | ✅ Both save with distinct order numbers; both appear live | atomic `next_order_number`, realtime |

---

## Admin dashboard

- [ ] New order appears **without refreshing** (Realtime on).
- [ ] A sound plays on a new order; the **Sound on/off** toggle works.
- [ ] New/unacknowledged orders show a blue dot and ring; opening one clears it.
- [ ] Status buttons move an order through New → Acknowledged → Preparing →
      Delivered, and Cancel works.
- [ ] Each order shows table #, time, drink count, subtotal, status, SMS status.
- [ ] Opening an order shows every drink, its modifiers, notes, and the subtotal.

## Menu management

- [ ] Add / rename / hide / delete a category; reorder with ↑/↓.
- [ ] Add / edit / delete an item; change price; reorder.
- [ ] Set availability (Available / Sold out / Hidden) and see it reflected on
      the customer menu.
- [ ] Upload a drink photo and set its alt text; remove it.
- [ ] Add a modifier group + options with an extra charge; confirm the charge
      shows on the customer side and is added to the price.

## Upload & review

- [ ] Upload a PDF/JPG/PNG/CSV/XLSX/DOCX (≤10 MB); an unsupported type or an
      oversized file is rejected with a clear message.
- [ ] The review screen lets you correct names/prices before publishing.
- [ ] Publishing adds the items to the live menu; the original file is stored
      privately.

## Settings & QR

- [ ] Changing colors/logo re-themes the customer menu.
- [ ] Changing the table range changes what's accepted at checkout.
- [ ] Setting ordering hours closes ordering outside them (menu still viewable).
- [ ] The notification phone is saved and never appears on the customer side.
- [ ] QR downloads as PNG and SVG; the printable poster prints cleanly.

## Security spot-checks

- [ ] Signed out, visiting `/admin/dashboard` redirects to login.
- [ ] The owner phone number never appears in the customer page's source.
- [ ] (Technical) The `service_role` key is not present in any browser bundle.

---

## What was validated during the build

The database schema, security policies, and the full seed were executed against
a real Postgres instance:

- 7 categories, 58 drinks, 28 modifier groups, 68 options loaded from the seed.
- Wine glass/bottle pricing verified (e.g. Whitehaven: $14 glass, $49 bottle).
- `next_order_number` produces sequential per-day numbers atomically.
- As the anonymous (customer) role: the menu is readable, but `orders` and the
  owner phone are **permission-denied**, and direct order inserts are blocked —
  confirming orders can only be created through the secure server route.
- Every TypeScript/TSX source file transpiles cleanly and the app's own types
  check out.

> Note: `npm run build` should be run once in your environment after
> `npm install` (the build sandbox used here had no access to the npm registry,
> so dependencies weren't installed there). No code changes are expected.
