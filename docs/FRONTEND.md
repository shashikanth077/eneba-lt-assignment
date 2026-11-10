# Frontend (as built)

React 19 + TypeScript (strict) + Vite · **Redux Toolkit** (`configureStore`, `createSlice`, typed hooks) + **Redux Saga** for every request and
side effect · React Router 7 · **Axios** · React Hook Form + **zod** · **SCSS modules** (tokens from `docs/DESIGN_TOKENS.md`) · Lucide icons ·
Stripe.js (Payment Element, test mode) · EmailJS. No TanStack/React Query, no other state library, no thunks (`createAsyncThunk`) next to the sagas.
`src/` is organised by feature; `npm run lint && npm run typecheck && npm test && npm run build` must stay clean.

## Data flow (one direction, no API call in a component)
```
component --dispatch(fetchProductRequest(key))--> slice (marks loading) --> saga --call--> featureService --> Axios apiClient --> API
component <--useAppSelector(selectProductEntry(key))-- slice <--put(success | failure)-- saga <--------------------- response
```
- **Slice** (`xSlice.ts`): state + synchronous reducers named request / success / failure; it never touches the network.
- **Saga** (`xSaga.ts`): `takeLatest` / `takeEvery` watchers call the service, then `put` success or a *serialised* failure; cancellation, polling (`race` + `delay`), side effects (toasts, e-mails, refreshing the cart).
- **Service** (`xService.ts`): the only code that knows paths and bodies; uses `services/api/apiClient.ts`.
- **Selectors** (`xSelectors.ts` or next to the slice): the only way components read state; derived values (cart count) are computed, never stored.
- **Errors** are stored as plain data (`SerializedApiError {status, code, message, details}`, see `services/api/apiErrorHandler.ts`), so they can live in Redux and be shown or inspected (`409 out_of_stock` details, `422` field errors, `429` waits).

### The request cache (`utils/keyed.ts`, `utils/keyedSaga.ts`)
Resources that depend on a key (a query string, a slug, a page) are stored as `Record<key, {status, data?, error?, fetchedAt}>`. A request for a key whose entry is fresh (< 60 s) and
not forced makes **no HTTP request** (Back to a view you just saw is instant); two requests for the same key at the same time share one; a refresh or a failure keeps the last good `data` so
screens can keep showing it. `createKeyedWatcher` builds the saga for each resource, with its in-flight set per saga (so per store). This replaces what RTK Query gave us, in ~100 lines that can be read.

### Client (`services/api/`)
`apiClient.ts` (base URL `/api` or `VITE_API_BASE_URL`, 15 s timeout, credentials, `X-Requested-With: fetch` for the backend's CSRF check, the `fetch` adapter so tests can swap `fetch`, one
interceptor: a 401 from anything except the auth probes tells the store the session ended) · `apiEndpoints.ts` (every path) · `apiErrorHandler.ts` (error normalisation, readable messages).
There is no token storage on purpose: the session is an HttpOnly cookie that JavaScript cannot read (`services/storage/safeStorage.ts` only wraps `localStorage` for the receipt flag).

## Folders
```
src/
  app/            store.ts (+ saga middleware), rootReducer.ts, rootSaga.ts, hooks.ts, router.tsx, App.tsx, RouteErrorBoundary.tsx
  components/
    common/       Button, Input, Select, Checkbox, Chip, Alert, Loader/Skeleton, Modal (dialog + drawer), Menu, Pagination, PriceDisplay, SearchInput
    layout/       MainLayout, Header (SearchBox, CartButton, AccountMenu), Navigation, Footer, Sidebar, PageContainer, Logo
    feedback/     ErrorMessage, EmptyState, Toast (ToastRegion)
  features/       auth, home, products, cart, checkout, orders, ui(toasts)   each: components/ pages/ xSlice xSaga xService xTypes (+ selectors)
  services/       api/ (client, endpoints, errors), email/ (EmailJS, receipt flag), storage/
  hooks/          useDebounce, useMediaQuery        utils/  formatCurrency, formatDate, constants, redirect, didYouMean, keyed, classNames
  styles/         variables.scss (tokens), mixins.scss (breakpoints, focus ring), global.scss (reset, CSS custom properties)
  types/          api.types.ts (the backend contract), common.types.ts       test/  fake API + backends used by the tests
```
Every screen is its own lazily loaded chunk; the entry chunk is ~259 kB (83 kB gzip, down from 511 kB with MUI).

