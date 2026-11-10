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

**Game keys are deliberately not in the file.** They are encrypted with *your* `KEY_ENCRYPTION_KEY`; a key baked into a public file would make every stored key readable by anyone.
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
