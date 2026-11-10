# Moving the database to Railway MySQL (and keeping XAMPP for development)

## 1. What the repository already had (analysis)

- **Backend:** PHP 8.3, Slim 4, PDO. One connection class (`backend/src/Support/Database.php`, utf8mb4, exceptions on, real prepared statements, UTC session time zone) fed by
  `backend/config/settings.php`, which reads **environment variables only**. No credentials in code. A database failure is turned into
  `503 {"error":{"code":"db_unavailable","message":"Database is not reachable"}}` and the real reason goes to the server log, never to the response (`JsonErrorHandler`).
- **Schema source of truth:** `backend/database/migrations/001-007_*.sql`, applied once each by `Migrator` (ledger table `schema_migrations`). Nothing is missing: the full schema is reconstructable from them.
- **Tables and relationships (14 foreign keys):**
  `users` (login, `email_verified_at`) ← `cart_items`, `orders`, `email_verifications`;
  `platforms`, `regions` ← `products`; `products`, `sellers` ← `offers`; `offers` ← `deals`, `game_keys`, `cart_items`, `order_items`;
  `products` ← `product_stats`; `orders` ← `order_items`, `game_keys.order_id`.
  Stand-alone: `banners`, `home_blocks`, `login_attempts`, `rate_limits`, `stripe_events`, `schema_migrations`.
- **Not in this application:** an admin area (no admin routes, tables or roles exist, so there is nothing to test or migrate); a separate `categories` table (the "categories" are `platforms`, `regions` and the genres on products).
- **Auth:** JWT in an HttpOnly cookie (`JWT_SECRET`), unrelated to the database host. Unchanged.

## 2. Configuration: one connection, only variables differ

`DB_*` (existing) or `MYSQL_*` (accepted as the same thing; `DB_*` wins if both are set):

