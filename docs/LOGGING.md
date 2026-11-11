# Logging: what the API writes, and how to read it on Vercel / Railway

Every important step of every flow writes **one JSON line** to the service's log stream (`error_log`, which Apache sends to the container's stderr). Vercel (*Project > Logs*) and Railway (*service > Logs*) collect it; nothing to install. Lines look like this:

```json
KEYMART {"ts":"2026-11-11T09:14:02Z","level":"error","event":"mail.verification.failed","msg":"EmailJS refused the verification e-mail","request_id":"3f9a1c7e2b4d5a60","vercel_id":"fra1::abc-123","http_status":403,"provider_answer":"API calls are disabled for non-browser applications","template":"template_x1y2z3","ms":412}
```

| Field | Meaning |
|---|---|
| `level` | `debug` (detail), `info` (a step happened), `warn` (refused or degraded, the system carried on), `error` (something is broken and needs a person) |
| `event` | `area.what`, the stable name to search for (catalogue below) |
| `msg` | one human sentence, often with the setting to check |
| `request_id` | the same on every line of one request, and returned to the caller as the `X-Request-Id` header; `vercel_id` / `railway_id` are the platform's own ids for the same request |
| `user_id` | on every line after sign-in |
| the rest | ids, reasons and counts. **Never** a password, token, cookie, signature, game key, client secret or full e-mail address (fields whose name looks sensitive are replaced by `[redacted]`, e-mail addresses are masked as `a***@example.com`). |

**Level:** `LOG_LEVEL` = `debug` \| `info` (default) \| `warn` \| `error` \| `off`. Use `warn` to keep only problems, `debug` to also see the health check and Stripe's "not yet" answers.

## Reading the log