## Routes
| Path | Screen | Access |
|---|---|---|
| `/` | home (block renderer) | public |
| `/store` | product listing, all state in the query string | public |
| `/search?q=` | search results with did-you-mean | public |
| `/product/:slug` | product page with offers table | public |
| `/login`, `/register` | validated forms; honour `?next=` | public (signed-in users are sent on) |
| `/cart`, `/checkout` | cart editing / order summary + Stripe | **signed in** (`ProtectedRoute`) |
| `/orders`, `/orders/:id` | order history / one order with its keys | **signed in** |
| `/payment/success?order=ID`, `/payment/cancel` | where Stripe sends the buyer | **signed in** |
| `*` | not found | public |

## Auth (`features/auth`)
`authSlice` holds `status` (unknown / authenticated / anonymous / error), the user, `signingOut`, and the form states; `authSaga` bootstraps (`GET /auth/me`, 401 = anonymous, anything else = `error`, which is
*not* "signed out"), logs in/out and registers (and sends the welcome e-mail). `ProtectedRoute` waits while the status is unknown, sends anonymous visitors to `/login?next=<page>`, and has a "leaving" mode so
a sign-out cannot race the navigation home (the flag is set by the very action that starts the sign-out). Signing out or a session expiry resets cart, checkout and orders in the store; an expiry counts only
the first time. Forms are React Hook Form + zod (`authSchemas.ts`): messages after the field was left or the form submitted, the server's field errors (422) shown under the fields, everything else in an alert.
A blank helper line is reserved under each field so a message appearing cannot move a link out from under the pointer.

## Homepage (`features/home`): a block renderer
`HomePage` asks `GET /api/home/layout` (forced on every visit); `HomeBlocks` renders each block through `blockRegistry.ts` (`hero` -> `BannerCarousel`, `carousel` -> `ProductRail`). Each block dispatches its own
request for its own `endpoint`, shows its own skeleton, error and retry, inside its own error boundary: one failing block never breaks the page. No content is hardcoded. Data from the database is untrusted
(`blocks.ts`: endpoints must look like `/api/<segments>`, malformed items are dropped, unsafe banner links removed, unknown types skipped with `Object.hasOwn`). Reordering or disabling a block in
`home_blocks` changes the page on refresh with no frontend change. The carousel respects `prefers-reduced-motion`, pauses on hover/focus **and has a pause button**; its dots have 24 px hit areas.

