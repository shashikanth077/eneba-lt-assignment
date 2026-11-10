# Cart, checkout, payment and orders (as built)

## The flow
```
signed-in buyer
  POST /api/cart {offerId, qty}  ...  (server-side cart, prices read live, stock checked)
  POST /api/checkout ─────────────────────────────────────────────────────────────────────────────┐
     1. housekeeping: release expired reservations; replace the user's earlier pending orders      │ one DB transaction
     2. read the cart (live prices), lock keys per line: SELECT ... FOR UPDATE SKIP LOCKED          │  (all or nothing)
     3. any line short -> ROLLBACK, 409 out_of_stock listing every problem line, nothing reserved   │
     4. insert order (pending) + items (snapshot of name/price) + keys -> reserved until now+15 min ┘
     5. COMMIT, then (no locks held over the network) create the Stripe PaymentIntent for the SERVER's total
     6. provider error -> order failed, keys released, 502;  success -> 201 { orderId, clientSecret, totalCents, currency, reservedUntil }
  browser confirms the card with Stripe.js using clientSecret   (the card never touches this server)
  Stripe -> POST /api/webhooks/stripe  (signed)  payment_intent.succeeded
     verify signature on the RAW body + timestamp -> record event id -> lock order -> check amount/currency
     -> keys reserved -> sold, order -> paid, bought lines leave the cart            (one DB transaction)
  GET /api/orders/{id}  -> paid + owner: decrypted keys; anything else: no keys
```
The buyer never sends a price or an amount: `POST /api/checkout` has no body, the total is `SUM(live price x qty)` computed inside the
transaction, and that same number goes to Stripe and is the only amount a webhook is accepted for.

## Confirming a payment without waiting for the webhook (P33)
The webhook stays the normal path, but a webhook can be late, sent to the wrong address or signed with another endpoint's secret, which used to leave a buyer who had paid on "Confirming your payment" forever (and the confirmation e-mail, which is sent when the order becomes paid, never went out). Now `GET /api/orders/{id}` on a **pending** order with a payment intent makes the server call Stripe (`paymentIntents->retrieve`, secret key, server to server). If Stripe says `succeeded`, the order is fulfilled by the same routine as the webhook (`PaymentEventService`, synthetic event id `sync_<intent>`): amount and currency are checked, an already paid order is a no-op, so the webhook arriving later changes nothing. The browser's word is never used; a Stripe outage is logged and the next poll retries. Tests: `backend/tests/PaymentConfirmationTest.php`.

## Endpoints (all but the webhook need the session cookie; mutating ones also need `X-Requested-With: fetch`)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/cart` | `{ lines: [{ offerId, productSlug, productName, sellerName, unitCents, qty, lineCents, available }], totalCents, currency, issues: [{ offerId, code: inactive\|out_of_stock\|insufficient_stock, message }] }` |
| POST | `/api/cart` | `{ offerId, qty? }` adds (existing line: quantity grows). 201 + the cart. 404 unknown/inactive offer, 409 `insufficient_stock` (`details: {offerId, available}`), 422 qty outside 1-5 or more than 20 lines |
| PATCH | `/api/cart/{offerId}` | `{ qty }` sets the quantity of an existing line (404 if not in the cart) |
| DELETE | `/api/cart/{offerId}` / `/api/cart` | remove one line / empty the cart |
| POST | `/api/checkout` | no body. 201 `{ orderId, clientSecret, totalCents, currency, reservedUntil }`. 409 `out_of_stock` (`details.items: [{offerId, code, requested, available}]`), 422 `cart_empty` / `amount_too_small` (< 0.50), 502 `payment_provider_error`, 503 `payments_unavailable` (no Stripe key) |
| POST | `/api/webhooks/stripe` | Stripe only. 200 `{received:true}` once handled (also for repeats and events we ignore), 400 `invalid_signature`, 503 `webhook_not_configured`; any other failure answers 5xx so Stripe retries |
| GET | `/api/orders` | `{ items: [{ id, status, totalCents, createdAt, itemCount }], page, pageSize, total }`, newest first, never contains keys |
| GET | `/api/orders/{id}` | `{ order: { id, status, totalCents, currency, createdAt, reservedUntil? (pending), paidAt? (paid), items: [{ productSlug, productName, sellerName, unitPriceCents, qty, keys? }] } }`. `keys` only when `status = paid` and the order is the caller's. Someone else's or an unknown order is the same 404 |

## States
Order: `pending` -> `paid` | `failed` | `expired` | `canceled`; a payment that arrives for a non-pending order and cannot be fulfilled goes
`refund_needed` -> `refunded`. Key: `available` -> `reserved` (order_id, reserved_until) -> `sold`, or back to `available` on release.

## Concurrency: how two buyers competing for the last key are kept apart
- `lockAvailable()` runs `SELECT id FROM game_keys WHERE offer_id = ? AND status = 'available' ORDER BY id LIMIT ? FOR UPDATE SKIP LOCKED`.
  A row locked by another open transaction is **skipped, not waited for**: nobody queues (no 50 s lock-wait timeout), nobody deadlocks, and the same key can never
  be handed to two buyers. A buyer who finds fewer keys than he needs gets `409 out_of_stock` for the whole cart (nothing reserved).
