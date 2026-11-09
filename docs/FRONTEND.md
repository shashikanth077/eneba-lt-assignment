# Frontend app shell

React 19 + TypeScript (strict) + Vite, Redux Toolkit with RTK Query, MUI 9 themed from `docs/DESIGN_TOKENS.md`, React Router 7 (data router).
The shell is the frame every page lives in; the screens inside it (store, product, cart, checkout, home blocks) are placeholders until their own steps.

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
| `/` | home (placeholder) | public |
| `/store` | store (placeholder, shows its `?platform= ?genre= ?sort=` filters) | public |
| `/search?q=` | search results (placeholder) | public |
| `/product/:slug` | product page (placeholder) | public |
| `/login`, `/register` | working forms; honour `?next=` | public (signed-in users are sent on) |
| `/cart`, `/checkout`, `/account/orders` | cart summary / placeholder / order list | **signed-in only** (`ProtectedRoute`) |
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

## Shared loading / error / empty states
`LoadingState`, `ErrorState` (readable message + optional retry), `EmptyState` (message + action) and `QueryBoundary`, which wraps any RTK Query result so a screen only writes its happy path
(stale data keeps showing during a refetch; an error over existing data does not replace it).

## Testing
```bash
cd frontend
npm test                      # Vitest + Testing Library: 187 tests (redirect safety, errors, auth slice, protected-route round trips, search box, header, state components, homepage blocks, store query format and page behaviour)
npm run lint && npm run typecheck && npm run build
NODE_PATH=$(npm root -g) node e2e/shell.e2e.cjs      # 36 checks in a real browser against the real API (needs the stack running and Playwright installed)
SQL_CMD="mysql -uroot keymart" NODE_PATH=$(npm root -g) node e2e/home.e2e.cjs   # 20 checks: edits home_blocks/banners in the database, watches the page change, restores the rows
BASE_URL=http://localhost:5173 NODE_PATH=$(npm root -g) node e2e/store.e2e.cjs     # 22 checks: reload/second tab parity, Back/Forward, debounced slider (one request), pages, drawer, overflow
```
Component tests run the real routes, store and components against an in-memory fake of the API (`src/test/fakeApi.ts`); the browser script uses the real backend and database.
Use `http://localhost:5173` (not 127.0.0.1): the backend's CSRF origin allow-list names `localhost`, and it correctly rejects other origins.

## Known limits
- Search results, product page, cart editing and checkout are placeholders (cart and orders show real data through the shared states).
- Bundle: the entry chunk is about 511 kB (161 kB gzip), mostly MUI + Redux Toolkit; pages are split off. Worth revisiting after the real screens exist.
- The footer has only links to routes that exist; Eneba's help/legal pages are intentionally not faked.
- `e2e/shell.e2e.cjs` is not run by `npm test` (it needs a running stack and a browser); Playwright is not a project dependency.
