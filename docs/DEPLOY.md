# Deploying KEYMART on free tiers

```
Browser ──► Vercel (static SPA) ──/api/* rewrite──► Render (Docker: PHP 8.3 + Apache) ──TLS──► free MySQL host
                                                       ▲
                                  Stripe ──webhook (direct, not through Vercel)
```

The browser only talks to its own origin (`https://<project>.vercel.app/api/...`), so the session cookie stays first-party and CORS is not
needed. Stripe calls the API **directly** (it has no cookie and the signature needs the raw body).

| Piece | Service | Cost |
|---|---|---|
| Frontend (`frontend/`) | Vercel Hobby | free |
| API (`backend/`, `backend/Dockerfile`) | Render Web Service, instance type **Free** | free |
| Database | any MySQL 8 / MariaDB 10.6+ host with a free plan (Aiven for MySQL is the one assumed below) | free |
| Payments | Stripe, **test mode only** | free |
| E-mail (optional) | EmailJS free plan | free |

> Free plans and their limits change. Where this guide names a limit (sleep after 15 minutes, hours per month, database idling) it is what the
> providers documented when this was written: check the current terms when you sign up. Nothing here needs a paid plan.

**What was and was not verified while writing this.** Verified here: the start script (migrate, seed once, retry, bad value, restart) and the API
in production mode (`APP_ENV=production`, https `APP_URL`, secure cookie, placeholder secrets refused, foreign origin refused), both against a real
MySQL. Verified by CI on every push (job *API Docker image*): the image builds, starts with Render's `PORT`, migrates, seeds, serves
`/api/health`, `/api/products` and the demo sign-in, and survives a restart. **Not verified:** the Render, Vercel, Stripe and database dashboards
themselves (no accounts were available): follow the steps, and if a button is named differently, the intent of the step is stated.

---

## Option B: one Vercel project with two services (P21)

The repository root has a `vercel.json` that declares **both** services: `backend` (`backend/Dockerfile`, `runtime: container`) and `frontend` (Vite),
with `/api/(.*)` routed to the backend and everything else to the frontend, on **one domain**. With it, Render is not needed, there is no
`YOUR-API-NAME` address to write into a file, and Stripe's webhook goes to `https://<project>.vercel.app/api/webhooks/stripe`.

- Import the repository in Vercel with **Root Directory = the repository root** (not `frontend`), and set the Render variables of the table in step 3
  and the Vercel variables of step 4 on the same project (one shared environment). `APP_URL` is the project's own address.
- Test locally with `vercel dev` (starts both services).
- **Not verified:** Vercel's multi-service mode and container runtime are newer than this guide's other steps and could not be tried here (no account).
  Open questions to check on the first deploy: which port the container must listen on (the image uses `$PORT`, default 80), whether the container
  sleeps and wakes like Render Free (the cold-start notes then apply), and whether the free plan allows the container runtime. If it does not work,
  fall back to Option A below: restore `frontend/vercel.json` from git history (commit `a2f43fd`), delete the root `vercel.json`, and use Render.
- `TRUSTED_PROXY_HOPS` is probably `1` in this layout (one proxy layer); the shared-bucket fallback applies if unsure.

The rest of this file describes Option A (Vercel + Render) in detail; the database, Stripe, environment-variable and troubleshooting sections apply to both.

> Using **Railway MySQL**? The database part (create, public TCP proxy, importing `backend/database/railway_import.sql`, variables) is in **docs/RAILWAY.md**.

## 0. Decide the names first (Option A) (the URLs depend on each other)

The API needs the web address of the frontend, and the frontend's `vercel.json` needs the address of the API. Choose both names now:

| | Choose | Resulting address |
|---|---|---|
| Render service name | `keymart-api` (must be unique on Render; add letters if taken) | `https://keymart-api.onrender.com` |
| Vercel project name | `keymart-shop` (unique on Vercel) | `https://keymart-shop.vercel.app` |

Use **these exact addresses** below. If Render or Vercel adds a suffix because the name was taken, use the address shown in their dashboard instead
and update the places that mention it (listed in step 7).

Generate the three secrets once and keep them (a password manager is fine). Never commit them.

```bash
openssl rand -hex 32        # JWT_SECRET
openssl rand -base64 32     # KEY_ENCRYPTION_KEY  (encrypts every game key in the database: losing or changing it makes stored keys unreadable)
```

## 1. Database

