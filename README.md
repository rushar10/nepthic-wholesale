# Nepthic Wholesale

`wholesale.nepthic.com`: the B2B site for stockists. It is self-contained, with its own Postgres database, logins, cart, checkout, Stripe and admin (`/admin`). It doesn't call Clothing, Events or the gateway while serving pages.

## Features
- **Trade accounts.** Registration with ABN check. An admin approves the account before the buyer sees trade prices.
- **Catalogue.** Per-size quantities, MOQ per style, volume price tiers, and live totals in the bulk order builder.
- **Enquiries and quotes.** Staff price a quote, the buyer accepts, and it converts to an order.
- **Payments.** Full payment or deposit + balance. Admins switch this globally in `/admin/settings`, per business, per quote or per unpaid order.
- **Returns.** Only through a request that an admin approves.
- **Products are a copy of the Clothing catalogue.** It is imported daily and on demand. See [../docs/catalogue-feed.md](../docs/catalogue-feed.md).
- **Admin.**
  - Overview dashboard, approvals, quotes, orders and trade accounts.
  - Buyers, returns, pricing tiers and products & stock.
  - Payments and settings (admin only).

## Run locally
```sh
cp .env.example .env            # DATABASE_URL etc.
createdb nepthic_wholesale
npm ci
npm run db:migrate
npm run db:seed                 # settings, tiers, admin, catalogue import, demo data
npm run dev                     # http://localhost:3001
```
Demo logins (development only):

| Account | Email | Password |
|---|---|---|
| Admin | `admin@wholesale.nepthic.com` | `change-me-now` |
| Staff | `staff@wholesale.nepthic.com` | `change-me-now` |
| Buyer | `buyer@example.com` | `demo-password` |

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
- `OVERVIEW_API_TOKEN`: turns on the read-only `/api/overview/summary`. Leave it empty to keep that endpoint off.
- `NEXT_PUBLIC_LOGO_HREF`: where the logo points. The default is this site's home.

## Layout
```
app/(site)/        buyer-facing pages
app/(admin)/admin/ admin panel (staff and admins only)
app/api/           Stripe webhook, uploads, cron import, overview summary
core/              auth, pricing, payments, email, catalogue import (this site's own copies)
db/                schema, migrations, seed
ui/                brand tokens, glow, header, icons
```
