# Nepthic Wholesale

`wholesale.nepthic.com`: the B2B site for stockists. It is self-contained, with its own Postgres database, buyer logins, cart, checkout and Stripe. It doesn't call Clothing, Events or the gateway while serving pages.

**No admin pages here.** Nepthic staff manage Wholesale from the separate [Admin Portal](../portal) (`admin.nepthic.com`). This site only exposes a small admin API (`POST /api/ops/v1/<op>`, in `core/ops/`) that accepts nothing but short-lived tokens signed by the portal. See [../docs/admin-api.md](../docs/admin-api.md).

## Features
- **Trade accounts.** Registration with ABN check. An admin approves the account before the buyer sees trade prices.
- **Catalogue.** Per-size quantities, MOQ per style, volume price tiers, and live totals in the bulk order builder.
- **Enquiries and quotes.** Staff price a quote, the buyer accepts, and it converts to an order.
- **Payments.** Full payment or deposit + balance. Admins switch this in the portal (Wholesale → Settings), per business, per quote or per unpaid order.
- **Returns.** Only through a request that an admin approves.
- **Products are a copy of the Clothing catalogue.** It is imported daily and on demand. See [../docs/catalogue-feed.md](../docs/catalogue-feed.md).
- **Admin, through the portal.** Dashboard, approvals, quotes, orders, trade accounts, buyers, returns, pricing tiers, products & stock, payments and settings: all as admin API operations (`core/ops/wholesale.ts`), each with the role level allowed to run it.
- **Admin preview bar.** An admin who opens the site from the portal sees a bar with "Edit this product" shortcuts. Customers never receive it.

## Run locally
```sh
cp .env.example .env            # DATABASE_URL etc.
createdb nepthic_wholesale
npm ci
npm run db:migrate
npm run db:seed                 # settings, tiers, catalogue import, demo buyer and data
npm run dev                     # http://localhost:3001
```
Demo logins (development only):

| Account | Email | Password |
|---|---|---|
| Buyer | `buyer@example.com` | `demo-password` |

Staff and admins sign in to the portal instead (`cd ../portal && npm run db:seed-dev`).

## Scripts

| Command | What it does |
|---|---|
| `npm run build` / `npm start` | Production build and server (port 3001) |
| `npm run catalogue:import` | Copy the Clothing catalogue now. Exits non-zero on failure; the old copy is kept. |
| `npm test` | Unit tests: pricing, MOQ, deposits, ABN, catalogue feed, glow, cursor |
| `npm run typecheck` | TypeScript |
| `npm run db:generate` / `db:migrate` | Drizzle migrations |

## Environment
See `.env.example`. The site-specific variables:
- `CLOTHING_CATALOGUE_URL` and `CLOTHING_CATALOGUE_TOKEN`: where the catalogue feed lives.
- `CRON_SECRET`: protects `/api/cron/catalogue-import`. Vercel Cron calls it daily at 03:00 Brisbane time (`vercel.json`).
- `PORTAL_PUBLIC_KEY`: the Admin Portal's public key; turns on the admin API. Empty = the API answers 404.
- `PORTAL_URL`: the portal's address, used only server-side (team alert emails, the admin preview bar).
- `NEXT_PUBLIC_LOGO_HREF`: where the logo points. The default is this site's home.

## Layout
```
app/(site)/        buyer-facing pages
app/api/ops/v1/    admin API for the portal (plus the admin preview start/end)
app/api/           Stripe webhook, uploads, cron import
core/              auth, pricing, payments, email, catalogue import (this site's own copies)
core/ops/          admin API: token check, roles, operations, preview
db/                schema, migrations, seed
ui/                brand tokens, glow, header, icons
```
