# KEYMART – marketplace for digital game keys

Eneba Intern Assignment 2027: a marketplace web app styled after eneba.com. "KEYMART" is a placeholder brand name.

**What it does**
- **Homepage** assembled from the database (`home_blocks`): banner, category shortcuts, recently viewed, recommended, best sellers, deals, new releases, upcoming games. Each block has its own endpoint.
- **Store**: filters (platform, region, genre, price), sort, pagination and a search box, all kept in the URL; typo-tolerant search with "did you mean".
- **Product page** with offers from several sellers, breadcrumbs and a buy box; the card hover actions are *Add to cart*, then *View offers*.
- **Cart** for visitors (kept in the browser, merged into the account at sign-in) and for buyers (server side), with a cart panel on the header icon.
- **Checkout** (sign-in required): stock is re-checked and keys are reserved on the server, payment with Stripe (test mode), keys delivered on the order page, confirmation e-mail through EmailJS.
- **Accounts**: register, sign in, e-mail verification, edit profile, change password, order history, two demo accounts.
- **Language and currency** button (display currency EUR/USD/GBP/AED with fixed demo rates; money is always charged in EUR; the interface is English only).
- Eneba-style theme (SCSS modules and design tokens), accessible (axe-checked), responsive.

**Stack**: PHP 8.3 + Slim 4 + PHP-DI + PDO, MySQL 8 / MariaDB · React + TypeScript + Vite, Redux Toolkit + Redux Saga, Axios, React Hook Form + zod, SCSS modules · Stripe (test mode) · EmailJS · Docker · GitHub Actions.

## Documentation map
| Topic | File |
|---|---|
| Scope, API, payment flow, risks | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Frontend structure, state, testing | [docs/FRONTEND.md](docs/FRONTEND.md) |
| Design tokens and comparison with the reference | [docs/DESIGN_TOKENS.md](docs/DESIGN_TOKENS.md), [docs/screens/DIFFERENCES.md](docs/screens/DIFFERENCES.md) |
| Cart, checkout, Stripe, concurrency | [docs/CHECKOUT.md](docs/CHECKOUT.md) |
| Game keys as inventory, seeding production | [docs/KEYS.md](docs/KEYS.md) |
| Homepage blocks, language and currency | [docs/HOME_BLOCKS.md](docs/HOME_BLOCKS.md) |
| Search | [docs/SEARCH.md](docs/SEARCH.md), query plans: [docs/QUERY_PLANS.md](docs/QUERY_PLANS.md) |
| E-mail templates, verification, demo accounts | [docs/EMAIL.md](docs/EMAIL.md), [docs/email-templates/](docs/email-templates/) |
| Deployment (Vercel, Railway, Render, free MySQL) | [docs/DEPLOY.md](docs/DEPLOY.md), [docs/RAILWAY.md](docs/RAILWAY.md) |
| Running on XAMPP | [docs/XAMPP.md](docs/XAMPP.md) |
| Security review | [docs/REVIEW.md](docs/REVIEW.md) |
| Project rules for the AI agent; AI usage log | [CLAUDE.md](CLAUDE.md), [docs/ai-log/](docs/ai-log/), [docs/CHAT_HISTORY.md](docs/CHAT_HISTORY.md) |

## Layout
```
backend/    PHP API: public/, config/, src/{Controllers,Services,Repositories,Home/Blocks,Mail,Payment,Middleware,Support,...},
            database/{migrations,seeds,railway_import.sql}, bin/ (setup, migrate, seed, doctor, import_keys), tests/, Dockerfile
frontend/   React app: src/{app,components,features,services,styles}, e2e/ (Playwright), vercel config in the repo root
docs/       documentation and the per-task AI log
.github/workflows/ci.yml   backend tests, frontend checks, Docker image check, Playwright purchase test
docker-compose.yml         local stack: PHP API :8080, MySQL :3307, Vite :5173
vercel.json                Vercel project configuration (see Deployment)
```

## Run locally

**Docker** (`docker compose up --build`): app http://localhost:5173, API health http://localhost:8080/api/health, MySQL `localhost:3307` (user/password/db `keymart`). The API container migrates the database and seeds the demo data on first start. Reset: `docker compose down -v`.

