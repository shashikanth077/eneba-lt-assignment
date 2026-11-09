# Frontend app shell

React 19 + TypeScript (strict) + Vite, Redux Toolkit with RTK Query, MUI 9 themed from `docs/DESIGN_TOKENS.md`, React Router 7 (data router).
The shell is the frame every page lives in; the screens inside it are all built; see the sections below.

## Layout (what is on every page)
```
AppShell
 ├─ AppHeader        wordmark · SearchBox (live suggestions) · CartButton (count) · AccountMenu
 ├─ CategoryNav      Categories menu (genres) · All games · Deals · New releases · platforms   (platforms/genres come from GET /api/filters)
 ├─ <main>           the routed page, in a 1440px PageContainer
 └─ AppFooter
```
Mobile first: from `xs` the header is two rows (wordmark + icons, then the full-width search); from `md` it is one row. The nav bar scrolls sideways on a phone.
Checked at 375 px and 1280 px: no horizontal overflow on any route, and the suggestion list fits the screen.

## Routes
| Path | Screen | Access |
|---|---|---|
| `/` | home (block renderer, see below) | public |
| `/store` | store, all state in the query string | public |
| `/search?q=` | search results with did-you-mean | public |
| `/product/:slug` | product page with offers table | public |
| `/login`, `/register` | working forms; honour `?next=` | public (signed-in users are sent on) |
| `/cart`, `/checkout`, `/account/orders`, `/account/orders/:id` | cart / payment / order list / order with keys | **signed-in only** (`ProtectedRoute`) |
| `*` | not found | public |

Every screen is its own lazily loaded chunk. Adding a route is one line in `src/app/router.tsx`.

## Search suggestions (from any page)
`SearchBox` is in the header, so it exists on every route. Typing (>= 2 characters, debounced 250 ms) calls `GET /api/search/suggest`; the server ranks and tolerates typos,
the client shows the answer (cover, name, platform, "Out of stock" marker) and does not re-filter. Choosing a suggestion opens `/product/<slug>` and clears the box; Enter (or the form submit)
opens `/search?q=...`; the box shows the query while you are on `/search`. Loading, "No games match" and "suggestions unavailable" states are handled; suggestions are keyed by slug
because the same title exists on several platforms.

## Auth: protected routes redirect to login, then back
- The session is an HttpOnly cookie, so the page cannot read it. On start the app asks `GET /api/auth/me` once and keeps the answer in the `auth` slice:
  `unknown` (not asked yet) | `authenticated` | `anonymous` (401) | `error` (server unreachable, deliberately NOT treated as signed out).
- `ProtectedRoute` waits while `unknown` (so a signed-in user refreshing `/account/orders` is not bounced), shows a retry on `error`, redirects `anonymous` visitors to
  `/login?next=<path+query>` and renders the page otherwise. After login or registration the login page sends the user to `next`.
- `next` lives in the URL (survives a refresh and the Sign in <-> Register switch) and is validated by `safeNext()`: only same-site paths, never `//evil`, `/\evil`, absolute URLs,
  control characters, or the auth pages themselves (no open redirect).
