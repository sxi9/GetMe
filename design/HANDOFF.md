# Handoff: GetMe — local delivery app (customer · delivery partner · shop owner)

## Overview
GetMe is a hyperlocal delivery product for Bengaluru. A customer writes a shopping list (or orders from a nearby shop's catalogue, or sends a package), chooses how a delivery partner is found (broadcast / offers / pick one), and tracks the partner live until a code-verified handover. Delivery partners accept jobs, can ask for extra pay, buy the items (adding the receipt and cost to the bill), and deliver. Shop owners manage their catalogue, incoming orders and analytics. Three apps, one backend.

This bundle is the complete product reference for building it: screens, flows, state machine, data model, copy and design tokens.

## About the design files
Everything in this folder is a **design reference built in HTML** (`GetMe.dc.html` + helpers). It is a clickable prototype showing intended look and behaviour — **not production code to ship**. The job is to recreate these screens and flows in the target stack. Recommended, if nothing exists yet: React Native (Expo) for the three mobile apps with a shared package for the order state machine, plus a backend with realtime (WebSocket / Firebase / Supabase Realtime) for order events, chat and partner locations. A single codebase with three role entry points is fine; the prototype itself runs all three roles from one state store.

Open `GetMe.dc.html` in a browser (serve the folder over HTTP so `getme-data.js` can load as a module). All three phones share one simulated order; "Reset prototype" clears it. Partners other than Ravi are bots that respond on timers.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and copy are final and come from the Vulpes design system tokens (`_ds/.../tokens/*.css`). Recreate the UI faithfully using the codebase's component library; map tokens 1:1. Things that are intentionally placeholders: the map (schematic SVG — use Google Maps / Mapbox), photo drop zones (use camera/gallery), "voice" list entry (use speech-to-text), bot partners (real dispatch).

## Roles, personas and seed data
- Customer — Priya Menon, HSR Layout Sector 2, +91 98450 12345, UPI priya@okaxis, card •••• 4421, wallet ₹350.
- Delivery partner — Ravi Kumar, bike KA 05 MJ 4521, 4.8 rating, 1,240 trips. Pool: Fathima B (cycle, 4.9), Arjun S (scooter, 4.6), Manoj P (bike, 4.5).
- Shop owner — Nandini's Fresh Mart (grocery & vegetables, 0.6 km, delivery fee ₹35). Other shops: Sri Balaji Vegetables (₹40), Apollo Pharmacy (₹45), Krishna Bakery (₹50, closed).
- Full seed data (items, prices, stock, history, partner trips) is in `getme-data.js`.

## Screens / views

### Customer app (bottom tabs: Home · Orders · Profile)
1. **Sign in** — navy hero (app icon + "GetMe" + "Anything from nearby, brought to your door."), mobile number → one-time code; "or" divider; Continue with Google; link to switch to email + password; terms line. Validation: 10-digit number; 4-digit code.
2. **Home** — navy header "DELIVER TO / Home · HSR Layout, Sector 2" + bell + avatar. Search field (filters shops by name, category or item). Live-order card when an order exists (status + "Live" chip, tap → tracking). "Need something from nearby?" card with inline item input + "Start list". "Send a package" row. "Shops nearby" 2-column grid of shop cards (icon tile, name, category, distance · ETA, Open/Closed status chip, item count). Info banner "GETME20 — ₹20 off delivery on lists this week".
3. **Make a list** — item input + Add + mic (voice entry); item rows with −/qty/+ stepper and delete; Quick add template chips (Weekly veggies, Breakfast basics, Medicines); note for the partner; "Allow substitutes" toggle; photo-of-handwritten-list drop zone; "Buy from" chips (Any nearby shop / specific shops); When: Now / Schedule (slots); "Repeat every week" toggle; budget cap; address card; sticky CTA "Continue · N items" (disabled when empty).
4. **Send a package** — pickup card, drop address, receiver name + phone, type chips (Documents, Keys, Food box, Clothes, Fragile), size radio cards (Small ₹49 / Medium ₹69 / Large ₹99 with capacity captions), package photo drop zone, "Protect this package · ₹9" toggle, instructions; CTA "Continue · ₹price".
5. **Shop catalogue** — header with shop name, category · distance · ETA, Open/Closed chip; item rows (name, unit · price, low-stock note) with Add button → −/qty/+ stepper; "Out of stock" disabled chip; sticky cart bar "N items · ₹total" + Checkout.
6. **Checkout** — summary card (shop or "Any nearby shop · partner picks the closest", schedule label, item lines with "partner buys" for list items); **"How should we find a partner?"** radio cards: Broadcast to partners nearby (first to accept takes it) / Get offers (partners send price + ETA, you pick) / Choose a partner; Payment radio list (Cash on delivery / UPI / Card / GetMe wallet with live balance); Anonymous delivery toggle; promo input (GETME20 = −₹20); bill (Items, Delivery fee, Service fee ₹5, Package protection, Promo, Total — "₹fees + items" when item cost is unknown); CTA label follows the mode.
7. **Choose a partner** — map with the partner pool, partner rows (avatar, name, rating, vehicle · distance · trips, reach time, favourite heart, Request button; "Declined" chip if they declined).
8. **Finding a partner** — radar pulse card with mode-specific title/subtitle, elapsed timer, "Seen by n of 4"; counter-offer card (amount, reason, new fee, Approve / Decline); offers list (avatar, rating, price · reach time, Accept) in offers mode; order summary; Cancel (bottom sheet confirm).
9. **Tracking** — map (route, shop/pickup pin, home/receiver pin, moving partner dot) with ETA pill; partner card (avatar, name, vehicle · rating · trips, chat with unread badge, call); Share trip + Safety buttons; handover code card (shown once items are bought); receiver card for packages; timeline (Heading to the shop → Buying your items → On the way → Arrived → Delivered, with times); bill card with receipt link.
10. **Chat** — bubbles (text / photo / live-location cards), quick-reply chips, camera + location + text input. Calls are masked (overlay "Calling through GetMe · number stays private").
11. **Delivered** — check icon, "Delivered by X at time", payment line; tip chips (No tip / ₹10 / ₹20 / ₹50); 5-star rating + tags (On time, Polite, Careful with items, Good updates); "Something wrong?" issue chips + "Report and request a refund"; total paid; Submit rating.
12. **Orders** — live order card, "Repeating" subscriptions (Stop), past orders (shop/list, date · items · partner, total, status chip).
13. **Profile** — wallet card (balance + Add money sheet with ₹200/₹500/₹1000), referral card (PRIYA50, Share), settings list (addresses, payment methods, promo codes, push notifications toggle, language chips English / ಕನ್ನಡ / हिन्दी), help, terms, Log out.

### Delivery partner app (bottom tabs: Home · Earnings · Profile)
1. **Sign in** — same pattern ("GetMe Partner", mobile + code, Google).
2. **Home** — header (avatar, name, rating · vehicle · area); online/offline toggle card; Today ₹ / Trips / Tips tiles; "Busy nearby" surge card; active-job card; request card (title by mode, mode chip, fee large, pay note, pickup / drop / items / schedule + budget rows; actions: Accept · Ask for extra · Decline, or Send an offer · Skip; pending states "Asked ₹X extra · waiting" / "Offer sent · waiting"; caution banner when the customer declined the extra); map with own position; empty state "No requests right now"; offline banner.
3. **Ask for extra** — amount chips (+₹20/30/50/80), reason chips (Heavy items, Far pickup, Rain, Peak hours), preview banner, "Send to customer".
4. **Send an offer** — fee input, minutes input, preview, "Send offer".
5. **Active job** — header (job id, phase · earn, SOS button); 4-segment stepper (To shop · Shopping · To customer · Handover); map with ETA pill; phase cards: To shop (Navigate / Reached shop) → Shopping (checklist, budget note, "What you paid" input, over-budget banner, Attach receipt, "Items bought · start delivery") or package pickup (photo, "Picked up · start delivery") → To customer (receiver/customer card, Navigate / Arrived) → Handover (4-digit code input, "Collected ₹X in cash" checkbox for COD, Complete delivery) → Delivered (earned amount, rate the customer, back home); customer card with chat/call (name hidden when anonymous).
6. **Earnings** — Today card (₹, trips · tips · hours online), week bar chart, Daily bonus progress (12 trips → ₹100), recent trips list.
7. **Profile** — vehicle, documents (Verified chip), service area, payouts, Log out.

### Shop owner app (top tabs: Orders · Items · Analytics · Profile)
1. **Sign in** — "GetMe Shops".
2. **Header** — shop name, address · hours, Open/Closed toggle pill.
3. **Orders** — low-stock caution banner; order cards (id · customer, time, status chip New / Preparing / Ready for pickup / With partner / Completed / Cancelled, partner line, item lines, total, action button Accept order → Mark ready → Handed to partner).
4. **Items** — count line + "Add item"; item rows (name, unit · price · category, stock / Low stock / Out of stock, Restock button when ≤3, availability toggle). Add-item bottom sheet: name, price, unit, stock, category chips, Save (new items appear instantly in the customer catalogue).
5. **Analytics** — Orders / Revenue / Avg prep tiles, weekly revenue bars, top items bars, order-source split (62% lists bought by partners / 38% catalogue).
6. **Profile** — owner, address, hours, settlements + GST, Log out.

## Interactions & behaviour
- Dispatch modes: **broadcast** (request visible to all nearby partners; first Accept wins; fallback: a bot accepts after 40 s), **offers** (bots send ₹45/14 min, ₹60/9 min, ₹38/18 min at 2.5 / 5.5 / 8.5 s; customer accepts one; the accepted price becomes the delivery fee), **choose** (request goes only to the chosen partner; they Accept / counter / Decline; a decline returns the customer to the list with that partner marked Declined).
- Counter-offer: partner proposes +₹ and a reason → customer Approve (fee.extra set, partner assigned) or Decline (request stays open; partner can still accept at base fee).
- Item cost: for list orders the partner enters what they paid + attaches a receipt; it is added to the bill and the customer pays the final total on delivery (COD) or is charged automatically (UPI / card / wallet; wallet balance is deducted).
- Handover: 4-digit code shown on the customer phone (and sent to the receiver for packages); the partner must enter it; COD also requires the "cash collected" checkbox.
- Live tracking: partner position interpolates along the route; ETA = remaining fraction × leg time. Legs: to shop 8 s, to customer 20 s (prototype timings).
- Chat: text, photo and live-location messages; unread badges; quick replies; bot partners auto-reply. Calls and chat are relayed so numbers stay private; "Anonymous delivery" also hides the customer's name from the partner.
- Safety: Share trip (link), Safety sheet (GetMe safety line, share live trip with a contact, call 112) on both customer and partner.
- Cancel allowed until the partner starts shopping; cancelled orders go to history and notify the partner/shop.
- Notifications: in-app toast banner (4 s) on every cross-role event; mirror these as push notifications.
- Motion: screen enter 220 ms ease fade/slide-up; toast 250 ms slide-down; radar pulse 1.8 s ease-out loop while finding; partner dot 160 ms linear transform; respect `prefers-reduced-motion`.
- Validation: 10-digit phone, 4-digit code, email contains "@", password ≥ 4, item cost > 0, package needs drop address + receiver name, shop item needs name + price.

## State management
Single shared order (`order`) plus per-role UI state. Order status machine:
`requesting → counter → requesting` (decline) · `requesting/counter → to_shop` (assign) `→ shopping → to_customer → arrived → delivered` (→ history as Delivered) · any pre-shopping state `→ cancelled`.
Order fields: id, kind (list | shop | parcel), shopId/shopName/shopDist, items[{name, qty, unit, price|null}], itemsTotal, address, mode, pay, promo, when/slot, budget, anon, subs, note, receiver{name, phone}, pkType/pkSize, status, courierId, chosen, offers[{partnerId, price, eta}], counter{partnerId, amount, reason}, declinedIds, fee{delivery, service, extra, extraReason, insure}, itemCost, receipt, otp, leg/progress, tip, times{status→time}.
Other stores: shops (with items + stock + availability), partners, messages[{from, text, type, t}], shopOrders, earnings, shopStats, wallet, subscriptions, history. Realtime events needed: order.created, offer.added, counter.proposed/answered, order.assigned, status.changed, location.updated, message.sent, order.cancelled, order.completed.

## Design tokens (Vulpes, light theme)
- Chrome navy `#002539` (`--brand-fox-blue`); accent cyber-blue `#24E4EB`; primary action `#0072CE` (hover `#0060BC`); warn/destructive `#A51E23`; confirm green `#0F9135`; severity low/star `#FFB800`; medium `#F27700`; info tint `#E2F1FC`.
- Alternate themes in the prototype (Tweaks → Look): forest `#073C24 / #55F2AC / #29845A`, crimson `#330608 / #E86C6D / #D51B26`, violet `#1D0045 / #C7BCFF / #8051FF`; dark appearance via Vulpes dark tokens.
- Neutrals: page `--surface-page`, surface `#FFFFFF`, border `--surface-border` (≈ rgba(0,0,0,.12)), text `--text` / secondary `--text-secondary` / disabled `--text-disabled`.
- Type: Open Sans (UI), IBM Plex Mono (numbers, codes, prices), Material Symbols Rounded (icons, no fill except active nav). Sizes used: 32/40 brand, 23/32 page title, 17/22 screen title, 16/22 section, 15/22 option label, 14/20 body, 13/18 secondary, 12/16 caption, 11/14 overline (uppercase, .4–.6 px tracking). Weights 400 / 600.
- Spacing: 4-px base; 16 px screen padding and card padding; 12 px row padding; 8 px chip/button gaps. Phone header padding 58 px top (status bar) 16 px sides 14 px bottom.
- Radius: 8 px cards/sheets (16 px top corners on bottom sheets), 4 px inputs/buttons/icon tiles, full for chips/pills.
- Shadows: card `0 1px 2px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.10)`; menu/toast `0 4px 12px rgba(0,0,0,.12), 0 2px 4px rgba(0,0,0,.08)`.
- Controls: buttons 40 px (48 px primary CTAs, 32 px small), inputs 40 px, icon buttons 32 px, toggles 36×20, chips 26 px, tab bar 56 px + home-indicator inset, hit targets ≥ 44 px.
- Full token files: `_ds/vulpes-design-system-zerofox-6de9c7df-567b-4855-8e6c-bffcb45499b4/tokens/`.

## Assets
- Icons: Material Symbols Rounded (Google Fonts) — names used: near_me, location_on, notifications, search, checklist, storefront, inventory_2, shopping_basket, mic, graphic_eq, event_repeat, verified_user, home, my_location, person_pin_circle, local_shipping, chat, call, call_end, share, emergency, support_agent, share_location, receipt_long, check_circle, radio_button_checked/unchecked, star, favorite, swap_horiz, sticky_note_2, playlist_add, visibility_off, currency_rupee, sell, schedule, timer, bolt, two_wheeler, notifications_active, navigation, where_to_vote, task_alt, photo_camera, image, payments, military_tech, local_fire_department, radar, account_balance_wallet, card_giftcard, translate, help, description, logout, add, remove, delete, close, expand_more, chevron_right, arrow_back, arrow_forward, add_box, map, account_balance, person, password, lock, mail, account_circle.
- Fonts: Open Sans, IBM Plex Mono (Google Fonts).
- No photos are bundled; image areas are drop zones. Map is a schematic SVG (`GetMeMap.dc.html`).

## Files
- `GetMe.dc.html` — the prototype: template (three phones, all screens) + logic class (state machine, simulation, handlers).
- `getme-data.js` — seed data, constants, copy for options, helpers.
- `GetMeMap.dc.html` — schematic map component (route, pins, moving partner dot).
- `ios-frame.jsx` — iPhone frame used for presentation only.
- `image-slot.js` — drop-zone placeholder used for photos.
- `support.js` — prototype runtime (not for production).
- `_ds/` — Vulpes design-system tokens and component bundle the prototype renders with.