## Store (`features/products`, `/store`): the address bar is the state
`/store?q=witch&platform=steam&platform=xbox&region=europe&genre=Action&price_min=500&price_max=3000&sort=price_asc&page=2` is parsed by `productsQuery.ts` (the only place that knows the format; invalid values are
repaired, never trusted), `useStoreQuery` updates it (any change but the page returns to page 1; on the default sort the default follows the search text), and the page dispatches
`fetchProductsRequest(<query string>)`. Every discrete change is a history entry (Back undoes it); typing in the search box replaces the entry. The price slider (two native range inputs, so keyboard and screen-reader
support are the browser's) and the search box keep a local draft and write the address 400 ms after they rest. Option counts come from `/api/filters` under the current filters; the catalogue-wide price bounds from the
unfiltered call, so the slider does not shrink while filtering. The filters are a docked `Sidebar` from 1200 px, otherwise the same component inside a `Modal` drawer. Sorting uses a native `<select>`.
States: skeleton, previous results dimmed while a new view loads, error + retry, empty + "Clear all filters", page past the end.

## Search results and product page
**Search:** `/search?q=&page=`; on page 1, when the best score is below 0.75 an alert offers "Did you mean ...?" (`utils/didYouMean.ts` repairs each word from the best match's title, null when nothing would change);
empty, no-query, error, past-the-end states. **Product page:** cover, badges, details, "From" price (cheapest *buyable* offer) and the offers table: caption, `th scope="col"`, seller as `th scope="row"`, sortable columns
with `aria-sort`, rating as `role="img"` text, "Best price" as a chip + border (the cheapest buyable offer(s), only when at least two are buyable). One offer: no highlight and a note. Out of stock: disabled
"Unavailable". No buyable offers: message + link. Buttons are named with their visible text first ("Add to cart, offer from GameNest"). Add to cart is `addToCartRequest`; a signed-out visitor is sent to
`/login?next=<this page>`; the row shows "In your cart: n" and any server error.

## Cart, checkout, payment, orders
- **Cart** (`/cart`): lines with quantity steppers (1 to min(5, stock)), remove, and the **server's** total; every change is a PATCH/DELETE answered with the recomputed cart; flagged lines block checkout. Per-line pending/error state lives in the slice.
- **Checkout** (`/checkout`): summary from the server cart; visiting reserves nothing. "Continue to payment" sends `POST /api/checkout` with **no body** (the server builds order and amount), then Stripe's Payment Element renders for the returned
  client secret and the Pay button shows the server's amount. Only `pk_test_` keys are accepted. A declined card shows Stripe's message and keeps the form; `409 out_of_stock` names the items. `confirmPayment` is the one call that is not
  saga + Axios (Stripe.js talks to Stripe directly so card data never touches us); it lives in `PaymentMethod` with a comment saying why.
- **Payment result** (`/payment/success?order=ID`, Stripe's `return_url` too): never trusts the redirect. It polls the order and moves on to `/orders/ID` once the server says paid; failed/expired orders get a clear message;
  `redirect_status=failed` and `/payment/cancel` say nothing was charged.
- **Order page** (`/orders/:id`): `startOrderPolling` runs a saga that asks every 2 s while the order is `pending` ("waiting for confirmation"), stops when it settles, and gives up after 2 minutes with "Check again". Keys render **only here**,
  hidden behind "Reveal key" (Hide, Copy with a clipboard fallback message); they are not in the list, URL, storage or e-mails, and leaving the page dispatches `leaveOrder`, which removes them from the store. Someone else's order is "not found".
- **When an order becomes paid** the saga refreshes the cart (bought lines left it), invalidates the orders list and sends the receipt e-mail once.

## E-mails (EmailJS, browser, public key; docs/ARCHITECTURE.md)
A welcome e-mail after registration (to the address the *server* stored) and a receipt when an order this browser paid for becomes paid. Params are copied field by field (`to_email, to_name, order_id, order_items, order_total`) so a key cannot be
included; "this browser paid" is a localStorage flag set when Pay is pressed and consumed once. Not configured or failing: skipped silently. Limits and the O1 abuse risk are in docs/REVIEW.md.
Config (`frontend/.env`): `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_EMAILJS_*`, optional `VITE_API_BASE_URL`; backend keeps `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` (run `stripe listen --forward-to localhost:8080/api/webhooks/stripe`).

## Styling
SCSS modules per component (`X.module.scss`), design tokens as SCSS variables and CSS custom properties (`styles/`), breakpoints via `@include up(md)`, a shared focus ring, `prefers-reduced-motion` respected. The only place JS needs colours is Stripe's
iframe (`utils/constants.ts`). Placeholder text uses `#c4aaf0` (4.5:1) instead of the measured `#ad8fe4` (3.9:1).

## Accessibility
axe-core (WCAG 2.0-2.2 A/AA) finds **no violations** on home, store (plain and filtered), search, product, login, register, cart, checkout and orders. Dialogs trap focus and return it; menus and the search combobox follow the ARIA patterns
(keyboard: arrows, Escape, Enter); every control has a visible label or a name that starts with its visible text. Not done: per-route page titles and focus/announcement on navigation (docs/REVIEW.md O5).

## Testing
```bash
cd frontend
npm test                      # Vitest + Testing Library: slices, sagas (against the in-memory fake API), components, pages
npm run lint && npm run typecheck && npm run build
# browser scripts against the real stack (API on :8080 with RATE_LIMITS_ENABLED=false and STRIPE_WEBHOOK_SECRET=whsec_e2e, `npm run dev` on :5173):
BASE_URL=http://localhost:5173 NODE_PATH=$(npm root -g) node e2e/shell.e2e.cjs      # 36 checks
BASE_URL=http://localhost:5173 NODE_PATH=$(npm root -g) node e2e/store.e2e.cjs      # 22 checks
SQL_CMD="mysql -uroot keymart" NODE_PATH=$(npm root -g) node e2e/home.e2e.cjs       # 20 checks
SQL_CMD="mysql -uroot keymart" NODE_PATH=$(npm root -g) node e2e/product.e2e.cjs    # 21 checks
NODE_PATH=$(npm root -g) node e2e/commerce.e2e.cjs                                  # 28 checks: sign-up, cart, pending order -> signed webhook -> keys
```
Component and page tests run the real routes, store and sagas against an in-memory replacement of `fetch` (`src/test/fakeApi.ts`), so the Axios client is exercised too. Use `http://localhost:5173` (not 127.0.0.1): the backend's CSRF
origin list names `localhost`. The real card payment (Stripe.js + a Stripe account) cannot run in the development sandbox: the tests use stand-ins for `@stripe/*` and the browser script plays Stripe's part with a signed webhook.
