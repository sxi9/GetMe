# GetMe

Hyperlocal delivery for Bengaluru: a customer writes a shopping list (or orders from a nearby shop's catalogue, or sends a package), picks how a delivery partner is found, and tracks the partner live until a code-verified handover. Three apps, one backend.

Built from the design handoff in `design/` (the clickable prototype, seed data and spec are kept there for reference).

## Layout

| Path | What it is |
| --- | --- |
| `packages/core` | Pure TypeScript domain: types, the order state machine for all three roles, pricing and settlement, dispatch rules, validation. Unit-tested, no I/O. |
| `apps/api` | Fastify API + WebSocket realtime on SQLite (`node:sqlite`, no native deps). Auth, orders, dispatch engine, chat, wallet/ledger, shops, partners, subscriptions, public tracking links. |
| `apps/web` | Vite + React mobile web app with four entry points: `/customer`, `/partner`, `/shop`, `/admin`, plus the public `/track/:token` page. Styled 1:1 from the Vulpes design tokens in the handoff. |
| `e2e` | Playwright end-to-end run across the three roles. |

## Guides

- [Setup guide](docs/SETUP.md): local run, phone testing, configuration, production deployment, troubleshooting.
- [Admin panel guide](docs/ADMIN.md): every Ops tab and action, verification checklist, refunds, region tuning, CLI.
- [Roadmap](docs/ROADMAP.md): what modern delivery apps have that GetMe does not yet.

## Run it

```bash
pnpm install
pnpm dev            # API on :4000 and web on :5173
```

Open http://localhost:5173 and pick an app. Demo accounts sign in with code `1234`:

| Role | Phone | Who |
| --- | --- | --- |
| Customer | 98450 12345 | Priya Menon, HSR Layout Sector 2, wallet ₹350, member of Sunrise Residency |
| Partner | 99860 44112 | Ravi Kumar, bike, 4.8, verified |
| Community runner | 99860 44116 | Lakshmi Devi, scooter, has an open trip to Madiwala market |
| New partner | 99860 44117 | Suresh N, awaiting verification |
| Shop | 98860 71234 | Nandini's Fresh Mart |
| Ops (admin) | 90000 00000 | GetMe Ops: verification, shops, refunds, regions |

Open each app in its own tab (or device on the same network) to run a live order across roles. The seeded partners Fathima, Arjun and Manoj are simulated in development (`SIM_BOTS=1`) so broadcast, offers and choose modes all resolve with one real partner logged in.

```bash
pnpm test           # core unit tests + API integration tests
pnpm typecheck
pnpm e2e            # Playwright: boots its own API/web on :4100/:5174
pnpm build
```

## Built for places delivery apps skip

GetMe is designed for apartments, hill stations and villages as much as for the city, so a few things work differently from a gig app:

- **GPS first.** The customer app detects the device position on open, reverse-geocodes it (OpenStreetMap with a cached local gazetteer fallback) and lets the user fine-tune with a drop-a-pin map and a landmark field. In a village the pin and the landmark are the address.
- **Apartment and gate handoffs.** Addresses carry building, tower, floor, flat, a door or gate photo and spoken directions. Handoff is "hand it to me" (4-digit code), "leave at the gate" or "leave at the door"; the last two require a proof-of-delivery photo instead of the code.
- **Region profiles.** City, town, hill and village profiles set the search radius ladder, how long a request stays open (5 minutes in the city, hours in a village), per-km pricing with a hill surcharge, and defaults such as cash on delivery. Ops can tune them live.
- **Trips.** A partner announces "going to Madiwala market at 9, taking orders till 8:30". Neighbours attach their lists for a flat fee; the runner starts the trip and works the orders one by one. Trips are the default dispatch mode in hill and village profiles.
- **Community runners.** A neighbour doing a market trip anyway can sign up with just an ID and a selfie and a ₹1,000 purchase limit; full-time partners upload licence and vehicle papers. Ops verifies both.
- **Communities.** An apartment society or a village has a join code, a notice board, and trips scoped to its members.
- **Reaches a closed app.** Web Push with a service worker, and SMS as the fallback adapter when a user has no push device or app open. Important events (arrived, delivered, trip cancelled, verification) always fall back.
- **Weak networks.** Order events queue offline with idempotency keys and replay when the connection returns; the shell is cached so the app opens without signal.
- **Live vehicle and traffic.** The partner's heading and speed are derived from successive fixes; the map shows a rotating bike, scooter or cycle marker with a trail, and the ETA blends a time-of-day traffic profile with the partner's observed speed.
- **Crypto.** Customers can pay in USDT or USDC: an invoice is created once the final bill is known, the partner can complete the handover only after it confirms, and partners and shops are still settled in rupees. Simulated provider in development; NOWPayments with a signed webhook when keys are set.
- **Languages.** English, Kannada and Hindi dictionaries cover every string in the four apps.
- **Dark mode.** Light, dark or follow the system, from any Profile. Built on the Vulpes dark tokens; the map tiles are tinted to match.

## How it works

**One state machine.** `packages/core/src/machine.ts` is the single reducer for every order event (customer, partner, shop and system). The API validates and applies it; the apps use the same rules to decide what to show. Statuses: `requesting → counter → requesting` (decline) · `requesting/counter → to_shop` (assign) `→ shopping → to_customer → arrived → delivered`; any pre-shopping state `→ cancelled`; open requests nobody takes `→ expired`. Catalogue orders carry a shop-side status (`new → preparing → ready → handed → done`) beside the partner status.

**Dispatch.** Broadcast and offers requests go to online, verified, free partners with a fresh location inside the search radius (2 km, widening to 4 km and 6 km each minute). Choose-mode requests go only to the chosen partner, who has 60 s to answer. Requests expire after 5 minutes. Accept is first-wins; the API rejects a second accept. Offers expire after 3 minutes. A partner may drop a job only before they start shopping, which re-dispatches it.

**Money.** Delivery fee = ₹25 + ₹15/km (rounded up to ₹5, min ₹30, max ₹150), which reproduces the handoff's shop fees; packages are ₹49/69/99 by size; service fee ₹5; package protection ₹9; promo `GETME20` takes ₹20 off list and catalogue deliveries. The partner keeps the full delivery fee, extra and tip. For list orders the partner fronts the item cost (capped by their float limit and the customer's budget) and is reimbursed on completion. On COD the partner holds the cash and the ledger records what they owe the platform. Catalogue shops are settled at 92% of item value. Wallet payments require a balance covering the fees at checkout and are deducted on delivery.