- Cart lines are locked in ascending `offer_id` order. With SKIP LOCKED nobody waits anyway, but a fixed order is the belt to those braces.
- **Honest trade-off:** SKIP LOCKED favours liveness over perfect packing. While buyer A's transaction is still open (milliseconds), buyer B does not see A's keys;
  if A then rolls back (e.g. because another of A's lines was short) B was told "out of stock" although a key came free a moment later. B simply retries.
  Single-line races are exact (N buyers, M keys: exactly M win); with overlapping multi-line carts the number of winners can be lower than the stock allows,
  never higher (`ConcurrencyTest` asserts "at least one, at most the stock, no deadlock, every order complete").
- Reservations expire lazily: every checkout (and every order read) first releases pending orders past `reserved_until`, cancels their PaymentIntent, and marks them
  `expired`. There is no cron on the free tier. An expired reservation whose keys nobody took is still honoured if the payment arrives (the keys are still the order's).
- A buyer who starts checkout again replaces his earlier pending order (keys released, intent canceled), so one user cannot hold stock by repeating the call.

## Failure matrix
| Situation | What happens |
|---|---|
| A line sold out / withdrawn between cart and checkout | 409 `out_of_stock` listing every bad line, nothing reserved, cart untouched |
| Price changed after "add to cart" | checkout charges the current price; the order stores the snapshot |
| Stripe unreachable / key missing at checkout | order `failed`, keys released, 502 / 503 |
| Buyer never pays | after 15 min the next checkout/read expires the order, releases the keys, cancels the intent |
| `payment_intent.payment_failed` | order `failed`, keys released, intent canceled (cannot succeed later); cart kept for another try |
| `payment_intent.canceled` | order `canceled`, keys released |
| Same webhook delivered again / in parallel | event id is the primary key of `stripe_events` (recorded in the same transaction as its effects): applied once |
| Another event id for an already paid payment | order row is locked and "paid" is a no-op: keys are never sold twice |
| Crash halfway through processing | everything including the event record rolls back, the 5xx makes Stripe retry, the retry is processed for real |
| Paid amount/currency differs from the order | nothing delivered, keys released, automatic refund (`refunded`), or `refund_needed` if the refund call fails |
| Payment succeeds after the order was failed/expired/canceled | keys are taken again if free (then `paid`); if the stock is gone the whole payment is refunded (all or nothing) |
| Forged / replayed / tampered webhook | rejected with 400 before any query: HMAC-SHA256 over `t.<raw body>` with the endpoint secret, 5 min tolerance |
| Webhook for a payment we did not create (`stripe trigger ...`) | signature verified, 200, logged as "belongs to no order", nothing changes |

## Paying with Stripe test mode (what I could and could not verify)
**Not run in the build sandbox:** it has no Stripe keys and cannot reach api.stripe.com. What is verified: the real `StripePaymentGateway` through the real SDK with only the
HTTP transport replaced (`StripePaymentGatewayTest`: URL, auth header, amount, currency, metadata, idempotency keys, error mapping), and the webhook verifier/handler with
correctly signed payloads built the way Stripe signs them. **What is not verified: a call that Stripe itself accepted. Please run the steps below once.**

1. Put your test secret key in `.env` (root, for Docker) or `backend/.env`: `STRIPE_SECRET_KEY=sk_test_...`
2. Forward events to the API and copy the signing secret it prints:
   ```bash
   stripe listen --forward-to localhost:8080/api/webhooks/stripe     # prints "Ready! Your webhook signing secret is whsec_..."
   ```
   Put it in `STRIPE_WEBHOOK_SECRET=whsec_...` and restart the API (`docker compose up -d php`).
3. Sign in, fill the cart, check out (cookie flow as in the Auth walkthrough):
   ```bash
   curl -b jar.txt -H 'X-Requested-With: fetch' -H 'Content-Type: application/json' -d '{"offerId": 1, "qty": 1}' localhost:8080/api/cart
   curl -b jar.txt -H 'X-Requested-With: fetch' -X POST localhost:8080/api/checkout
   # -> {"orderId":1,"clientSecret":"pi_3Abc..._secret_xyz",...}   the PaymentIntent id is the part before "_secret_"
   ```
4. Pay that PaymentIntent with a Stripe test card (the browser would do this with Stripe.js; the CLI does it for you):
   ```bash
   stripe payment_intents confirm pi_3Abc... --payment-method pm_card_visa      # add --return-url https://example.com if Stripe asks for one
   ```
   `stripe listen` forwards `payment_intent.succeeded`; then `curl -b jar.txt localhost:8080/api/orders/1` shows `"status":"paid"` and the decrypted `keys`; the same order
   fetched with another user's cookie is a 404. Use `pm_card_chargeDeclined` to see `payment_intent.payment_failed` close the order and release the keys.
5. **About `stripe trigger payment_intent.succeeded`:** it creates its *own* PaymentIntent and sends a genuine signed event for it. It will prove that signature
   verification and the endpoint work (you get a 200 and a "belongs to no order" log line), but it cannot mark *your* order paid, because that payment is not the one checkout
   created. Paying the checkout's PaymentIntent (step 4) is the real "done" test.

## Known limits
- No `POST /orders/{id}/sync` fallback (planned in the first architecture): if a webhook is delayed the order stays `pending` until it arrives. Cheap to add if you want it.
- Cleanup of expired reservations is lazy (on checkout/read), not scheduled. Stock held by an abandoned order stays unavailable until the next such request after 15 minutes.
- `reservedUntil` and all datetimes are UTC (the DB session is pinned to +00:00). Single currency (EUR). At most 5 per offer and 20 lines per cart.
- A stuck payment of a *different* amount than the order is refunded rather than investigated; a human only sees `refund_needed` if the refund call itself fails.