1. Create a **MySQL** service on the free plan (Aiven: *Create service > MySQL > Free plan*), in a region close to Render's (Frankfurt for an EU Render service).
2. Allow connections from anywhere (Aiven: *Allowed IP addresses* `0.0.0.0/0`). Render's free instances have no fixed address. The connection is encrypted and password-protected; keep the password strong.
3. Note the **host, port, database name, user, password**. The default database (Aiven: `defaultdb`) is fine: the app creates only tables, never the database.
4. TLS is mandatory on these hosts. Check the provider's CA:
   - Public CA (most hosts, TiDB Cloud): nothing to do, the image trusts the system bundle.
   - Private CA (Aiven): download `ca.pem`, and on Render add it as a **Secret File** named `ca.pem` (it appears at `/etc/secrets/ca.pem`); set `DB_SSL_CA=/etc/secrets/ca.pem`.
5. The checkout locks keys with `SELECT ... FOR UPDATE SKIP LOCKED` (MySQL 8.0.1+, MariaDB 10.6+). `LOCK_STRATEGY=auto` falls back to a plain lock on older servers; `php bin/doctor.php` shows which one a host gets.

If the host powers the database down when idle, the first request after a pause is slow; see "Cold starts" below. Optional sanity check from your own machine:

```bash
mysql -h <host> -P <port> -u <user> -p --ssl-mode=VERIFY_CA --ssl-ca=ca.pem <database> -e "select version()"
```

## 2. Stripe (test mode)

1. In the Stripe dashboard switch on **Test mode**.
2. *Developers > API keys*: copy the **Publishable key** (`pk_test_...`, goes to Vercel) and the **Secret key** (`sk_test_...`, goes to Render). The API refuses anything but a test secret key.
3. The webhook comes later, in step 6, because it needs the API's address and then gives you its signing secret.

## 3. API on Render

1. *New > Web Service > Build and deploy from a Git repository*, choose this repository and the branch you deploy.
2. **Language / Runtime:** Docker. **Root Directory:** `backend` (the `Dockerfile` is in it). **Instance Type:** Free. **Name:** `keymart-api`.
3. **Health Check Path:** `/api/health` (it also checks the database).
4. Add the environment variables below (*Environment*). Do **not** set `PORT`: Render sets it and the image listens on it.
5. *Create Web Service*. The first build takes a few minutes. Watch the logs: you should see `Applied: 001_users_auth.sql ...`, then `Demo data loaded` (first start only), then Apache starting.
6. Open `https://keymart-api.onrender.com/api/health`: `{"status":"ok","db":"ok"}`. (After a pause the first answer takes up to a minute, see "Cold starts".)

### Environment variables: Render (API)