- A 401 from any non-auth endpoint (the cookie expired) dispatches `sessionExpired`: status becomes `anonymous`, the API cache is dropped (the next person on this browser must not see
  the previous user's cart or orders), and the protected page redirects. The cache reset happens once per expiry, because resetting makes mounted pages refetch and a loop must not be possible.
- Signing out from a protected page: the menu sets `signingOut`, navigates home, then ends the session. The protected route remembers it saw the sign-out and shows "Signing out..." instead of
  redirecting to `/login`. (This fixed a real race: the router had moved on but React had not caught up, so the old page redirected to login and won.)

## Data layer
- `src/api/types.ts`: the API contract, hand-written (money in integer cents). `src/api/errors.ts`: reads `{error:{code,message,details}}`, field errors of a 422, and turns any error into a readable sentence.
- `src/app/api.ts`: the single RTK Query API (`/api`, same origin, cookies, `X-Requested-With: fetch` for the backend's CSRF check). Features add endpoints with `injectEndpoints`
  (`authApi`, `searchApi`, `catalogApi`, `cartApi`, `ordersApi`). In dev the Vite proxy plays the role of the Vercel rewrite.
- `src/app/store.ts`: `makeStore()` (tests build their own) with the API and auth reducers and a listener that clears the cache when a session ends.

## Homepage: a block renderer (`src/features/home`)
The page contains no content. `HomePage` asks `GET /api/home/layout`; `HomeBlocks` renders each returned block through the registry in `blockRegistry.ts`
(`hero` -> `BannerCarousel`, `carousel` -> `ProductRail`). Each block fetches its own data from the `endpoint` the layout gave it, so it has its own skeleton,
its own error state with retry, and its own React error boundary (`BlockBoundary`): a block that fails, returns a malformed payload or throws while rendering
shows a small error panel and the rest of the page is untouched.
- Reorder or disable: change `home_blocks.position` / `enabled` in the database and reload; no frontend change. The layout is refetched on every visit (`refetchOnMountOrArgChange`).
- A new block that reuses an existing `type` needs nothing in the frontend. An unknown `type` (checked with `Object.hasOwn`, so `constructor` is not a hit) is skipped silently.
- Data coming from the database is treated as untrusted: `blocks.ts` accepts only endpoints of the form `/api/<segments>` (no other origin, no `..`), drops malformed
  list items instead of failing the block, and removes unsafe `href`s from banners (the slide stays, without its link).
- A hero with no banners or a rail with no products renders nothing (a block with nothing to show is not an error); if every block is disabled the page says so.
- Hero autoplay comes from `config.autoplayMs` (ignored below 2000 ms), pauses on hover/focus and is off under `prefers-reduced-motion`.

## Store (`src/features/store`): the address bar is the state
`/store` keeps every filter, the sort, the search text and the page in the query string and nowhere else, so a reload, a shared link and Back/Forward all reproduce the view.
```
/store?q=witch&platform=steam&platform=xbox&region=europe&genre=Action&price_min=500&price_max=3000&sort=price_asc&page=2
```
- `storeQuery.ts` is the only place that knows the format: `parseStoreQuery` (URL -> state), `toSearchParams` (state -> canonical URL), `productsArg`/`facetsArg` (state -> API query string).
  Multi-select groups use repeated keys; prices are cents (the API's unit); defaults (`sort=popular`, `page=1`) are left out; list values are sorted so one selection is one cache entry.
  Hand-edited or stale addresses are **repaired, never trusted** (page `-3` -> 1, unknown sort -> default, `sort=relevance` without a search text -> default, min > max swapped, 100-character search cap).
- `useStoreQuery` reads the address and updates it with a functional `setSearchParams`, so two quick updates cannot overwrite each other. Any change except the page returns to page 1.
  If you are on the default sort, the default moves with the search text (relevance when searching, popularity otherwise), so adding a search never leaves a stray `sort=popular` behind.
- **History:** every discrete change (tick, sort, page, chip, price) is a new history entry, so Back undoes it. Typing in the search box *replaces* the entry (one entry per keystroke pause would flood Back).
- **Debounce:** the price slider keeps a local draft while you drag and writes the address 400 ms after it rests (so one request, not one per pixel); the search box does the same. Both follow the address
  when it changes by other means (Back, a chip's x, Clear all). Dragging the slider back to both ends removes the price filter from the address.
- **RTK Query caching:** `getProducts` and `getFilters` take the query string as their argument, so the cache key is the exact request. Going Back to a view seen in the last 60 s makes no request; the unfiltered
  `/api/filters` call (also used by the navigation bar) is made once and gives the slider its catalog-wide bounds, which therefore do not shrink while other filters narrow the results.
  Filtered `/api/filters` calls give the option counts (the API leaves each group's own choice out of its count, so you can still add a second platform).
- **Layout:** sidebar docked from `lg` (264 px, filter panel colour), otherwise one `FilterSidebar` instance inside a `Drawer` opened by a "Filters" button with an active-count badge; changes apply immediately and the
  drawer's button says "Show N games". Grid: 2 / 3 / 4 columns, `minmax(0, 1fr)`. Pagination (MUI) is in the address; infinite scroll was not chosen because it cannot be reproduced from a URL.
- States: skeleton grid on first load, previous results dimmed while a new view loads, error with retry, "No games match" with Clear all, "There is no such page" (page past the end) with a link to page 1.
- A selected value the API no longer lists (e.g. a stale link) stays visible as a ticked option so it can be undone.
- `ProductCard` follows DESIGN_TOKENS.md section 6: cover 267 x 337, platform strip (27 px), 14 px/700 single-line title, region label, "From" row with the green discount, 22 px/800 price. The reference's cashback
  badge and line are not built: this shop has no cashback, so there is nothing true to show.
- Header search still goes to the `/search` placeholder (built in a later task); the store has its own search box.

## Search results (`/search?q=&page=`) and product page (`/product/:slug`)
**Search.** The query and page live in the address. Results come from `GET /api/search` (every item has a 0..1 `score`, out-of-stock matches included and shown as "Out of stock").
- *Did you mean:* on page 1, when the best score is below `WEAK_SCORE` (0.75; exact and partial names score 0.85-1.0, typos about 0.5-0.7, see docs/SEARCH.md), an info alert appears. `suggestQuery` (`lib/didYouMean.ts`)
  repairs each query word using the words of the best match's title: a word that is a title word, or the start of one (still typing), is kept; any other word becomes the closest title word if within about one
  edit per three letters. The alert links to `/search?q=<repaired>`; if nothing sensible can be suggested it says "We found no close match. These are the closest games." The weak matches stay listed. The API has no
  suggestion field, so this is computed in the browser from data the API already returns (a server-side "did you mean" over all titles would be better; noted as a limit).
- Empty state (no match, names the query, links to the store), no-query state (no request is made), page past the end, skeleton, error with retry.

**Product page.** Cover (the catalog has one generated cover per game, so there is no gallery to build), name, platform/region/genre chips, publisher and release date, description, "From" price (cheapest *buyable* offer),
then the offers table.
- *Accessible table* (`OfferTable.tsx`): MUI table with a screen-reader caption ("Offers for X. 3 sellers. Use the column buttons to sort."), `th scope="col"` headers, the seller as `th scope="row"`, sortable columns as
  buttons inside the header with `aria-sort`, rating as `role="img"` "Rated 4.4 out of 5", every action button named after its seller ("Add GameNest's offer to cart"). "Best price" is a text chip plus a left border, never colour alone.
- *Sorting* (`offers.ts`, pure and unit-tested): seller, rating, stock, price; default price ascending; rating and stock start biggest-first; ties fall back to price then id. The offer's region is the product's (one region per product here), shown as a column so the table matches the brief.
- *Best price:* the cheapest **buyable** offer, all of them on a tie, and only when at least two offers are buyable (one offer has nothing to be best against).
- *Edge cases:* one offer (no highlight, a note that there is nothing to compare, still buyable); an offer with 0 stock (greyed, "Out of stock", disabled "Unavailable", never best, ignored by "From"; the API only lists buyable offers, so this is defensive);
  a game with no buyable offers (message and link to the store, no table, "Out of stock" instead of a price); low stock ("Only 3 left", at 5 or fewer); unknown slug (not-found state); server error (retry).
- *Add to cart:* signed in -> `POST /api/cart {offerId}` (server-side cart; the same offer again raises the quantity), the `Cart` tag is invalidated so the header badge refetches, the row shows "In your cart: n" from the server's cart, errors
  (e.g. 409 insufficient stock) appear in the row. Signed out -> `/login?next=<this page>` and back; the item is **not** added automatically after signing in (the person clicks again).

## Sign-up, cart, checkout, orders (`features/auth`, `cart`, `checkout`, `orders`, `email`)
**Forms** (`/login`, `/register`): client checks in `validation.ts` (email shape, name 2-50, password 8+) show a field's message after the field was left or the form submitted, and block the request; the server validates again
and its answers are shown: field errors (422) under the field, everything else (wrong password, `email_taken`, throttling with "try again in N min") in an alert. A blank helper line is reserved under the email and password
fields: without it the message appearing on blur pushed the "Create an account" link down under the pointer and the click was lost (found by the shell e2e script).

**Cart** (`/cart`): lines with seller, unit price, quantity stepper (1 to min(5, stock)), remove, line totals, and the **server's** total. Every change is a PATCH/DELETE; the server answers with the recomputed cart
(prices and stock read live), and the header badge follows. Server-flagged lines (inactive, out of stock) show their message and block "Go to checkout".

**Checkout** (`/checkout`): the summary is the server's cart. Visiting holds no stock; "Continue to payment" calls `POST /api/checkout` **with no body** (the server builds order and amount from its cart), which reserves the keys
and creates the PaymentIntent. Then Stripe's Payment Element (`@stripe/react-stripe-js`, dark theme from the tokens) renders for the returned `clientSecret`; the Pay button shows the amount **the server** put on the intent.
`confirmPayment(redirect: 'if_required')`: a declined card shows Stripe's message and the form stays for another try; success (or a redirect-based method returning to `return_url`) goes to the order page. Refusals before payment
are explained: `409 out_of_stock` names the items ("you want 2, 1 left"), `503` says payments are unavailable. Only a Stripe **test** publishable key (`pk_test_...`) is accepted; a live key is refused in `stripe.ts`.
The browser's "payment succeeded" never unlocks anything: the order page asks the server.

**Order page** (`/account/orders/:id`, protected): while the order is `pending` (card taken, webhook not here yet) it says "waiting for confirmation" and asks the server every 2 s, flips to the keys by itself when the
webhook marks it paid, and after 2 minutes stops polling and offers "Check again". Other states (failed, expired, canceled, refund needed, refunded) each say what happened. Someone else's order is "not found" (the API answers 404).
Keys render **only here**: hidden behind "Reveal key" per key (Hide, and a Copy button using the Clipboard API with a visible fallback message), not in the list, the URL, storage or any email, and the order query has
`keepUnusedDataFor: 0` so the keys leave the browser's memory when the page closes. When an order becomes paid the `Cart` and `Orders` caches are invalidated (the bought lines left the cart server-side).
**Order list** (`/account/orders`): newest first, paginated in the address, each row links to its order.

**Emails (EmailJS, browser-side, public key, docs/ARCHITECTURE.md)**: a welcome email right after a successful registration (sent to the address the *server* stored), and a receipt when an order this browser paid for
becomes paid. The receipt params are copied field by field (`to_email, to_name, order_id, order_items, order_total`): keys cannot be included (a test asserts none of the keys appears anywhere in what is sent).
"This browser paid" is a localStorage flag set when the buyer presses Pay and consumed once: opening an old order, or reloading, never sends another email. Limits, stated plainly: it is sent from the browser, so
it is not guaranteed (closing the tab before the order turns paid, or blocked storage, means no email; the on-screen confirmation is the source of truth) and a technical user could trigger extra receipts to their own address.
If EmailJS is not configured (`VITE_EMAILJS_*`), or fails, the app carries on; failures are logged, never shown as errors. Template variables: welcome `{{to_email}} {{to_name}}`; order `{{to_email}} {{to_name}} {{order_id}} {{order_items}} {{order_total}}`.

**Configuration** (frontend/.env or docker-compose from the root .env): `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...`, `VITE_EMAILJS_SERVICE_ID`, `VITE_EMAILJS_PUBLIC_KEY`, `VITE_EMAILJS_WELCOME_TEMPLATE_ID`, `VITE_EMAILJS_ORDER_TEMPLATE_ID`.
Backend keeps `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`; locally run `stripe listen --forward-to localhost:8080/api/webhooks/stripe` so the webhook reaches the API. Without the webhook the order stays "waiting for confirmation".

## Shared loading / error / empty states
`LoadingState`, `ErrorState` (readable message + optional retry), `EmptyState` (message + action) and `QueryBoundary`, which wraps any RTK Query result so a screen only writes its happy path
(stale data keeps showing during a refetch; an error over existing data does not replace it).

## Testing
```bash
cd frontend
npm test                      # Vitest + Testing Library: 291 tests (redirect safety, errors, auth slice, protected-route round trips, search box, header, state components, homepage blocks, store, search, product, cart, checkout, order and auth pages, EmailJS, offer sorting, did-you-mean)
npm run lint && npm run typecheck && npm run build
NODE_PATH=$(npm root -g) node e2e/shell.e2e.cjs      # 36 checks in a real browser against the real API (needs the stack running and Playwright installed)
SQL_CMD="mysql -uroot keymart" NODE_PATH=$(npm root -g) node e2e/home.e2e.cjs   # 20 checks: edits home_blocks/banners in the database, watches the page change, restores the rows
BASE_URL=http://localhost:5173 NODE_PATH=$(npm root -g) node e2e/store.e2e.cjs     # 22 checks: reload/second tab parity, Back/Forward, debounced slider (one request), pages, drawer, overflow
SQL_CMD="mysql -uroot keymart" NODE_PATH=$(npm root -g) node e2e/product.e2e.cjs   # 21 checks: typo -> did you mean, offers table, sorting, sign-up, two offers -> badge 2, single/no offers via SQL (restored)
SQL_CMD=... NODE_PATH=$(npm root -g) node e2e/commerce.e2e.cjs   # 27 checks: sign-up, cart editing, pending order -> signed webhook -> keys appear by themselves, reveal/copy (API started with STRIPE_WEBHOOK_SECRET=whsec_e2e)
```
Component tests run the real routes, store and components against an in-memory fake of the API (`src/test/fakeApi.ts`); the browser script uses the real backend and database.
Use `http://localhost:5173` (not 127.0.0.1): the backend's CSRF origin allow-list names `localhost`, and it correctly rejects other origins.

## Known limits
- The real card payment (Stripe.js + a Stripe account) could not be exercised in the development sandbox; see docs/ai-log/P14.md for what was checked instead.
- Bundle: the entry chunk is about 511 kB (161 kB gzip), mostly MUI + Redux Toolkit; pages are split off. Worth revisiting after the real screens exist.
- The footer has only links to routes that exist; Eneba's help/legal pages are intentionally not faked.
- `e2e/shell.e2e.cjs` is not run by `npm test` (it needs a running stack and a browser); Playwright is not a project dependency.
