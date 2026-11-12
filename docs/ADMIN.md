# GetMe Ops: admin panel guide

The admin app lives at `/admin`. It is phone-first like the other apps, so ops can work from a mobile while in the field. Sign in with an admin phone number and the OTP.

Admin accounts are never created by self sign-up. The seeded one is 90000 00000 (code 1234 in development). Create real ones from the API folder:

```bash
cd apps/api
pnpm ops admin:create --phone 9xxxxxxxxx --name "Asha"
pnpm ops admin:list
```

## Header

- **Attention count** under the title: pending verifications + pending shops + open refunds.
- **Bell**: notifications addressed to ops (new partner documents, refund requests, trip cancellations).
- **Avatar**: appearance (light, dark, system) and Log out.

## Live tab

What is happening right now.

- **Tiles**: orders today, partners online / total, open refunds, partners to verify.
- **Live orders**: every order that is scheduled, requesting, counter, to shop, shopping, on the way or arrived. Each row shows id, kind (list, catalogue, package), status, customer, courier, region and age. Tap for the detail sheet:
  - items and the bill, timeline with timestamps, courier, address summary (flat, landmark, handoff), trip when the order rides on one;
  - **Cancel order** with a reason, allowed until the partner starts shopping. The customer, partner and shop are notified; catalogue stock is restored; the partner is freed.
- **Open trips**: announced runs with partner, departure, seats taken and fee. **Cancel trip** detaches waiting orders and sends them to partners nearby by broadcast; customers are told.

The tab refreshes itself on realtime events; pull the tab again to force a reload.

### When to step in

| Situation | Action |
| --- | --- |
| Request older than the region's expiry with partners online | Check Partners online in the tiles; if the partners are outside the radius, widen the ladder in Regions or ask a runner to announce a trip |
| Customer reports the partner is unreachable | Call the partner (number in Verify → partner card), then Cancel order so it re-dispatches |
| Partner stuck in "shopping" for long | Message from the customer app shows the chat; cancellation is no longer possible, so resolve by phone and, if needed, approve a refund after delivery |

## Verify tab

Partner identity before they can go online.

- **Pending** first: name, tier chip (Community runner or Delivery partner), masked phone, vehicle and plate, document thumbnails (tap to open full size), a note field, **Approve** / **Reject**.
- Required documents: runner = ID + selfie; delivery partner = ID + driving licence + vehicle RC + selfie.
- What to check: the selfie matches the ID photo, the licence is valid for the vehicle class, the RC plate matches the plate on the profile, the name matches across documents. For runners, a community join is a good sign but not required.
- **Reject** with a note: the partner sees the note on their Profile and can re-upload. **Revoke** on a verified partner takes them offline immediately.
- Search box filters by name, phone or area. Groups below: Verified, Rejected, No documents.

A verified partner receives a push/SMS "You are verified" and can go online. A runner's purchase limit is ₹1,000 per list order; a delivery partner's is ₹2,000. Raise a limit by editing `floatLimit` through the CLI or the database when a partner proves reliable.

## Shops tab

- **Awaiting approval**: new shops with name, category, address, item count. **Approve** makes the shop visible to customers.
- **Live shops**: approved toggle (turning it off hides the shop from customers but keeps its orders), Open/Closed state, item count, GST number.
- Check before approving: the shop location is pinned on its real door (Shop → Profile → Shop location), hours are set, at least a few items exist, and the GST number format is valid if present.

## Refunds tab

Customers report an issue after delivery (missing item, wrong item, damaged, partner behaviour). The app proposes 50% of the item cost plus the delivery fee; ops decide.

- **Open requests**: customer, issue chip, items, order total, receipt link, editable refund amount, **Approve** / **Reject**.
- Approving credits the amount to the customer's GetMe wallet immediately and notifies them. Rejecting notifies them with a pointer to support.
- **History** lists reviewed requests.

Guidance: approve item issues when the receipt or proof photo supports the claim; for partner behaviour, approve the delivery fee and review the partner (ratings are on the partner card). Repeated claims from one account are visible in the history list.

## Regions tab

Dispatch and pricing defaults per kind of place. Each order snapshots the profile of its drop point, so changes apply to new orders only.

| Field | Meaning |
| --- | --- |
| Search radius ladder | km after each widening step, for example 2 → 4 → 6 in the city, 10 → 20 → 30 in a village |
| Widen every (min) | how long to wait before widening |
| Expire after (min) | when an unanswered request is closed and the customer told |
| Base ₹, per km ₹, min, max | delivery fee = (base + per km × distance) × surcharge, rounded up to ₹5, clamped |
| Surcharge | multiplier, for example 1.25 on ghat roads |
| Default payment and dispatch | what checkout preselects: city = UPI + broadcast; hill and village = cash + join a trip |
| Coverage km | the profile applies within this distance of its centre; 0 means it is only the fallback |

**Save** writes only the changed fields. The same can be done from the CLI:

```bash
pnpm ops region:set --id hill --surcharge 1.4 --expireMin 240 --radius 8,15,25
```

Below the profiles:

- **Recent SMS**: fallback messages sent when a user had no push device or open app (phone masked). Use it to confirm the SMS provider is working.
- **Communities**: name, kind, member count and join code. Give the code to a society office or a village committee; residents join from their Profile.

## Everyday routine

1. Morning: Verify tab, approve overnight partner sign-ups; Shops tab, approve new shops.
2. Through the day: Live tab open; act on requests that are ageing and on trips that did not start.
3. Evening: Refunds tab; settle the day's requests. Check Recent SMS once to confirm fallbacks are going out.
4. Weekly: review Regions against real pick-up times (average prep and delivery times are on the shop Analytics and partner Earnings screens) and adjust radius or expiry.

## Useful commands

```bash
cd apps/api
pnpm ops stats                                  # users, partners, shops, orders by status
pnpm ops partner:verify --phone 9986044117      # verify from the terminal
pnpm ops partner:verify --id suresh --reject --note "Licence unreadable"
pnpm ops shop:approve --id nandini --approved false
pnpm ops seed:reset                             # development only
```