**Without Docker / XAMPP** (PHP 8.2+ with `pdo_mysql`, Composer, MySQL 8 or MariaDB 10.4+, Node 22; XAMPP details in [docs/XAMPP.md](docs/XAMPP.md)):
```bash
cd backend && cp .env.example .env && composer install        # XAMPP: copy .env.xampp.example instead
php bin/setup.php      # creates the database if missing, migrates, loads demo data and the demo accounts
php bin/doctor.php     # checks PHP, extensions, secrets, database, migrations, game keys; says what to fix
php -S localhost:8080 -t public public/index.php

cd frontend && cp .env.example .env && npm install && npm run dev      # second terminal
```
Open http://localhost:5173 (use `localhost`, not `127.0.0.1`: the CSRF origin list names `localhost`).

### Demo accounts
Created by `php bin/setup.php` / `php bin/seed.php`, already e-mail verified, each with realistic paid orders. Public on purpose (no money, no real keys); their password cannot be changed (shared accounts).

| Email | Password |
|---|---|
| `demo.buyer@keymart.test` | `Demo-Buyer-2027` |
| `demo.shopper@keymart.test` | `Demo-Shopper-2027` |

### Payments and e-mail
| Where | Setting | Purpose |
|---|---|---|
| `backend/.env` | `STRIPE_SECRET_KEY=sk_test_...`, `STRIPE_WEBHOOK_SECRET=whsec_...` | create payments, verify Stripe's webhook |
| `frontend/.env` | `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...` | Stripe's Payment Element (test keys only) |
| `frontend/.env` | `VITE_EMAILJS_SERVICE_ID`, `VITE_EMAILJS_PUBLIC_KEY`, `VITE_EMAILJS_AUTH_TEMPLATE_ID`, `VITE_EMAILJS_ORDER_TEMPLATE_ID` | welcome and order-confirmation e-mails (optional, [docs/EMAIL.md](docs/EMAIL.md)) |
| `backend/.env` | `EMAILJS_*` (incl. the private key) | the verification e-mail, sent by the API |

Locally run `stripe listen --forward-to localhost:8080/api/webhooks/stripe` for the `whsec_...`, then pay with card `4242 4242 4242 4242`, any future date, any CVC.

**How a payment is confirmed.** Stripe's webhook is the normal path. The payment page polls the order, and for a pending order the **server asks Stripe itself** (server to server) and fulfils it if the payment succeeded, so a late, missing or mis-addressed webhook no longer leaves a buyer on "Confirming your payment". Nothing the browser says is trusted. The confirmation e-mail is sent once, when the order becomes paid.

### Configuration
Environment variables only: `backend/.env.example`, `frontend/.env.example`, root `.env.example`; real `.env` files are git-ignored. Database: `DB_*`, `MYSQL_*` or Railway's `MYSQL_URL` (individual variables win); a deployment must name its database, there is no silent localhost.

## Game keys and seeding
Keys are inventory (`game_keys`, libsodium-encrypted with `KEY_ENCRYPTION_KEY`, status `available` -> `reserved` -> `sold`). The seeder creates keys only for offers that have none, never refills a sold-out offer and never re-encrypts, so repeating it is safe. **Without available keys every game says "Out of stock"**; `GET /api/health` reports `"stock":"empty"`. Real keys: `php bin/import_keys.php <offer id> <file>`. Seeding or diagnosing a deployed database from your computer (and why local seeding does not touch production): [docs/KEYS.md](docs/KEYS.md). The container start step (`RUN_MIGRATIONS`, `SEED_ON_START`) is described in [docs/DEPLOY.md](docs/DEPLOY.md).

## Deployment
- **Frontend** on Vercel (static build). **API** as a Docker image (`backend/Dockerfile`: PHP 8.3 + Apache, migrates and seeds on start). **Database**: any MySQL 8 / MariaDB 10.6+ (Railway MySQL, Aiven, ...). Stripe in test mode.
- The browser only calls the HTTPS API (`/api/...` on the Vercel domain, forwarded to the API); it never talks to MySQL, and no credential reaches it.
- Railway: connect the API to MySQL over the **private network** with `MYSQL_URL=${{ MySQL.MYSQL_URL }}` on the API service, so no visitor network matters ([docs/RAILWAY.md](docs/RAILWAY.md)). The Stripe webhook points at the API's own HTTPS address.
- Free-tier cold starts, warm-up pings, every environment variable per service, Stripe webhook registration and a troubleshooting table: [docs/DEPLOY.md](docs/DEPLOY.md).
- `GET /api/health` -> `{"status":"ok","db":"ok","stock":"ok"}` (`stock: empty` = no available game key).