| Variable | Value | Notes |
|---|---|---|
| `APP_ENV` | `production` | |
| `APP_DEBUG` | `false` | the app refuses to start with `true` on a public address |
| `APP_URL` | `https://keymart-shop.vercel.app` | the **frontend** address; used for the CSRF origin check and the links in e-mails |
| `COOKIE_SECURE` | `true` | |
| `JWT_SECRET` | 64 hex characters from step 0 | the placeholder from `.env.example` is refused |
| `KEY_ENCRYPTION_KEY` | base64 of 32 bytes from step 0 | the placeholder is refused; keep it forever |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASS` | from step 1 | |
| `DB_SSL` | `true` | encrypted connection |
| `DB_SSL_CA` | `/etc/secrets/ca.pem` | only for a private CA (step 1.4); leave unset for a public CA |
| `DB_SSL_VERIFY` | `true` (default) | `false` only as a last resort: it encrypts but does not check who answers |
| `STRIPE_SECRET_KEY` | `sk_test_...` | step 2 |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | from step 6; checkout works without it but orders never become paid |
| `RUN_MIGRATIONS` | `true` (default, you can omit it) | apply new `database/migrations/*.sql` on every start (safe to repeat); `false` to opt out |
| `SEED_ON_START` | `if-empty` (default, you can omit it) | create the demo catalogue and **game keys** when no game key exists yet. Without keys every game shows "Out of stock". `always` re-runs the idempotent seeder every start; `false` never |
| `TRUST_PROXY` | `true` | the API sits behind proxies; the client address comes from `X-Forwarded-For` |
| `TRUSTED_PROXY_HOPS` | `2` | Vercel + Render. If the address cannot be determined the limits fall back to one shared bucket (safe, never spoofable) |
| `RATE_LIMIT_REGISTER_PER_HOUR` | `30` (optional) | default 10 per address; behind the proxies several visitors may share one, which matters when a reviewer registers a few accounts |
| `CHECKOUT_CURRENCY` | `eur` (default) | |
| `EMAILJS_SERVICE_ID` `EMAILJS_AUTH_TEMPLATE_ID` `EMAILJS_PUBLIC_KEY` `EMAILJS_PRIVATE_KEY` | from docs/EMAIL.md | optional: the verification e-mail; without them it is skipped |
| `MAIL_COMPANY_NAME` `SUPPORT_EMAIL` `EMAIL_VERIFICATION_TTL_HOURS` | `KEYMART`, your address, `24` | optional |
| `CACHE_DRIVER` | `file` (default) | the instance disk is temporary, which is fine for a cache |

`CORS_ALLOWED_ORIGINS` stays **unset**: every browser request is same-origin through Vercel.

### How the container starts (`backend/docker-entrypoint.sh`)

```
RUN_MIGRATIONS=true  ->  php bin/migrate.php   (retried every 5 s, up to 12 times, so a database that is still waking up does not kill the deploy)
SEED_ON_START=...    ->  php bin/seed.php [--if-empty]
then                 ->  apache2-foreground    (listens on $PORT)
```

Migrations run before Apache starts, so a request can never reach a half-migrated schema. A failing migration stops the deploy with the error in the log.
Add a new migration to the repository and redeploy: it is applied on the next start.

## 4. Frontend on Vercel

1. In the repository edit **`frontend/vercel.json`**: replace `YOUR-API-NAME.onrender.com` with `keymart-api.onrender.com`, commit and push.
   (Vercel cannot read environment variables inside `vercel.json`, so the address has to be written in the file.)
   ```json
   { "source": "/api/:path*", "destination": "https://keymart-api.onrender.com/api/:path*" }
   ```
2. Vercel: *Add New > Project*, import the repository. **Root Directory:** `frontend`. Framework preset: Vite (build `npm run build`, output `dist`: already in `vercel.json`). **Project Name:** `keymart-shop`.
3. Add the environment variables below **before** the first deploy (they are baked into the build; changing one needs a redeploy).
4. *Deploy*. Open `https://keymart-shop.vercel.app`: the homepage shows banners and rails (the first load may wait for the API to wake up).

### Environment variables: Vercel (frontend, build time)

| Variable | Value | Notes |
|---|---|---|
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` | public by design. Empty: checkout says payments are not set up |
| `VITE_EMAILJS_SERVICE_ID` | from docs/EMAIL.md | optional (welcome and order e-mails) |
| `VITE_EMAILJS_PUBLIC_KEY` | EmailJS public key | public by design |
| `VITE_EMAILJS_AUTH_TEMPLATE_ID` | AUTH template id | |
| `VITE_EMAILJS_ORDER_TEMPLATE_ID` | ORDER template id | |
| `VITE_COMPANY_NAME` `VITE_SUPPORT_EMAIL` | `KEYMART`, your address | optional |

Do **not** set `VITE_API_BASE_URL`: the SPA calls the same-origin `/api`, which `vercel.json` forwards. Never put the Stripe secret key, the webhook secret or the EmailJS private key in Vercel.
Use the **production** domain (`keymart-shop.vercel.app`), not a preview URL: the API only accepts the origin set in `APP_URL`.

## 5. Check the wiring before touching Stripe

```bash
curl -s https://keymart-shop.vercel.app/api/health          # through Vercel -> Render -> database
curl -s "https://keymart-shop.vercel.app/api/products?pageSize=1"
```
Both must answer JSON. Then in the browser sign in with a demo account (docs/EMAIL.md: `demo.buyer@keymart.test` / `Demo-Buyer-2027`): the header shows the account menu and, after reload, you are still signed in (cookie works through the rewrite).

## 6. Register the Stripe webhook

1. Stripe dashboard (test mode) > *Developers > Webhooks > Add endpoint*.
2. **Endpoint URL:** `https://keymart-api.onrender.com/api/webhooks/stripe`: the **Render** address, not Vercel.
3. **Events to send:** `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`.
4. *Add endpoint*, then *Reveal* the **Signing secret** (`whsec_...`).
5. Render > your service > *Environment* > set `STRIPE_WEBHOOK_SECRET` to it > save (Render restarts the service).
6. Check: in Stripe, open the endpoint > *Send test webhook* > `payment_intent.succeeded`. The API answers `200` (a test event belongs to no order, so it is acknowledged and ignored). `400 invalid_signature` means the secret on Render is not this endpoint's secret (each endpoint has its own).

## 7. Test purchase (the acceptance check)

1. Open `https://keymart-shop.vercel.app`, sign in (demo account or *Register*).
2. Open any game, **Add to cart** on an offer, open the cart, **Checkout**, **Continue to payment**.
3. Card `4242 4242 4242 4242`, any future date, any CVC, any postcode. **Pay**.
4. You land on the payment page, which waits for the server ("Confirming your payment..."), then on the order: **Payment confirmed. Your keys are below.** *Reveal key* and *Copy* work.
5. Stripe dashboard > *Developers > Webhooks > your endpoint*: the `payment_intent.succeeded` delivery shows `200`.

If step 4 stays on "waiting for confirmation" for two minutes, the webhook did not arrive or was rejected: see the table below.

If a platform gave you a different address than step 0, update: `APP_URL` (Render), the destination in `frontend/vercel.json`, and the webhook URL (Stripe), then redeploy.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Render log: `Refusing to start with an unsafe configuration` | a placeholder secret, `APP_DEBUG=true` or `COOKIE_SECURE=false` with a public `APP_URL`. Fix the variable named in the message |
| Log: `Database not ready (attempt n of 12)` forever, then `giving up` | wrong `DB_*`, host not accepting outside connections, or TLS: set `DB_SSL=true` (and `DB_SSL_CA` for a private CA) |
| `SQLSTATE ... SSL ... certificate verify failed` | the host uses a private CA: add `ca.pem` as a Secret File and set `DB_SSL_CA` |
| API answers `403 csrf_rejected` from the site | `APP_URL` is not exactly the address in the browser bar (scheme, no trailing slash), or you are on a Vercel preview URL |
| Signed in, but the next page says signed out | `COOKIE_SECURE` is `false` while the site is https, or the `/api` rewrite points to a different host than the API |
| `503 payments_unavailable` at checkout | `STRIPE_SECRET_KEY` missing on Render |
| Card form never appears | `VITE_STRIPE_PUBLISHABLE_KEY` missing in Vercel (redeploy after adding it) |
| Order stays "waiting for confirmation" | webhook not delivered: check the endpoint URL (Render address), the three events, and `STRIPE_WEBHOOK_SECRET`; Stripe shows each attempt and its HTTP status, and can resend it |
| `429` on register | per-address limit; raise `RATE_LIMIT_REGISTER_PER_HOUR` |
| `504` / long wait on the very first request | the API was asleep: see below, wait a minute and reload |

## Cold starts (free tier) and the warm-up

- **Render Free spins a service down after about 15 minutes without traffic.** The next request wakes it: expect roughly **30 to 60 seconds** before the
  first answer. Through the Vercel rewrite that first request may even time out (`504`); a reload after a minute works.
- **Free databases may pause when idle** too, which adds to that first request. The start script retries for about a minute for this reason.
- **A purchase is not affected once started:** `POST /api/checkout` runs before the card is charged, so the API is awake when Stripe's webhook arrives a few seconds later.
- The SPA shows loading skeletons instead of a blank page while it waits.

**Warm-up suggestion (lightweight, optional):** ping the public health URL every 10 minutes, so the API and the database never idle long enough to sleep.
`/api/health` makes one `SELECT 1`; it is cheap.

| Option | How |
|---|---|
| UptimeRobot (free) | *Add monitor* > HTTP(s) > URL `https://keymart-shop.vercel.app/api/health` > interval 5 min (the free minimum) |
| cron-job.org (free) | new cron job, same URL, every 10 minutes |
| GitHub Actions | a scheduled workflow with `curl -fsS https://keymart-shop.vercel.app/api/health`; scheduled runs are best effort and GitHub disables them after 60 days without repository activity |

Trade-offs: keeping one free instance awake all month uses about 744 of Render's 750 free instance hours, so it only fits if this is your only free
service on the account. **Wake it by hand before a demo or an assessment** if you did not enable a monitor: open `https://keymart-shop.vercel.app/api/health` a minute earlier.
Pinging through the Vercel URL also proves the rewrite and the database in one request.

## Updating and rolling back

- **Backend:** push to the deployed branch; Render rebuilds, runs new migrations on start and swaps the instance. To roll back, redeploy a previous deploy from Render's *Events* tab (migrations are not undone: write a new one).
- **Frontend:** push; Vercel rebuilds. *Deployments > Promote* an earlier one to roll back.
- **Secrets:** rotating `JWT_SECRET` signs everybody out. Rotating `KEY_ENCRYPTION_KEY` makes every stored game key undecryptable: do not, unless you re-encrypt.
- **Reset the demo data:** empty the database (or create a new one) and redeploy; `SEED_ON_START=if-empty` loads it again.
