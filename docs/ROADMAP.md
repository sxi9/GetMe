# What modern delivery apps have that GetMe does not yet

Ranked by value for apartments, hill stations and villages first, then city parity.

## Worth building next

1. **Society group orders.** One bulk order per tower or village (weekly vegetables, gas, water) split across flats with per-flat payment. The trip engine already carries many orders on one route; this adds a shared cart and a split bill.
2. **WhatsApp ordering.** A WhatsApp number that accepts a list in text or voice and creates the order; status updates and the handover code go back on WhatsApp. Reaches people who will not install an app.
3. **Smart list parsing.** "2 kg onions, 1 bread, paracetamol" into items with quantities and units, in Kannada and Hindi too, plus likely substitutes and price estimates from nearby catalogues.
4. **Real road routing.** OSRM or a routing API for ETAs and the route line instead of straight lines; geofenced "arrived" detection so partners do not tap it by hand.
5. **Partner incentives.** Daily and weekly bonus ladders, peak-hour multipliers shown as a heatmap, leaderboards for runners in a community.
6. **Shop inventory sync.** CSV import, barcode scan on the shop phone, low-stock alerts by WhatsApp, and simple promotions (banner, discount per item, society-only offers).
7. **Ratings and reviews for shops** with photos, and partner reviews visible to customers in choose mode.
8. **Support chat and tickets** in all apps with an ops inbox, instead of only refund requests.
9. **Loyalty and referrals with rules**: points per order, a monthly pass with free deliveries, referral rewards for both sides.
10. **Native apps** (Capacitor wrapper first): background location with the screen off, live activity on the lock screen showing the partner's ETA, biometric sign-in, deep links from SMS and WhatsApp.

## City parity

- Scheduled delivery windows with capacity, not just three fixed slots.
- Search across items in all shops with autocomplete and recent searches; personalised home with reorder.
- UPI autopay and pay-later; split payment (wallet plus UPI); wallet cashback.
- Surge transparency ("fees are higher because of rain") and fare breakdown before confirming.
- Order gifting with a message; delivery to a contact picked from the phone book.
- Invoice and GST download per order.
- Fraud signals: duplicate accounts, abnormal item costs on receipts, repeat refund claims.
- Analytics: cohorts, retention, partner utilisation, region-level unit economics; A/B flags.
- Accessibility pass: screen reader labels on every control, large-text layouts, high-contrast mode on top of dark mode.

## Already in GetMe

GPS deliver-to with pin and landmark, apartment fields and gate or leave-at-door proof, region profiles, trips and community runners, communities with a notice board, photos, push with SMS fallback, offline queue, Kannada and Hindi, crypto payments, live vehicle marker with traffic-aware ETA, dark mode, admin panel with verification, approvals, refunds and region tuning.
