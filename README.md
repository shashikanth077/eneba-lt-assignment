# KEYMART – marketplace for digital game keys

Eneba Intern Assignment 2027. A marketplace web app styled after eneba.com: catalog with filters, fuzzy
search, config-driven homepage, product page with multi-seller offers, cart, Stripe test-mode checkout and
digital key delivery, and authentication. "KEYMART" is a placeholder brand name.

- Scope, API, payment flow, risks: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Design reference and component inventory: [docs/DESIGN_TOKENS.md](docs/DESIGN_TOKENS.md)
- **Running on XAMPP** (PHP 8.2+, MariaDB/MySQL, setup + doctor scripts): [docs/XAMPP.md](docs/XAMPP.md)
- Project rules for the AI agent: [CLAUDE.md](CLAUDE.md)
- **AI usage for review:** full chat history (all prompts and replies) in [docs/CHAT_HISTORY.md](docs/CHAT_HISTORY.md); per-task prompt + summary in [docs/ai-log/](docs/ai-log/)

## Stack
PHP 8.3 + Slim 4 + PHP-DI + PDO, MySQL 8 · React + TypeScript + Vite, Redux Toolkit + Redux Saga, Axios, React Hook Form + zod, SCSS modules.

## Layout
```
backend/    PHP API: public/, config/, src/{Controllers,Services,Repositories,Middleware,Http,Support,Exceptions}, tests/
frontend/   React app: src/{app,components,features,theme}
docs/       Architecture, design tokens, AI log
docker-compose.yml
```

## Run with Docker (recommended)
```bash
docker compose up --build
```
| URL | What |
|---|---|
| http://localhost:5173 | React app (placeholder page; shows the API status) |
| http://localhost:8080/api/health | API health check -> `{"status":"ok","db":"ok"}` |
| localhost:3307 | MySQL (user/password/db: `keymart`) |

The first start installs Composer and npm dependencies inside the containers, so give it a minute.
Optional phpMyAdmin at http://localhost:8081: `docker compose --profile tools up`.
Reset the database: `docker compose down -v`.

## Run without Docker
Needs PHP 8.2+ (with `pdo_mysql`), Composer, MySQL 8 or MariaDB 10.4+ (XAMPP works, see [docs/XAMPP.md](docs/XAMPP.md)) and Node 22.
```bash
# backend
cd backend && cp .env.example .env && composer install   # XAMPP: copy .env.xampp.example instead
php bin/setup.php     # creates the database if missing, migrates, loads demo data (and two demo accounts, below)
php bin/doctor.php    # checks PHP, extensions, secrets, database, migrations and says what to fix
php -S localhost:8080 -t public public/index.php

# frontend (second terminal)
cd frontend && cp .env.example .env && npm install && npm run dev
```

Deploying (Vercel + Render + a free MySQL host): **docs/DEPLOY.md**.

## Demo accounts

Created by `php bin/setup.php` / `php bin/seed.php` (already e-mail verified). Public on purpose: no money, no keys. Details in docs/EMAIL.md.

| Email | Password |
|---|---|
| `demo.buyer@keymart.test` | `Demo-Buyer-2027` |
| `demo.shopper@keymart.test` | `Demo-Shopper-2027` |

## Database, demo data and tests
```bash
docker compose exec php php bin/migrate.php   # creates the tables (bin/seed.php also does this)
docker compose exec php php bin/seed.php      # demo data, safe to run again
docker compose exec php composer test         # PHPUnit; uses the keymart_test database
```
Without Docker, run the same commands from `backend/` (for tests create a `keymart_test` database the DB user can
use, or set `TEST_DB_NAME`). If your MySQL volume existed before this setup, create it once:
`docker compose exec mysql mysql -uroot -proot -e "CREATE DATABASE keymart_test; GRANT ALL ON keymart_test.* TO 'keymart'@'%'"`.

`bin/seed.php` is deterministic (seeded RNG) and idempotent, and prints row counts:
```
platforms 6 · regions 5 · sellers 12 · products 120 · offers 408 · game_keys 14391
deals 34 · product_stats 120 · banners 4 · home_blocks 4
```
Game keys look like `XXXXX-XXXXX-XXXXX` and are stored encrypted (libsodium, `KEY_ENCRYPTION_KEY`). Covers and
banners are generated SVGs served from `/api/images/products/{slug}.svg` and `/api/images/banners/{slug}.svg`.

## Payments and emails: what to configure
| Where | Setting | Purpose |
|---|---|---|
| `backend/.env` (or root `.env` for Docker) | `STRIPE_SECRET_KEY=sk_test_...`, `STRIPE_WEBHOOK_SECRET=whsec_...` | creating the payment, verifying Stripe's webhook |
| `frontend/.env` (or root `.env` for Docker) | `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...` | Stripe's Payment Element in the browser (test keys only) |
| `frontend/.env` | `VITE_EMAILJS_SERVICE_ID`, `VITE_EMAILJS_PUBLIC_KEY`, `VITE_EMAILJS_AUTH_TEMPLATE_ID`, `VITE_EMAILJS_ORDER_TEMPLATE_ID` | welcome email and key-less order confirmation (optional; two templates, see docs/EMAIL.md) |

Locally also run `stripe listen --forward-to localhost:8080/api/webhooks/stripe` (it prints the `whsec_...`), then buy with card `4242 4242 4242 4242`, any future date, any CVC. Details: [docs/FRONTEND.md](docs/FRONTEND.md), [docs/CHECKOUT.md](docs/CHECKOUT.md).

