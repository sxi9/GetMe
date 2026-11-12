# GetMe

Hyperlocal delivery for Bengaluru: a customer writes a shopping list (or orders from a nearby shop's catalogue, or sends a package), picks how a delivery partner is found, and tracks the partner live until a code-verified handover. Three apps, one backend.

Built from the design handoff in `design/` (the clickable prototype, seed data and spec are kept there for reference).

## Layout

| Path | What it is |
| --- | --- |
| `packages/core` | Pure TypeScript domain: types, the order state machine for all three roles, pricing and settlement, dispatch rules, validation. Unit-tested, no I/O. |
| `apps/api` | Fastify API + WebSocket realtime on SQLite (`node:sqlite`, no native deps). Auth, orders, dispatch engine, chat, wallet/ledger, shops, partners, subscriptions, public tracking links. |
| `apps/web` | Vite + React mobile web app with three role entry points: `/customer`, `/partner`, `/shop`, plus the public `/track/:token` page. Styled 1:1 from the Vulpes design tokens in the handoff. |
| `e2e` | Playwright end-to-end run across the three roles. |

## Run it

```bash
pnpm install
pnpm dev            # API on :4000 and web on :5173
```

Open http://localhost:5173 and pick an app. Demo accounts sign in with code `1234`:

| Role | Phone | Who |
| --- | --- | --- |
| Customer | 98450 12345 | Priya Menon, HSR Layout Sector 2, wallet ₹350 |
| Partner | 99860 44112 | Ravi Kumar, bike, 4.8 |
| Shop | 98860 71234 | Nandini's Fresh Mart |

Open each app in its own tab (or device on the same network) to run a live order across roles. The seeded partners Fathima, Arjun and Manoj are simulated in development (`SIM_BOTS=1`) so broadcast, offers and choose modes all resolve with one real partner logged in.

```bash
pnpm test           # core unit tests + API integration tests
pnpm typecheck
pnpm e2e            # Playwright: boots its own API/web on :4100/:5174
pnpm build
```

## How it works

**One state machine.** `packages/core/src/machine.ts` is the single reducer for every order event (customer, partner, shop and system). The API validates and applies it; the apps use the same rules to decide what to show. Statuses: `requesting → counter → requesting` (decline) · `requesting/counter → to_shop` (assign) `→ shopping → to_customer → arrived → delivered`; any pre-shopping state `→ cancelled`; open requests nobody takes `→ expired`. Catalogue orders carry a shop-side status (`new → preparing → ready → handed → done`) beside the partner status.

**Dispatch.** Broadcast and offers requests go to online, verified, free partners with a fresh location inside the search radius (2 km, widening to 4 km and 6 km each minute). Choose-mode requests go only to the chosen partner, who has 60 s to answer. Requests expire after 5 minutes. Accept is first-wins; the API rejects a second accept. Offers expire after 3 minutes. A partner may drop a job only before they start shopping, which re-dispatches it.

**Money.** Delivery fee = ₹25 + ₹15/km (rounded up to ₹5, min ₹30, max ₹150), which reproduces the handoff's shop fees; packages are ₹49/69/99 by size; service fee ₹5; package protection ₹9; promo `GETME20` takes ₹20 off list and catalogue deliveries. The partner keeps the full delivery fee, extra and tip. For list orders the partner fronts the item cost (capped by their float limit and the customer's budget) and is reimbursed on completion. On COD the partner holds the cash and the ledger records what they owe the platform. Catalogue shops are settled at 92% of item value. Wallet payments require a balance covering the fees at checkout and are deducted on delivery.

**Realtime.** Every event is addressed to the users who should see it, with role-specific views: the partner never receives the handover code, anonymous customers are shown as "Customer", the shop sees items and status but no address. Clients reconnect automatically.

**What is stubbed for development.** OTP codes are fixed (`DEV_OTP`), Google and email sign-in create a user without verifying with Google, geocoding of typed addresses is approximate, maps use OpenStreetMap tiles via Leaflet (swap the tile URL for Google/Mapbox), photos are stored on local disk under `DATA_DIR/uploads`, calls are a masked-call overlay, and bot partners simulate the dispatch pool.

## Production checklist

Replace `DEV_OTP` with an SMS provider and set `SIM_BOTS=0`; verify Google ID tokens; add a payment gateway behind the `charge` ledger entries (auth at checkout, capture on delivery) and bank payouts behind `payout`; move uploads to object storage; put Postgres/PostGIS behind `Db` if you outgrow SQLite; add push (FCM/APNs) where the API calls `notify`; wrap the partner web app in Capacitor for background location, or port the screens to Expo using `@getme/core` unchanged.
