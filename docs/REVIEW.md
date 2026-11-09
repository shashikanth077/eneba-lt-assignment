# Hostile review (P15)

Scope: the whole repository as it stood after P14 (PHP API, MySQL schema, React app, Docker/env files, docs). Method: I read the
security-relevant code paths end to end (auth, middleware, orders/keys, webhook, payment lifecycle, SQL builders), tried to break the
claims the docs make, ran the app and attacked it from the outside (curl, parallel requests, a headless browser with axe-core), and
checked the numbers I quote. Where a finding comes from reading code only, it says so. Nothing here was tested against real Stripe
or a production host.

**Severity scale.** *High*: an outsider can cause real harm (account takeover, data exposure, outage, theft of stock) with little effort,
or a safeguard the docs promise does not work. *Medium*: needs a precondition or limits the damage, or a serious usability barrier.
*Low*: hardening, polish, or accepted trade-offs. Ranking is by severity, then by how cheap the attack is.

## Ranked findings

| # | Sev | Area | Finding | Status |
|---|---|---|---|---|
| S1 | **High** | Security / auth | `X-Forwarded-For` was trusted by its **first** entry, which the client controls: login throttling could be skipped entirely | **Fixed** |
| S2 | **High** | Security / config | The placeholder `JWT_SECRET` and `KEY_ENCRYPTION_KEY` published in `.env.example` / `docker-compose.yml` were accepted on a public deployment: forge any session, decrypt every key | **Fixed** |
| S3 | **High** | Security / availability | No abuse limits on registration (Argon2id each), checkout (locks stock 15 min) or search (full catalogue scan per call) | **Fixed** |
| S4 | **High** | Security / concurrency | Login limiter was check-then-record: a parallel burst got N guesses instead of 5 (measured 16 of 16) | **Fixed** |
| S5 | Medium | Security / key exposure | No `Cache-Control` on private JSON, including the paid-order response that carries plain-text keys | **Fixed** |
| O1 | **High** | Security / email | EmailJS service/template ids and public key ship in the bundle: anyone can send your templates to any address with any parameters | Open |
| O2 | Medium | Security / auth | Login throttle is per (IP, email) and per IP only: a distributed attacker can guess one account without limit | Open |
| O3 | Medium | Concurrency | Abandoned checkouts keep stock hidden until some later checkout/order poll releases it (no job, expiry is lazy) | Open |
| O4 | Medium | Security / abuse | Stock hoarding is only rate-limited, not prevented: many accounts/addresses can still reserve keys for 15 min each; no e-mail verification | Open |
| O5 | Medium | Accessibility | No per-route `<title>`; focus and announcements do not move on client-side navigation (WCAG 2.4.2, 2.4.3, 4.1.3) | Open |
| O6 | Medium | Accessibility | Carousel dots are 10 x 10 px (2.5.8) and autoplay has no explicit pause control, only hover/focus (2.2.2) | Open |
| O7 | Medium | Accessibility | Accessible name does not contain the visible text: "Add GameNest's offer to cart" vs "Add to cart", the account menu (2.5.3) | Open |
| O8 | Medium | Accessibility | In-text links are yellow with no underline, 1.45:1 against the surrounding text (1.4.1); placeholder text 3.9:1 (1.4.3) | Open |
| O9 | Medium | Performance | Search and suggest scan `products` with `LIKE '%x%'` per call; fine at 120 rows, linear beyond (docs/SEARCH.md: 144 ms at 100k) | Open (now bounded by S3's limit) |
| O10 | Low | Performance | Cart/availability use `COUNT(*)` over available keys per offer; cost grows with stock per offer | Open |
| O11 | Low | Performance | Entry bundle ~511 kB (161 kB gzip); web font is a render-blocking third-party stylesheet | Open |
| O12 | Low | Security | The SPA has no hosting security headers (CSP, frame-ancestors) configured; the API now sends its own | Open |
| O13 | Low | Security | Registration reveals existing e-mails (409); password policy is length 8 only, no breached-password check | Accepted trade-off |
| O14 | Low | Concurrency | If the process dies after committing `refund_needed` but before calling the refund API, nothing retries it (logged for a human) | Open |

### What I tried to break and could not
- **Webhook:** forged/missing/old signatures, replays (same event id), a different event id for a paid order, wrong amount or currency, success after expiry (re-acquire or refund), unknown payment intents. All handled (`WebhookTest`, `ConcurrencyTest`). Verification uses the raw body and Stripe's own `WebhookSignature`.
- **Orders IDOR:** another user's order id returns 404, not 403; the list is filtered by user in SQL; keys are decrypted only for a *paid* order of the *owner*; they appear in no list, log, URL, e-mail or storage (tests + browser run).
- **Key allocation:** the last key under parallel buyers, overlapping carts in opposite order (deadlocks), duplicate webhooks racing, `LOCK_STRATEGY=wait`. No double sale in any run. Keys are locked in id order inside one transaction; deadlock victims are retried.
- **SQL injection:** every value is a bound parameter; the only dynamic SQL fragments (sort order, `IN (?,?,..)` lists, `FIELD()` ids) come from whitelists or are generated placeholders.
- **CSRF / CORS:** state-changing calls need `X-Requested-With: fetch` and a listed `Origin`; CORS reflects only listed origins and never `*` with credentials. The webhook is exempt by exact path and authenticated by signature instead.
- **Dependencies:** `npm audit --omit=dev` and `composer audit`: no known advisories.
- **XSS:** no `dangerouslySetInnerHTML`/`innerHTML`; React escapes everything; SVG artwork is served as an image with `nosniff` and a locked-down CSP; banner links from the database are validated client-side.

---

## Fixed findings

### S1 (High): `X-Forwarded-For` spoofing defeats the login limiter
**Evidence.** With `TRUST_PROXY=true`, 12 wrong passwords for one account, each request carrying `X-Forwarded-For: 10.0.0.N, <real address>`:
`401 x 12`, and `login_attempts` held twelve different "client" addresses. With an honest header the sixth attempt is `429`. `ClientIp` took the **first**
list entry; a proxy appends to the right, so the left is whatever the client typed.
**Fix.** `ClientIp::from($request, $trustedProxies)` takes the entry N places from the **right** (N = number of proxies we trust, `TRUSTED_PROXY_HOPS`, default 1 when
`TRUST_PROXY=true`). Too few entries, or a value that is not an IP, falls back to the connection address; `TRUST_PROXY=false` ignores the header.
**Check.** `tests/ClientIpTest.php` (6 cases: spoofed first entry, two proxies, too few entries, garbage, IPv6) and `tests/ProxyThrottleTest.php` (HTTP: eight guesses with a fresh fake
first entry each give `401 x5` then `429 x3`; a different real address has its own allowance). Mutation: returning entry 0 again fails both files.

### S2 (High): published placeholder secrets run a public deployment
**Evidence.** `.env.example` and `docker-compose.yml` contain a working `JWT_SECRET` (longer than the 32-character check, so nothing complained) and `KEY_ENCRYPTION_KEY`, in a public
repository. Copying `.env.example` also copies `APP_ENV=local`, `APP_DEBUG=true` and `COOKIE_SECURE=false`. With the example secret anyone can sign a cookie for user id 1; with the example key anyone with a database copy decrypts all game keys. Nothing would look wrong.
**Fix.** `ConfigGuard` runs at start-up and throws (`Refusing to start with an unsafe configuration: ...`, naming each problem and how to fix it) when the deployment is **not local** and any of these holds:
placeholder JWT secret, placeholder key-encryption key, `COOKIE_SECURE=false`, `APP_DEBUG=true`. "Local" means `APP_ENV` is `local`/`test` **and** `APP_URL` is empty or loopback, so keeping `APP_ENV=local`
but setting the real frontend URL (needed for CSRF anyway) still switches the checks on. `php bin/doctor.php` reports the same (warning locally, failure otherwise).
**Check.** `tests/ConfigGuardTest.php` (12 cases, including the copied-`.env.example` scenario and a test that the real `bootstrap.php` refuses to build the app with the placeholder secret under a production URL). Mutation: removing the call from `bootstrap.php` fails it.
**Residual.** A deployer who *invents* a weak secret is not stopped; keys already encrypted with the old placeholder key must be re-encrypted (the message says so).

### S3 (High): no limits on registration, checkout and search
**Evidence (code).** Registration costs an Argon2id hash (default 64 MB, CPU-bound) per call with no limit, so a loop exhausts memory/CPU and also mass-creates accounts that can reserve stock. Checkout reserves keys for 15 minutes
per call. `/api/search` and `/suggest` scan the catalogue with `LIKE '%x%'` for every call. docs/ARCHITECTURE.md claimed `429` for these; the code did nothing.
**Fix.** `RateLimiter` (database-backed fixed windows; one atomic `INSERT ... ON DUPLICATE KEY UPDATE hits = hits + 1`, then a read) with a `RateLimitMiddleware`: register 10/hour per address, checkout 10/10 min **per account**,
search + suggest 240/min per address (all configurable, `RATE_LIMITS_ENABLED`, `RATE_LIMIT_*`). A refused request answers `429 rate_limited` with `Retry-After`; the SPA shows "Try again in N s/min". Migration `006_rate_limits.sql`.
Catalogue browsing, cart and order polling are deliberately unlimited.
**Check.** `tests/RateLimitTest.php`: window arithmetic and Retry-After, per-subject isolation, old windows forgotten, a disabled limiter, and over HTTP: the 4th registration is refused and creates nothing, checkout is limited per account not per address, search and suggest share one allowance while `/api/products` is untouched, and a two-connection burst lets exactly `limit` through. Mutations (register unlimited; checkout per address) fail it. Frontend: `errors.test.ts`.
**Residual.** Fixed windows allow up to 2x the limit around a boundary; limits per address are weak against botnets (see O4). Developers running the browser scripts repeatedly will hit the registration limit: start the API with `RATE_LIMITS_ENABLED=false` (the scripts say so).

### S4 (High): the login limiter could be raced
**Evidence.** The order was *check counters -> verify password -> record failure*. Sixteen parallel wrong-password attempts (separate OS processes, one address, limit 5): **16 reached the password check, 0 were refused.** An attacker could therefore
send a burst of any size and get that many guesses per lock-out period: the limit was a speed bump, not a limit.
**Fix.** `LoginThrottle::claimAttempt()` records the attempt **first**, then counts: a request proceeds only if the count (which includes its own row and every row inserted before it) is within the limit. Order the passing requests by when they counted: the k-th one counts at least k rows, so at
most `max` can ever pass, however many arrive at once. A successful login deletes the pair's rows (including the one just claimed), so normal use is unchanged.
**Check.** `tests/LoginRaceTest.php`: 16 real parallel processes, at most 5 reach the password check and at least 11 are refused; plus the "4 failures then the right password still works and clears the counter" path. `AuthTest` (all pre-existing throttle behaviour) still passes. Mutation: restoring check-then-record fails the race test.

### S5 (Medium): private responses were cacheable
**Evidence.** Only the artwork endpoint set `Cache-Control`. `GET /api/orders/{id}` returns the plain-text game keys, `/api/cart` and `/api/auth/me` return personal data, and nothing told browsers (disk cache, back/forward cache after sign-out) or any CDN/proxy in front
of the API (the production plan has one) not to keep them. Heuristic caching normally needs validators, so this was a missing guard rather than a demonstrated leak, hence Medium.
**Fix.** `SecurityHeadersMiddleware` (outermost, so errors and CORS preflights are covered): `Cache-Control: no-store` (+`Pragma`) on every response that does not choose its own caching, plus `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and HSTS when the deployment is HTTPS.
The artwork keeps `public, max-age=86400`.
**Check.** `tests/SecurityHeadersTest.php`: a *paid order response that really contains keys*, `/auth/me`, `/cart`, `/orders`, 401 and 404 errors all carry `no-store`; artwork stays cacheable; HSTS only when the cookie is Secure. Mutation: removing the middleware fails 4 of 5 tests.

---

## Open findings (not fixed here, with the intended fix)

**O1 (High): EmailJS can be abused by anyone.** The service id, template ids and public key are in the JavaScript bundle by design (docs/ARCHITECTURE.md accepted this for non-secret e-mails). That also lets anyone call EmailJS directly with your templates, any recipient and any
`order_id`/`order_items` text: phishing with your branding, harassment, and burning the free quota. Mitigations to do: restrict allowed origins and enable rate limits/reCAPTCHA in the EmailJS dashboard, or (better) send the e-mails from the backend (the webhook handler for receipts) with a private key so the browser has nothing to abuse and delivery no longer depends on the tab being open.
**O2 (Medium): distributed guessing.** Counters are per (IP, e-mail) and per IP. A botnet that rotates addresses gets 5 guesses per address per window against one account. Add a per-account counter with a higher threshold (e.g. 30/hour -> CAPTCHA or e-mail unlock), and consider breached-password rejection at registration.
**O3 (Medium): lazy release of abandoned reservations.** Availability counts (`status = 'available'`) ignore reserved keys whose `reserved_until` passed; they are freed only when some checkout or order poll calls `expireDue`. On a quiet shop the last keys of a product can look sold out for hours after an abandoned checkout. Fix: treat `reserved AND reserved_until < NOW()` as available in `lockAvailable` and the availability counts, or run `expireDue` from a scheduled job.
**O4 (Medium): stock hoarding is rate-limited, not prevented.** One account can hold at most 20 lines x 5 keys for 15 minutes and 10 checkouts per 10 minutes; many accounts/addresses multiply that. Without e-mail verification accounts are free. Options: verify e-mail before checkout, cap keys per order lower, shorten the reservation, require payment-method collection earlier.
**O5-O8 (Medium): accessibility** (axe-core 4 against the running app, WCAG 2.0-2.2 A/AA tags; the other pages tested, store/filtered store/search/login, were clean):
- O5: after a client-side navigation to `/store` the title is still "KEYMART" and focus remains on the clicked link, so screen-reader users get no change notification. Fix: a route-level title hook and focusing/announcing the new page's `<h1>`.
- O6: `target-size` serious on the home page: four carousel controls are 10 x 10 px; autoplay can only be paused by hovering/focusing, which touch users cannot do: add a visible pause/play button and 24 px targets.
- O7: `label-content-name-mismatch` serious on the product page (3 add-to-cart buttons: accessible name "Add GameNest's offer to cart" does not contain the visible text "Add to cart") and on every signed-in page (account menu button). Fix: names that start with the visible text ("Add to cart, offer from GameNest").
- O8: `link-in-text-block` serious on the register page (yellow link vs white text 1.45:1, no underline): underline in-text links; placeholder colour `#ad8fe4` on the input fill is 3.9:1 (needs 4.5:1).
**O9-O11 (performance).** O9: the search scan is the known ceiling (docs/SEARCH.md: ~10-20k products comfortable); S3 bounds the abuse but not the cost per call, so a trigram table/FULLTEXT index is the real fix. O10: `COUNT(*)` of available keys per offer in cart/availability queries grows with stock; keep a counter column or use `EXISTS`/`LIMIT n`.
O11: 511 kB entry chunk (MUI + RTK), Google Fonts stylesheet is render-blocking and third-party (also a privacy/CSP item): self-host the font with `font-display: swap` and split vendor chunks.
**O12:** add hosting headers for the SPA (a `vercel.json` with CSP allowing `js.stripe.com`, `api.emailjs.com`, `frame-ancestors 'none'`, nosniff). **O13:** accepted: `409 email_taken` for a clear sign-up UX (documented in ARCHITECTURE.md). **O14:** add a reconciliation job that retries `refund_needed` orders.

## Reproducing the checks
```bash
cd backend
vendor/bin/phpunit tests/ClientIpTest.php tests/ProxyThrottleTest.php      # S1
vendor/bin/phpunit tests/ConfigGuardTest.php                               # S2
vendor/bin/phpunit tests/RateLimitTest.php                                 # S3
vendor/bin/phpunit tests/LoginRaceTest.php                                 # S4 (spawns 16 processes)
vendor/bin/phpunit tests/SecurityHeadersTest.php                           # S5
vendor/bin/phpunit                                                         # everything (347 tests)
cd ../frontend && npx vitest run src/api                                   # the 429 message
```
Manual repro of S1 against a running API (`TRUST_PROXY=true`): `for i in $(seq 12); do curl -s -o /dev/null -w "%{http_code} " -X POST localhost:8080/api/auth/login -H 'Content-Type: application/json' -H 'X-Requested-With: fetch' -H "X-Forwarded-For: 10.0.0.$i, 203.0.113.9" -d '{"email":"victim@example.com","password":"x"}'; done`
printed twelve `401`s before the fix and `401 x5` then `429`s after it. The accessibility findings reproduce with axe-core run through Playwright on the pages named above.