- **Search the event name or the level**: `"level":"error"`, `mail.verification`, `payment.`, or an `order_id`.
- **Follow one request from start to end**: copy its `request_id` (every response carries `X-Request-Id`; in the browser's network tab, or from the line you found) and search for it. One `http.request` line closes each request (method, path, status, ms; 5xx is `error`, 4xx `warn`).
- **Follow one purchase**: search `"order_id":42`.
- **Browser-side problems** (the order e-mail is sent from the browser, which Vercel cannot see) are reported by the browser to the API and appear here as `browser.*` events with `"source":"browser"`.
- Vercel only keeps logs for a limited time on the free plan; Railway keeps more. Export what you need.

## Events

Flow order for a purchase: `auth.register.ok` -> `mail.verification.*` -> `auth.login.ok` -> `cart.line.set` -> `checkout.started` -> `checkout.reserved` -> `checkout.intent` -> (`payment.sync.*` and/or `webhook.received`) -> `payment.paid` -> `webhook.handled`, and in the browser `browser.email.*`.

| Event | Level | When, and what to do |
|---|---|---|
| `http.request` | info / warn (4xx) / error (5xx) / debug (health) | one per request |
| `app.config.unsafe` | error | the API refused to start: the message names the variable (`JWT_SECRET`, `KEY_ENCRYPTION_KEY`, `DB_HOST`, `COOKIE_SECURE`, ...) |
| `app.unhandled` | error | an exception nobody expected (`error`, `where` = file:line) |
| `db.unreachable` | error | the database cannot be reached or refused the login: check `MYSQL_URL` / `DB_*`, docs/RAILWAY.md |
| `health.stock.empty` | warn | **no game key is available**: every game shows Out of stock, seed (docs/KEYS.md) |
| `health.sweep_failed` | warn | expired reservations could not be released |
| `auth.register.ok` / `.refused` | info / warn | sign-up (`reason`: `email_taken`, ...) |
| `auth.login.ok` / `.failed` | info / warn | `reason`: `invalid_credentials`, `too_many_attempts` (the client always gets the same generic answer, the log is specific) |
| `auth.session.rejected` / `.revoked` | warn | a cookie was refused (expired/forged, or the user signed out everywhere) |
| `auth.verify.ok` / `.failed` / `.resend` | info / warn / info | e-mail verification link used, refused (unknown, expired, used), re-requested |
| `auth.profile.updated`, `auth.password.changed` / `.refused` | info / warn | account changes |
| `mail.verification.sent` | info | EmailJS accepted the verification e-mail |
| `mail.verification.skipped` | warn / error | **not sent**: `missing_settings` lists the unset `EMAILJS_*` variables (warn), or `APP_URL` is not https (error) |
| `mail.verification.invalid_recipient` | error | **not sent**: the account's address is empty or malformed (the address itself is never logged) |
| `mail.verification.failed` | error | EmailJS refused: `http_status` and `provider_answer` say why ("The Public Key is invalid", "API calls are disabled for non-browser applications", quota ...) |
| `cart.line.set` / `cart.stock.insufficient` | info / warn | a line saved; a quantity above the keys on the shelf |
| `checkout.started` / `.reserved` / `.intent` | info | steps of a checkout (`order_id`, `total_cents`, the Stripe intent id) |
| `checkout.refused` | warn | `reason`: `cart_empty`, `out_of_stock` (with the offers), `amount_too_small` |
| `checkout.payments.unconfigured` | error | `STRIPE_SECRET_KEY` is not set on the API |
| `checkout.intent.failed` | error | Stripe refused or was unreachable; the keys were released |
| `webhook.received` / `webhook.handled` | info (warn / error by outcome) | a verified Stripe event and what it did (`outcome`: `paid`, `duplicate`, `already_handled`, `failed`, `canceled`, `unknown_order`, `refund_needed`) |
| `webhook.rejected` | warn / error | `invalid_signature` = the `STRIPE_WEBHOOK_SECRET` is not the one of **this** endpoint in Stripe, or the caller is not Stripe; `webhook_not_configured` (error) = the secret is missing |
| `payment.sync.succeeded` / `.pending` / `.failed` | info / debug / error | the server asked Stripe about a pending order (no webhook needed); `failed` = check `STRIPE_SECRET_KEY` and the outbound connection |
| `payment.paid` | info | order paid, keys sold |
| `payment.unknown_order` | warn | a payment at Stripe that belongs to no order of ours |
| `payment.refund_needed` / `.refunded` / `.refund_failed` | error / warn / error | money received but not deliverable; the automatic refund and its result (`refund_failed` needs a manual refund in Stripe) |
| `payment.cancel_failed` | warn | a payment could not be cancelled at Stripe (the order is closed anyway) |
| `order.expired` | info | a reservation ran out, keys back on the shelf |
| `keys.seeded` / `keys.secret_mismatch` | info / error | seeding created keys; the stored keys cannot be decrypted with this `KEY_ENCRYPTION_KEY` |
| `security.csrf.rejected` | warn | a state-changing request was refused: header missing, or `APP_URL` differs from the browser's address |
| `security.rate_limited` | warn | a 429 (`bucket`, `subject`) |
| `browser.email.sent` / `.skipped` / `.invalid` / `.failed` | info / warn / warn / error | the e-mail the **browser** sends through EmailJS (`kind`: `registration` / `order`): `skipped` lists the unset `VITE_EMAILJS_*` variables or says the order was not paid in this browser; `failed` carries EmailJS's own explanation (`status`, `reason`) |
| `browser.payment.poll.gave_up` | warn | the payment page waited two minutes without a confirmation (`order_id`): look for `payment.sync.*` / `webhook.*` of that order |
| `browser.checkout.failed` | error | what the buyer saw when starting checkout failed |
| `browser.app.error` | error | an uncaught error in the page (`message`, `route`) |

## "The e-mail did not arrive": what to search

1. Welcome / order e-mail (sent by the browser): `browser.email` after the time of the action. `sent` = EmailJS accepted it (look in spam, or at the EmailJS dashboard). `skipped` with `missing` = set those `VITE_EMAILJS_*` variables in Vercel **and redeploy** (they are baked in at build time). `failed` = read `reason` (wrong public key, wrong service/template id, a blocked domain in EmailJS *Security*, quota). No `browser.email` line at all = the order never became paid: search `order_id` and `payment.`.
2. Verification e-mail (sent by the API): `mail.verification`. `skipped` + `missing_settings` = set those `EMAILJS_*` variables on the API; `failed` = `provider_answer`.

## "The payment is stuck on Confirming": what to search

`checkout.intent` (was a payment created?) -> `payment.sync.*` (did the server reach Stripe? `failed` = `STRIPE_SECRET_KEY`) -> `webhook.rejected` / `webhook.received` (did Stripe's webhook arrive and verify?) -> `payment.paid`. The first missing step is the problem.

## Safety and cost

The browser reporting endpoint (`POST /api/client-log`) accepts only the events above, chooses the level itself, keeps only a few short fields and is rate-limited (`RATE_LIMIT_CLIENT_LOG_PER_MINUTE`, default 60 per address); a failed report is dropped, never retried. A log call can never fail a request. Tests: `backend/tests/LogTest.php`, `FlowLoggingTest.php`, `frontend/src/services/log/`.