| Meaning | Variable | XAMPP (local) | Railway (production) |
|---|---|---|---|
| environment | `APP_ENV` | `local` | `production` |
| host | `DB_HOST` / `MYSQL_HOST` | `127.0.0.1` | the **public TCP proxy** host, e.g. `xxxx.proxy.rlwy.net` |
| port | `DB_PORT` / `MYSQL_PORT` | `3306` | the proxy port Railway shows (not 3306) |
| database | `DB_NAME` / `MYSQL_DATABASE` | `keymart` (or your own, e.g. `ecommerce`) | `railway` (Railway's default) |
| user | `DB_USER` / `MYSQL_USER` | `root` | `root` (Railway's default) |
| password | `DB_PASS` / `MYSQL_PASSWORD` | empty | the generated password |
| TLS | `DB_SSL` | unset | unset (Railway's proxy does not require it); `true` if you enable it |

Behaviour added in this change: in a deployment (anything but `APP_ENV=local|test`) **localhost is no longer a silent default**. A missing `DB_HOST`
makes the app refuse to start with a message naming the variable (this was why the first Vercel deploy showed "Database is not reachable").
Tests: `backend/tests/DatabaseSettingsTest.php`, `ConfigGuardTest.php`.

`.env` files are git-ignored (`.gitignore`, `backend/.gitignore`); `backend/.env.example` documents every variable. Nothing logs a password.

## 3. The import file

`backend/database/railway_import.sql`, for an **empty** MySQL 8 database. Contents: the schema (the seven migrations, unchanged), the migration ledger (so the app's migrator does not repeat them),
and the seeder's reference/demo data (platforms, regions, sellers, 120 products, 408 offers, deals, statistics, banners, homepage blocks, two demo accounts).
It uses InnoDB, utf8mb4, parents before children, and no `DROP`: importing into a database that already has the tables fails at the first statement and changes nothing.

**Game keys are deliberately not in the file** (see docs/KEYS.md). They are encrypted with *your* `KEY_ENCRYPTION_KEY`; a key baked into a public file would make every stored key readable by anyone.
Step 5 below creates them with your own key.

**Regenerating it** (after a new migration): create a scratch database, run `DB_NAME=scratch php bin/setup.php`, then rebuild the file the way its header describes:
the migrations in order, the ledger, then `mysqldump --no-create-info --complete-insert` of `platforms regions sellers products offers deals product_stats banners home_blocks users`.

> **Browsing does not depend on stock (P25).** `/api/products` and `/api/filters` list every product even before keys exist: cards show "Out of stock" without a price. The homepage rails *Deals*, *Best sellers* and *New releases* still show only buyable offers (a deal on something nobody can buy would be misleading), so they stay empty until step 5 creates the keys.

## 4. Railway: create, expose, import

1. Railway > *New Project* > *Provision MySQL* (or *Database > MySQL*).
2. Open the MySQL service > *Settings > Networking* > **TCP Proxy** (enable it for port 3306). It shows `<host>.proxy.rlwy.net:<port>`: this is the **public** address.
   Do **not** use `mysql.railway.internal` (the private name works only between services inside Railway, never from Vercel).
3. *Variables* tab of the MySQL service: note `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE` (these are Railway's names; they map to `DB_USER`, `DB_PASS`, `DB_NAME`).
4. Import (from the repository root; the password prompt keeps it out of your shell history):
   ```bash
   mysql -h <host>.proxy.rlwy.net -P <port> -u root -p railway < backend/database/railway_import.sql
   ```
   MySQL Workbench: *Server > Data Import > Import from Self-Contained File*, pick the file, target schema `railway`, *Start Import*.
5. Create the game keys with **the same `KEY_ENCRYPTION_KEY` you will set in production** (idempotent, safe to repeat):
   ```bash
   cd backend
   DB_HOST=<host>.proxy.rlwy.net DB_PORT=<port> DB_NAME=railway DB_USER=root DB_PASS='<password>' \
   KEY_ENCRYPTION_KEY='<your key>' JWT_SECRET=x APP_ENV=local php bin/seed.php
   ```
   (`APP_ENV=local` here only silences the production safety check for this one command; nothing is served.) Expect `game_keys` about 14,000.
   **Easiest:** set `SEED_ON_START=if-empty` on the backend service and redeploy. Since P24 "empty" means *no game keys at all*, so a database imported from this file gets its keys
   at the first start, encrypted with the service's own `KEY_ENCRYPTION_KEY`; later starts skip it. `GET /api/health` shows `"stock":"empty"` until keys exist and `"stock":"ok"` afterwards.

## 5. Vercel

**Runtime check (important).** Vercel has no built-in PHP runtime. The PHP API only runs there because the repository's `vercel.json` declares the backend as a **container**
service (`backend/Dockerfile`); that feature is new and untested here (docs/DEPLOY.md, Option B). Changing the database does not change that. If the backend does not start on Vercel, the smallest change is
to run the same Docker image elsewhere and keep Vercel for the frontend (docs/DEPLOY.md, Option A with Render), or to run the image as a second service **inside the same Railway project**
(then it can use the private `MYSQLHOST` and needs no public proxy). In every variant only the variables below change.

Vercel > Project > *Settings > Environment Variables* (Production), then **redeploy** (variables apply to new deployments only):

| Variable | Value |
|---|---|
| `APP_ENV` | `production` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` | the public proxy host and port and the credentials from step 4 |
| `JWT_SECRET`, `KEY_ENCRYPTION_KEY` | your secrets (the key must be the one used in step 5) |
| `APP_URL`, `APP_DEBUG`, `COOKIE_SECURE` | your Vercel address, `false`, `true` |
| `RUN_MIGRATIONS` | `true` (a no-op after the import: the ledger already lists all migrations) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe test keys |
| remaining variables | docs/DEPLOY.md |

## 6. Verification

**Tested here (local MySQL-compatible server standing in for XAMPP, against a database created from `railway_import.sql`):**
the file imports cleanly and a second import is refused; the app connects using only `MYSQL_*` variables; the seeder then adds ~14,391 keys without altering imported rows;
`/api/health`, product list (120), product detail (3 offers), filters (6 platforms, 10 genres), search with a typo, homepage layout, demo login (`emailVerified: true`), registration (201) and `/api/auth/me` answered correctly.
The full PHPUnit suite (registration, e-mail verification, login/JWT, products, search, cart, checkout, order creation and confirmation, webhooks, concurrency) passes. The import file is also loaded into a real **MySQL 8** by CI on every push.

**Needs your Railway/Vercel credentials (not tested):**
1. From your machine: `mysql -h <host> -P <port> -u root -p railway -e "select count(*) from products"` should print 120.
2. `curl -s https://<your-project>.vercel.app/api/health` returns `{"status":"ok","db":"ok"}`. `503 db_unavailable` means the API cannot reach Railway: read the `[db] connection problem:` line in the backend's runtime logs
   (`Connection refused` with host 127.0.0.1 = `DB_HOST` not set; `timed out` = wrong host/port; `Access denied` = wrong user or password; `Unknown database` = wrong `DB_NAME`).
3. `curl -s "https://<your-project>.vercel.app/api/products?pageSize=1"` lists a product with offers in stock (this also proves step 5).
4. In the browser: sign in as `demo.buyer@keymart.test` / `Demo-Buyer-2027`, add an offer, pay with Stripe test card 4242 4242 4242 4242, see the key.

Rollback: the import never drops anything; to start over, delete the Railway database's tables (or create a new MySQL service) and import again.


## Private networking: the backend must not use the public proxy (P31)

**Who connects to MySQL.** Only server code ever does: the PHP backend (and your own tools when you import or inspect). The React app talks to the backend's HTTPS API (`/api/...`) and never to MySQL, and no database credential is sent to the browser (the API's responses and logs carry none). So a visitor's Wi-Fi, mobile data, ISP or DNS cannot affect the backend's database connection, **provided the backend runs on Railway and reaches MySQL over Railway's private network.**

**Why a database "works on mobile data but not on some Wi-Fi".** The public TCP proxy is `<name>.proxy.rlwy.net` on a non-standard port. Many Wi-Fi networks (offices, schools, hotels, some home routers and ISP DNS filters) block outbound traffic to unusual ports or hosts. That affects whatever runs *on that network*: MySQL Workbench or the `mysql` client on your laptop, `php bin/seed.php` run from your computer against Railway, or XAMPP pointed at the Railway database. It does not affect a backend container inside Railway. (Not confirmed on your network from here; the checks below separate the two cases.) A backend configured with `DB_HOST=<name>.proxy.rlwy.net` goes out of Railway and back in through the proxy: it works while Railway's proxy is up, but it is the wrong path (slower, metered as egress) and needless exposure; use the private one.

**Configure the backend service (Railway dashboard):**
1. Backend service > *Variables* > **New Variable** `MYSQL_URL` = `${{ MySQL.MYSQL_URL }}` (the reference name of your MySQL service goes before the dot; `MySQL` is its default name). Railway resolves it to `mysql://root:<password>@mysql.railway.internal:3306/railway`.
2. **Delete** `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` (and `MYSQL_HOST`, ... ) from the backend service: an individual variable overrides the URL, so a leftover `DB_HOST` pointing at the proxy keeps the public path. Do not set `DB_SSL` for the private network.
3. Redeploy. The container start step retries the database for about a minute, which also covers the moment right after boot when Railway's private DNS is not yet answering.
4. Read the deploy log: `Applied: ...` / `Nothing to migrate.` and the `game_keys` line mean the private connection works.

The code reads `MYSQL_URL` (`App\Support\DatabaseUrl`), percent-decodes the password, and lets any individual `DB_*`/`MYSQL_*` variable win over it. Local XAMPP is unchanged: `backend/.env` keeps `DB_HOST=127.0.0.1`, `DB_USER=root`, empty `DB_PASS`, and there is no `MYSQL_URL` there. Keep Railway values out of `backend/.env` (a copied production `MYSQL_URL` would be a private hostname that does not resolve outside Railway anyway).

**Connection behaviour (inspected).** One PDO connection per request, created lazily on the first query (a request that needs no data opens none), not persistent (no stale connections between requests). The connect timeout is 5 seconds (`PDO::ATTR_TIMEOUT`), so an unreachable database fails with `503 {"error":{"code":"db_unavailable"}}` quickly instead of hanging the request; the real reason (`[db] connection problem: ...`, never the password) goes to the log only. `GET /api/health` runs `SELECT 1` and reports `db: ok` plus `stock`.

**Verify (this is what proves it, from the deployed API, not from a laptop):**
1. From any network, including the one that fails for your DB tools: `curl -s https://<your-api>/api/health` must return `{"status":"ok","db":"ok",...}`. The API answering from a network that blocks the proxy proves the backend does not depend on that network.
2. Open the site on mobile data and on the Wi-Fi in question: homepage, store, a product, sign in. Same behaviour.
3. Prove the backend uses the private path: after step 2 of the configuration, the backend works with **public networking switched off** on the MySQL service (Railway: MySQL > Settings > Networking > remove the TCP proxy). If the API still reports `db: ok` after a redeploy, it is on the private network. Re-enable the proxy only when you need to use Workbench.
4. For your own tools on a Wi-Fi that blocks the proxy: `Test-NetConnection <name>.proxy.rlwy.net -Port <port>` (Windows) or `nc -vz <host> <port>`: `False`/timeout while mobile data succeeds means that network blocks the port. Use mobile data or a VPN for imports, or run the one-off command inside the Railway container (`railway ssh`, if your CLI offers it) so it uses the private network.

**Status of this change.** Tested locally: the app configured *only* by a `MYSQL_URL` (including an escaped password) serves health, catalogue, homepage and sign-in; malformed URLs configure nothing; an unreachable database answers `503` immediately (the sandbox refuses the connection at once, so the 5-second timeout path itself could not be timed here); PHPUnit 386. **Not tested (needs your Railway project): that `mysql.railway.internal` resolves from your backend, i.e. the steps above and checks 1-3.**