## Catalog API
```bash
curl 'http://localhost:8080/api/products?platform[]=steam&genre=Action&price_max=3000&sort=discount&page=1&pageSize=12'
curl 'http://localhost:8080/api/filters?platform[]=steam'        # option counts for the filter sidebar
curl  http://localhost:8080/api/products/<slug>                  # details + every buyable offer, cheapest first
```
Prices are integer cents. Sorts: `popular` (default), `price_asc`, `price_desc`, `newest`, `discount`. Query plan and measurements: [docs/QUERY_PLANS.md](docs/QUERY_PLANS.md).

## Cart, checkout and orders
Server-side cart, Stripe test-mode payment, key delivery. Every route needs the session cookie (see the Auth walkthrough); the Stripe webhook needs a signature instead.
```bash
curl -b jar.txt -H 'X-Requested-With: fetch' -H 'Content-Type: application/json' -d '{"offerId": 1, "qty": 2}' localhost:8080/api/cart   # add
curl -b jar.txt localhost:8080/api/cart                                                                                               # live prices + stock issues
curl -b jar.txt -H 'X-Requested-With: fetch' -X POST localhost:8080/api/checkout    # reserves keys, returns { orderId, clientSecret, totalCents, reservedUntil }
curl -b jar.txt localhost:8080/api/orders/1                                         # keys only appear once the order is paid, and only for its owner
```
Needs `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (test mode) in `.env`; without a key checkout answers `503 payments_unavailable`.
How to pay a test order with the Stripe CLI (and why `stripe trigger payment_intent.succeeded` alone will not mark your order paid), the concurrency design and the failure
matrix: [docs/CHECKOUT.md](docs/CHECKOUT.md).

## Homepage API
```bash
curl http://localhost:8080/api/home/layout          # enabled blocks, in order: { blocks: [{ id, type, title, endpoint, config }] }
curl http://localhost:8080/api/home/deals           # each block has its own endpoint, service class and cache
```
Switch a block off with `UPDATE home_blocks SET enabled = 0 WHERE slug = 'deals';`: it leaves the layout and its endpoint answers 404.
Design, caching and how to add a block: [docs/HOME_BLOCKS.md](docs/HOME_BLOCKS.md). `CACHE_DRIVER=none` disables the block cache.

## Search API
```bash
curl -G http://localhost:8080/api/search --data-urlencode 'q=wither 3'            # typo-tolerant, returns score, includes out-of-stock
curl -G http://localhost:8080/api/search/suggest --data-urlencode 'q=cyb'         # autocomplete, best 6
curl -G http://localhost:8080/api/products --data-urlencode 'q=cyber' -d 'platform[]=steam&sort=price_asc'   # search + filters + any sort
```
Pipeline, scoring formula, complexity, measured scale limit and the production recommendation: [docs/SEARCH.md](docs/SEARCH.md).

## Auth API: curl walkthrough
Needs the API on :8080 and `COOKIE_SECURE=false` (the local default; `curl` does not send `Secure` cookies over
plain http). Every state-changing request must send `X-Requested-With: fetch` (CSRF defence). `-c/-b jar.txt` keeps the cookie.
```bash
API=http://localhost:8080/api/auth
H='-H X-Requested-With:fetch -H Content-Type:application/json'

# 1. register -> 201 + Set-Cookie: session=<jwt>; HttpOnly; SameSite=Lax (+ Secure in production)
curl -i -c jar.txt $H -d '{"email":"ana@example.com","password":"correct horse 9","displayName":"Ana"}' $API/register

# 2. who am I? -> {"user":{"id":1,"email":"ana@example.com","displayName":"Ana"}}
curl -b jar.txt $API/me

# 3. same email again -> 409 email_taken
curl $H -d '{"email":"ANA@example.com","password":"another pass 1","displayName":"Ana"}' $API/register

# 4. wrong password and unknown email give the SAME 401 invalid_credentials body
curl $H -d '{"email":"ana@example.com","password":"wrong wrong 1"}' $API/login
curl $H -d '{"email":"ghost@example.com","password":"wrong wrong 1"}' $API/login

# 5. login -> 200 + new cookie
curl -i -c jar.txt $H -d '{"email":"ana@example.com","password":"correct horse 9"}' $API/login

# 6. no X-Requested-With header -> 403 csrf_rejected
curl -d '{}' -H Content-Type:application/json $API/login

# 7. logout -> 204, cookie cleared and the token revoked server-side; /me is now 401
curl -i -b jar.txt -c jar.txt $H -X POST $API/logout
curl -b jar.txt $API/me

# 8. five wrong passwords in a row (same IP + email) -> the sixth attempt is 429 with a Retry-After header
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w '%{http_code} ' $H -d '{"email":"ana@example.com","password":"nope nope 1"}' $API/login; done
```
Expected output of step 8: `401 401 401 401 401 429`.

## Checks
```bash
cd backend && composer test              # PHPUnit
cd frontend && npm run lint && npm run typecheck && npm test && npm run build
```
The frontend shell (header with live search suggestions, nav bar, footer, routing, auth with protected routes) is described in [docs/FRONTEND.md](docs/FRONTEND.md).
Open http://localhost:5173 (use `localhost`, not `127.0.0.1`: the API's CSRF origin allow-list names `localhost`).

## API conventions
Every error has one shape, with `details` always present (`null` when there is nothing to add):
```json
{ "error": { "code": "validation_failed", "message": "The request data is invalid", "details": { "fields": { "email": ["Must be a valid email address"] } } } }
```
Configuration lives in environment variables only; see `backend/.env.example`, `frontend/.env.example` and
the root `.env.example`. Real `.env` files are git-ignored.