**Realtime.** Every event is addressed to the users who should see it, with role-specific views: the partner never receives the handover code, anonymous customers are shown as "Customer", the shop sees items and status but no address. Clients reconnect automatically.

**What is stubbed for development.** OTP codes are fixed (`DEV_OTP`), Google and email sign-in create a user without verifying with Google, geocoding of typed addresses is approximate, maps use OpenStreetMap tiles via Leaflet (swap the tile URL for Google/Mapbox), photos are stored on local disk under `DATA_DIR/uploads`, calls are a masked-call overlay, and bot partners simulate the dispatch pool.

## Environment

See `.env.example`. Notable switches: `SIM_BOTS` (demo partners), `DEV_OTP` (fixed sign-in code), `SMS_PROVIDER` (`console` | `msg91` | `twilio`), `CRYPTO_PROVIDER` (`sim` | `nowpayments`), `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (generated on first start if unset), `GEOCODER` (`nominatim` default), `PUBLIC_URL` for links in SMS.

## Production checklist

Set `DEV_OTP=` and `SMS_PROVIDER` with real keys, `SIM_BOTS=0`, `CRYPTO_PROVIDER=nowpayments` with its keys, and persistent VAPID keys; verify Google ID tokens; add a UPI/card gateway behind the `charge` ledger entries (auth at checkout, capture on delivery) and bank payouts behind `payout`; move uploads to object storage; put Postgres/PostGIS behind `Db` if you outgrow SQLite; wrap the partner web app in Capacitor for background location with the screen off, or port the screens to Expo using `@getme/core` unchanged.