## Checks and CI
```bash
cd backend  && composer install && vendor/bin/phpunit                              # needs a keymart_test database (or TEST_DB_NAME)
cd frontend && npm run format:check && npm run lint && npm test && npm run build   # Vitest + Testing Library
cd frontend && npx playwright install chromium && npm run test:e2e                 # real-browser flows (starts the API and Vite itself)
```
`.github/workflows/ci.yml` runs all of it on every push: PHPUnit on MySQL 8 (and loads `railway_import.sql` into an empty MySQL), the frontend checks, a job that builds the Docker image and starts it like production, and the Playwright flows (browse, guest cart, cart panel, demo account, full purchase).

## API quick reference
Prices are integer cents. Errors always look like `{ "error": { "code", "message", "details" } }` (`details` is `null` when empty). Every state-changing request needs `X-Requested-With: fetch` (CSRF defence) and the session cookie (HttpOnly JWT).

| Area | Endpoints |
|---|---|
| Catalogue | `GET /api/products` (filters `platform[]`, `region[]`, `genre[]`, `price_min/max`, `slug[]`, `q`; sorts `popular`, `price_asc`, `price_desc`, `newest`, `discount`), `/api/products/{slug}`, `/api/filters`, `/api/search`, `/api/search/suggest` |
| Homepage | `/api/home/layout` and one endpoint per block: `banners`, `categories`, `recommended`, `best-sellers`, `deals`, `new-releases`, `upcoming` |
| Auth | `POST /api/auth/register`, `/login`, `/logout`, `/verify-email`, `/resend-verification`, `/change-password`, `PATCH /api/auth/profile`, `GET /api/auth/me` |
| Cart and orders | `/api/cart` (GET/POST/DELETE), `PATCH|DELETE /api/cart/{offerId}`, `POST /api/checkout`, `/api/orders`, `/api/orders/{id}` (keys only for the owner of a paid order) |
| Other | `POST /api/webhooks/stripe` (signature instead of cookie), `/api/images/...`, `/api/health` |

```bash
curl 'http://localhost:8080/api/products?platform[]=steam&genre=Action&price_max=3000&sort=discount'
curl -c jar.txt -H 'X-Requested-With: fetch' -H 'Content-Type: application/json' \
     -d '{"email":"demo.buyer@keymart.test","password":"Demo-Buyer-2027"}' http://localhost:8080/api/auth/login
curl -b jar.txt http://localhost:8080/api/orders
```
Details: catalogue and search in [docs/SEARCH.md](docs/SEARCH.md), checkout in [docs/CHECKOUT.md](docs/CHECKOUT.md), homepage blocks in [docs/HOME_BLOCKS.md](docs/HOME_BLOCKS.md), security notes in [docs/REVIEW.md](docs/REVIEW.md).

## Troubleshooting
| Symptom | Look at |
|---|---|
| Every game says "Out of stock" | `/api/health` shows `"stock":"empty"`: seed the database ([docs/KEYS.md](docs/KEYS.md)) |
| "Confirming your payment…" does not finish | the API must have `STRIPE_SECRET_KEY` (it checks the payment with Stripe) and a correct `STRIPE_WEBHOOK_SECRET`; see [docs/DEPLOY.md](docs/DEPLOY.md) |
| No confirmation e-mail | the `VITE_EMAILJS_*` variables must be set where the frontend is built (Vercel), and the order only becomes "paid" after the payment is confirmed ([docs/EMAIL.md](docs/EMAIL.md)) |
| "Database is not reachable" | `GET /api/health`, the `[db] connection problem` log line, [docs/RAILWAY.md](docs/RAILWAY.md) |
| Anything on a developer machine | `php bin/doctor.php` |
