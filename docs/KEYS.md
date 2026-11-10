# Game keys as inventory (P27)

A game key is a row in `game_keys` (one per sellable key): `offer_id`, `key_enc` (libsodium secretbox with `KEY_ENCRYPTION_KEY`), `key_hash` (SHA-256 fingerprint, unique), `status`, `order_id`, `reserved_until`, `sold_at`.

## Lifecycle (every transition is one guarded UPDATE, inside a transaction)

| State | Meaning | Set by | Columns |
|---|---|---|---|
| `available` | on the shelf; counts as stock | creation / release | no order, no times |
| `reserved` | held for a pending order for 15 minutes | checkout (`SELECT ... FOR UPDATE SKIP LOCKED`, then UPDATE `WHERE status='available'`) | `order_id`, `reserved_until` |
| `sold` | delivered to the paid order; shown only to its owner | the Stripe webhook (`KeyRepository::sell`) | `order_id`, `sold_at`, `reserved_until` NULL |
| back to `available` | the order failed, was cancelled or expired | `OrderLifecycle::closePending` | order and times cleared |

A key is never copied: one row, one `order_id`. `sold` is terminal (nothing updates a sold row except reading it for its owner), the fingerprint is unique, and a re-run of any import or seed skips a fingerprint that exists in **any** state, so a delivered key cannot come back on the shelf or be handed out twice.
Stock everywhere (list, filters, product page, cart, checkout) is the same number: keys in state `available`. Expired reservations are released by the checkout, by the buyer's order list and by `GET /api/health` (uptime monitors ping it every few minutes), so keys do not stay stuck behind an abandoned checkout.

## Why keys were being re-created (investigation)

1. The seeder generated every key from a fixed pseudo-random seed on every run, encrypted all ~14,000 of them, and relied on `INSERT IGNORE` to skip the ones that existed. That never duplicated a key, but it re-did the work on every start (`SEED_ON_START=always`, or a start step that looked at products instead of keys), and the same run also reset prices and deals to the seed's values.
2. The keys were *predictable*: anyone with the repository could compute every demo key.
3. With a different `KEY_ENCRYPTION_KEY` the existing rows became unreadable while the re-generated ones were ignored (same fingerprints), so stock looked fine and delivery failed.
4. A database imported without keys (`railway_import.sql`) had none until a seed ran, so every game was "out of stock".

## What it does now

- **Keys are created once, per offer.** The seeder adds keys only to an offer that has **no key rows at all**. A sold-out offer is a real state and is never refilled. Keys are random (`random_int`), not derivable from code. A repeated run adds nothing and re-encrypts nothing (`KeyInventoryTest`).
- **One secret.** Before adding keys the seeder decrypts one existing key; if that fails it stops with "The existing game keys cannot be decrypted with the current KEY_ENCRYPTION_KEY" instead of mixing two secrets. Same check in `bin/import_keys.php`.
- **Real inventory:** `php bin/import_keys.php <offer id> <file | ->` (one key per line). Encrypts, stores as `available`, skips known fingerprints, all-or-nothing, never prints a key.
- **Start-up** (`backend/docker-entrypoint.sh`): `SEED_ON_START=if-empty` (default) runs the seeder only when the table has no key at all; `false` disables seeding, which is the setting for a shop that manages its own inventory.
- **Delivery is recorded:** migration 008 adds `sold_at`, back-filled for existing sold keys from their order. Existing encrypted keys are untouched; the migration only adds a column.

## Migration strategy for an existing database

1. Back up the database (the keys are in it).
2. Deploy: migration 008 applies on start (`RUN_MIGRATIONS=true`, the default). No key is re-created: offers that already have keys are skipped.
3. Keep the same `KEY_ENCRYPTION_KEY` forever. If you must rotate it, decrypt with the old key and re-encrypt with the new one in one script before deploying; there is none in this repository because nothing here needs it yet.
4. The demo catalogue and demo accounts are for demos: for a real shop set `SEED_ON_START=false` and load keys with `bin/import_keys.php`.


## Seeding the PRODUCTION database yourself (P32)

`GET /api/health` answering `"stock":"empty"` means the database that API uses has no available key, so every game shows "Out of stock". Seeding your local XAMPP database changes nothing there: production is a different database. The start step of the Docker image seeds it when it runs (`SEED_ON_START`, default `if-empty`: it runs when **no key is available**), but it only exists where the image's `docker-entrypoint.sh` really starts the container. If you are unsure it did, seed once by hand. It is safe to repeat.

From your computer (use mobile data if your Wi-Fi blocks Railway's proxy port). Use the **public** connection details of the Railway MySQL service (Variables: the TCP proxy host and port, user, password, database) and the **same `KEY_ENCRYPTION_KEY` the deployed API uses**. Set all five `DB_*` variables: `backend/.env` also defines `DB_HOST` and friends, and an individual variable beats `MYSQL_URL`, so setting only the URL would silently seed your *local* database.

```powershell
cd backend
$env:DB_HOST = "<name>.proxy.rlwy.net"
$env:DB_PORT = "<proxy port>"
$env:DB_NAME = "railway"
$env:DB_USER = "root"
$env:DB_PASS = "<password>"
$env:KEY_ENCRYPTION_KEY = "<the production value>"
C:\xampp\php\php.exe bin\migrate.php
C:\xampp\php\php.exe bin\seed.php
C:\xampp\php\php.exe bin\doctor.php
```

Every script prints `Database: user@host:port/name` first (never the password): check it is the Railway host before trusting the result. `seed.php` ends with `Available game keys: N`; `doctor.php` fails with "Game keys: none available" when the stock is empty and with "KEY_ENCRYPTION_KEY matches the stored keys" when the key differs from the one the stored keys were created with. Then reload `/api/health`: `"stock":"ok"`, and wait up to 2 minutes for the homepage cache.
