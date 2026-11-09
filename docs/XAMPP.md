# Running on XAMPP (PHP + MySQL/MariaDB)

XAMPP bundles Apache, PHP and **MariaDB** (it is what XAMPP calls "MySQL"). The project is written to run there: plain PDO, no
extension beyond the ones XAMPP enables, and it adapts to older MariaDB. This page is the complete first-run path and the list of
things that differ from the Docker setup.

> **Honesty note.** The code was developed and tested here against MariaDB 10.11 + PHP 8.3 (Linux). The XAMPP-specific behaviour
> was verified by *emulating* XAMPP's conditions (empty root password, non-strict `sql_mode`, 1 MB `max_allowed_packet`, forced
> `LOCK_STRATEGY=wait` to imitate MariaDB < 10.6). It has **not** been run on a real XAMPP install. `php bin/doctor.php` exists so
> you can check your machine in one command.

## What you need
| | Minimum | Notes |
|---|---|---|
| XAMPP | 8.2.x or newer (PHP 8.2+) | older XAMPP ships PHP 7.4/8.0/8.1, which cannot run this project |
| Composer | 2.x | `composer install` in `backend/` |
| Node | 22 | for the React app |

Use XAMPP's own PHP for every command (`C:\xampp\php\php.exe`, or put `C:\xampp\php` first on your PATH). Check with `php -v`.
PHP extensions needed (all enabled by default in XAMPP's `php.ini`): `pdo_mysql`, `mbstring`, `sodium`, `openssl`, `curl`, `json`, `ctype`.

## First run (about 5 minutes)
1. Start **MySQL** (and Apache if you want option B below) in the XAMPP control panel.
2. In `backend/`:
   ```bash
   composer install
   copy .env.xampp.example .env        # macOS/Linux: cp .env.xampp.example .env
   php bin/setup.php                    # creates the `keymart` database, runs the migrations, loads the demo data
   php bin/doctor.php                   # tells you what is still wrong, with the fix
   ```
   `setup.php` is safe to repeat. `--no-seed` skips demo data; `--test-db` also prepares `keymart_test` for PHPUnit.
3. Start the API (option A, simplest): `php -S localhost:8080 -t public public/index.php`
4. In `frontend/`: `copy .env.example .env`, `npm install`, `npm run dev`, open http://localhost:5173.

### Option B: Apache serves the API
Put the project in `C:\xampp\htdocs\keymart`, set `APP_BASE_PATH=/keymart/backend/public` in `backend/.env`, and point the frontend at
it with `VITE_API_PROXY_TARGET=http://localhost/keymart/backend/public` in `frontend/.env`. `backend/public/.htaccess` forwards
requests to `index.php` (needs `mod_rewrite` and `AllowOverride All`, both XAMPP defaults). The Stripe webhook URL becomes
`http://localhost/keymart/backend/public/api/webhooks/stripe`.

## Migrations and seeds on XAMPP
| Concern | What the project does |
|---|---|
| Database does not exist yet | `php bin/setup.php` (or `bin/migrate.php --create-db`, `bin/seed.php --create-db`) creates it as `utf8mb4` / `utf8mb4_unicode_ci`. The name is validated (`[A-Za-z0-9_]`, max 64) because identifiers cannot be bound as parameters. |
| Credentials | XAMPP default is user `root`, empty password. `.env.xampp.example` has them. For anything shared, create a dedicated user instead. |
| Migrations | Plain `.sql` files in `database/migrations`, applied once each and recorded in `schema_migrations`. They only use syntax MariaDB 10.4+ and MySQL 5.7+ both accept (InnoDB, `utf8mb4`, no `CHECK` constraints, functional indexes or `DEFAULT (expr)`; the one `JSON` column is an alias for `LONGTEXT` on MariaDB and is decoded in PHP, so it behaves the same). |
| Seeds | Deterministic and idempotent. Rows are inserted in batches sized to stay below XAMPP's old `max_allowed_packet` default of 1 MB (verified by seeding with the server set to exactly 1 MB). |
| `sql_mode` | XAMPP's default is empty (non-strict); MySQL 8 is strict and has `ONLY_FULL_GROUP_BY`. The full test suite passes under both. |
| Line endings | `.gitattributes` keeps `.php`, `.sql`, `.sh` as LF so a Windows checkout does not break scripts or the Docker image. |

## MariaDB 10.4 / 10.5 (older XAMPP): the one real difference
Checkout reserves game keys with `SELECT ... FOR UPDATE SKIP LOCKED`, so competing buyers never wait for each other. That syntax
exists in **MySQL 8.0.1+ and MariaDB 10.6+** only. `LOCK_STRATEGY` (default `auto`) reads the server version and falls back to plain
`FOR UPDATE` on older servers:

| Strategy | Behaviour |
|---|---|
| `skip` | other buyers' locked keys are skipped; nobody waits |
| `wait` | a buyer who wants a locked key waits until the other transaction ends (milliseconds), then sees the committed result |

Safety does not depend on the strategy: a key is still never sold twice. Because `wait` can let two checkouts lock overlapping keys
in different orders, every checkout/payment transaction is wrapped in `Transaction::runWithRetry`, which restarts a transaction that the
database chose as a deadlock victim (SQLSTATE 40001 / error 1213, at most 3 attempts). Lock-wait *timeouts* are not retried.
`php bin/doctor.php` shows which strategy your server gets. Set `LOCK_STRATEGY` yourself only to force one.

## Developing the homepage against XAMPP's database
`home_blocks` controls the page; edit it in phpMyAdmin (http://localhost/phpmyadmin) and refresh the browser:
```sql
UPDATE home_blocks SET position = 1 WHERE id = 'new-releases';   -- reorder
UPDATE home_blocks SET enabled  = 0 WHERE id = 'deals';          -- hide (its endpoint now answers 404)
```
The **layout** is never cached. Each block's **data** is cached for up to 10 minutes when `CACHE_DRIVER=file`; the XAMPP example sets
`CACHE_DRIVER=none` so banner/product edits also show on refresh. Use `file` on a real server.

## Troubleshooting
| Symptom | Cause / fix |
|---|---|
| `php bin/doctor.php` says PHP too old | another PHP is first on PATH; call `C:\xampp\php\php.exe` explicitly |
| `could not find driver` | enable `extension=pdo_mysql` in `C:\xampp\php\php.ini` (`php --ini` shows the file) |
| `Access denied for user 'root'` | you set a root password in XAMPP; put it in `DB_PASS` |
| `SQLSTATE[HY000] [2002]` | MySQL is not started in the control panel, or the port is not 3306 (`DB_PORT`) |
| `Unknown database 'keymart'` | run `php bin/setup.php` |
| `Got a packet bigger than 'max_allowed_packet'` | set `max_allowed_packet=16M` under `[mysqld]` in `C:\xampp\mysql\bin\my.ini`, restart MySQL |
| Sign-in works but you are logged out on reload | the browser dropped the cookie: use `COOKIE_SECURE=false` over plain http, and open the app on `localhost` (not `127.0.0.1`) |
| 403 `csrf_rejected` | `APP_URL`/`CORS_ALLOWED_ORIGINS` must equal the exact address in your browser bar |
| Checkout answers 503 | no Stripe test key yet (`STRIPE_SECRET_KEY=sk_test_...`) |
