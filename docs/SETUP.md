# GetMe setup guide

Everything needed to run GetMe on a laptop, on a phone on the same Wi‑Fi, and on a server.

## 1. Prerequisites

| Tool | Version | Why |
| --- | --- | --- |
| Node.js | 22 or newer | the API uses the built-in SQLite (`node:sqlite`) |
| pnpm | 10 | workspace package manager (`npm i -g pnpm`) |
| Git | any | clone the repo |
| Chromium | installed by Playwright | only for the end-to-end tests |

No database server, Docker or native build tools are required.

## 2. Install and run locally

```bash
git clone <your fork> GetMe
cd GetMe
pnpm install
pnpm dev
```

`pnpm dev` starts two processes:

| Process | URL | Notes |
| --- | --- | --- |
| API | http://localhost:4000 | SQLite file in `apps/api/data/getme.db`, uploads in `apps/api/data/uploads` |
| Web | http://localhost:5173 | Vite dev server; proxies `/api`, `/uploads` and `/ws` to the API |

Open http://localhost:5173 and pick an app. All demo accounts sign in with code `1234`:

| App | URL | Phone | Account |
| --- | --- | --- | --- |
| Customer | /customer | 98450 12345 | Priya Menon, HSR Layout, member of Sunrise Residency |
| Partner | /partner | 99860 44112 | Ravi Kumar, verified pro partner |
| Community runner | /partner | 99860 44116 | Lakshmi Devi, has an open trip |
| New partner | /partner | 99860 44117 | Suresh N, awaiting verification |
| Shop | /shop | 98860 71234 | Nandini's Fresh Mart |
| Ops | /admin | 90000 00000 | GetMe Ops |

Any other 10-digit number creates a new account of that role on first sign-in (except admin, see below).

**Demo partners.** Fathima, Arjun and Manoj are simulated (`SIM_BOTS=1`): they accept broadcasts after 40 s, send offers, answer direct requests and drive jobs to completion with moving locations, so the product is demoable with one real partner.

### Running on a phone

1. Find your laptop's LAN address (`ipconfig` / `ifconfig`), for example 192.168.1.20.
2. Open http://192.168.1.20:5173/customer on the phone.
3. GPS, camera and push need a secure context. On a LAN that means either `chrome://flags/#unsafely-treat-insecure-origin-as-secure` with the origin, or an HTTPS tunnel (`npx localtunnel --port 5173`, ngrok, Cloudflare Tunnel). On a public HTTPS domain everything works without flags.
4. "Add to Home screen" installs the PWA; the service worker caches the shell so it opens offline.

### Resetting data

```bash
cd apps/api
pnpm ops seed:reset     # deletes the database; it is re-seeded on the next start
```

## 3. Configuration

Copy `.env.example` to `apps/api/.env` (or export the variables). Everything has a working default for development.

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | 4000 | API port |
| `DATA_DIR` | `./data` | SQLite database and uploaded photos |
| `DEV_OTP` | `1234` | Fixed sign-in code. Set it empty to generate random codes and send them by SMS |
| `SIM_BOTS` | `1` | Simulated demo partners. Set `0` in production |
| `SIM_SPEED` | `1` | Lower is faster bots |
| `SMS_PROVIDER` | `console` | `console` logs messages; `msg91` needs `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID`; `twilio` needs `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM` |
| `CRYPTO_PROVIDER` | `sim` | `sim` invoices are paid with the "Simulate payment" button; `nowpayments` needs `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET` and a public `PUBLIC_API_URL` for the webhook `/api/crypto/webhook` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | generated | Web Push keys. Generated once and stored in the database if unset; set them explicitly so subscriptions survive a database reset |
| `GEOCODER` | `nominatim` | OpenStreetMap geocoding with a persistent cache and a local gazetteer fallback. Set `GEOCODER=off` to use only the gazetteer |
| `PUBLIC_URL` | empty | Web origin used in SMS tracking links |
| `LOG` | `1` | `0` silences the API log |
| `VITE_API_URL` (web) | empty | Set to the API origin when the web app is not served behind the same host |

## 4. Tests

```bash
pnpm test        # core unit tests + API integration tests (boots a throwaway API)
pnpm typecheck
pnpm e2e         # Playwright: three specs across customer, partner, shop and runner on ports 4100/5174
```

`pnpm e2e` writes screenshots to `e2e/screenshots/`. On a machine without the preinstalled browser run `pnpm exec playwright install chromium` once.

## 5. Production deployment

GetMe is one Node process plus static files. A small VPS (1 vCPU, 1 GB) serves a town.

```bash
pnpm install --frozen-lockfile
pnpm build                                   # builds apps/web/dist
cd apps/api && pnpm start                    # API on $PORT, needs DATA_DIR on a persistent disk
```

Reverse proxy (Caddy example, gives you HTTPS automatically):

```
getme.example.in {
  handle /api/* { reverse_proxy localhost:4000 }
  handle /uploads/* { reverse_proxy localhost:4000 }
  handle /ws { reverse_proxy localhost:4000 }
  handle { root * /srv/getme/apps/web/dist  try_files {path} /index.html  file_server }
}
```

Checklist before going live:

1. `DEV_OTP=` (empty) and an SMS provider, otherwise anyone can sign in with 1234.
2. `SIM_BOTS=0`.
3. Persistent `VAPID_*` keys; `PUBLIC_URL=https://getme.example.in`.
4. `CRYPTO_PROVIDER=nowpayments` with keys, or leave `sim` and hide the method (remove `crypto` from `PAYS` in `packages/core/src/constants.ts`).
5. Back up `DATA_DIR` (the SQLite file is safe to copy while the API runs thanks to WAL mode; use `sqlite3 getme.db ".backup backup.db"` for a consistent snapshot).
6. Create your own admin and remove the seeded one:
   ```bash
   cd apps/api
   pnpm ops admin:create --phone 9xxxxxxxxx --name "Your name"
   ```
7. Put uploads on object storage if you expect many photos (swap the write in `POST /api/uploads`).
8. Google sign-in: verify the ID token in `POST /api/auth/google` (currently a stub).
9. UPI and card: add a gateway behind the `charge` ledger entries (auth at checkout, capture on delivery) and bank payouts behind `payout`.

Process management: `pm2 start "pnpm start" --name getme-api` or a systemd unit with `Restart=always` and `Environment=DATA_DIR=/var/lib/getme`.

## 6. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| "Location blocked" on the partner home | The page is not HTTPS, or the browser denied geolocation. Use HTTPS or allow the site in browser settings. The app falls back to simulated movement during a job |
| Push toggle says "Blocked in the browser" | Notification permission denied, or not HTTPS. Reset site permissions |
| No partners see a broadcast | They are offline, unverified, busy, outside the region's radius, or their location is older than 2 minutes. Check the Ops Live tab and the partner's Profile |
| Shop not visible to customers | Shop is not approved (Ops → Shops) or marked Closed |
| Geocoding returns "x km from HSR Layout Sector 2" | OpenStreetMap rate-limited the server; the gazetteer fallback is in use. It recovers automatically after a few minutes |
| `node:sqlite` experimental warning | Harmless on Node 22; silent on Node 23+ |
| Port 5173 or 4000 already in use | `PORT=4001 pnpm dev:api` and `API_PORT=4001 pnpm dev:web` |

## 7. Theme

All colours, type sizes, radii and shadows are CSS variables in `apps/web/src/styles/theme/tokens.css` (light and dark blocks) and the fonts in `theme/fonts.css`. To rebrand, edit those two files; no component changes are needed. The primary action colour is `--brand-primary-rest`, the header colour `--gm-chrome`, the accent `--gm-accent`.
