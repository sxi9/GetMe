# How GetMe was built: decisions and history

This file keeps the reasoning that otherwise lived only in the build conversation, so the repository explains itself.

## 1. Starting point

The input was a high-fidelity design handoff (`design/`): a clickable HTML prototype of three phone apps, seed data, copy, a state machine sketch and a token set. The repository was empty.

### Gap analysis of the handoff (before any code)

What the prototype faked and what was missing, which drove the backend design:

- Dispatch was bots on timers; no matching radius, timeouts, first-accept atomicity, single-active-job rule or location freshness.
- Exactly one order existed globally.
- Payments were labels; no gateway, no capture when the item cost is unknown until after purchase, no refunds, no payouts.
- The partner float was unaddressed: on UPI nobody reimbursed the partner for items they bought.
- Pricing was static per shop; no commission defined.
- OTP fixed at 1234, handover code fixed at 4821, one hard-coded address, no onboarding, no admin, no translations, no push, no offline handling.

## 2. Architecture decisions

| Decision | Why |
| --- | --- |
| pnpm monorepo: `packages/core`, `apps/api`, `apps/web`, `apps/mobile`, `e2e` | One domain model shared by the API and every app; the state machine is tested once |
| Web first (Vite + React PWA), native shells later (Capacitor) | Verifiable in a browser and in CI; the handoff tokens were CSS; store apps reuse the same screens |
| SQLite via `node:sqlite`, JSON documents with a few indexed columns | Zero native dependencies and a one-file backup; swap to Postgres behind `Db` when needed |
| One reducer for every order event with the actor in the event | Permissions and transitions live in one tested table; the UI uses the same rules to decide what to show |
| Role-specific projections of an order | The partner never receives the handover code; anonymous customers stay anonymous; the shop sees no address |
| Partner keeps delivery + extra + tip; list items are reimbursed on completion; COD records what the partner owes | Makes the partner float explicit and auditable in the ledger |
| Delivery fee = (base + per-km × distance) × surcharge, rounded up to ₹5 | Reproduces the handoff's shop fees exactly and generalises to hills and villages |
| Dev-only bot partners | The product is demoable with one real partner; `SIM_BOTS=0` in production |

## 3. Phases

1. **Scaffold and city flows.** Core, API with realtime, UI kit from the handoff, customer, partner and shop apps built in parallel, a Playwright run across three browser contexts (`docs/screenshots/01-city-delivery-flow.png`).
2. **Places delivery apps skip.** Reframed for apartments, hill stations and villages: GPS deliver-to, pin and landmark addresses, apartment fields with gate or leave-at-door proof photos, region profiles, trips (a partner announces a run, neighbours attach orders), community runners, communities with a notice board, photos, push with SMS fallback, offline queue, Kannada and Hindi, admin app (`docs/screenshots/02-trips-gps-crypto-flow.png`).
3. **Payments and live tracking.** Crypto (USDT/USDC) with the handover gated on confirmation; live vehicle marker with heading, trail and a traffic-aware ETA.
4. **Dark mode, docs, ops CLI.**
5. **Standalone theme.** The handoff's tokens belonged to another company's product system, so they were replaced with GetMe's own mild palette (`docs/screenshots/03-*` and `04-*`).
6. **Native apps.** Three Capacitor targets from the one web build with background location, FCM push and store assets.

## 4. Theme rationale

Delivery incumbents each own one loud colour (Swiggy orange, Zomato red, Blinkit yellow); grocery and fresh brands converge on greens with warm neutrals. GetMe uses a mild teal-green for actions, warm off-white surfaces, a honey accent for the brand mark, Manrope for text and IBM Plex Mono for numbers, with light and dark palettes in one token file (`apps/web/src/styles/theme/tokens.css`).

## 5. Verification at the end of the build

- Core unit tests: 16. API integration tests: 9. Playwright: 3 specs across customer, partner, runner and shop, with screenshots.
- Typecheck and production build clean; `cap sync` succeeds for the three native targets.

## 6. Security audit (2026-11-13)

Dependency audit found 29 advisories (fastify, @fastify/static with glob/minimatch, react-router); all fixed by upgrading, audit now clean. Code audit fixed: HTML injection through partner names in map markers, SVG uploads served same-origin (scripts), no OTP attempt limit or rate limit, sessions that never expired, idempotency keys shared across users, unbounded text and numeric inputs, missing coordinate validation, Web Push endpoints accepted for any host, unvalidated admin region overrides, reflective CORS, and missing security headers. Seven regression tests cover these in `apps/api/test/security.test.ts`.

## 7. Known stubs

Fixed dev OTP, Google sign-in without token verification, simulated crypto provider, console SMS provider, local-disk uploads, straight-line routing with a traffic model, no UPI/card gateway or bank payouts. All are adapters with environment switches; see `docs/SETUP.md`.
