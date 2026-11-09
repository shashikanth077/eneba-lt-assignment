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

## Shared loading / error / empty states
`LoadingState`, `ErrorState` (readable message + optional retry), `EmptyState` (message + action) and `QueryBoundary`, which wraps any RTK Query result so a screen only writes its happy path
(stale data keeps showing during a refetch; an error over existing data does not replace it).

## Testing
```bash
cd frontend
npm test                      # Vitest + Testing Library: 69 tests (redirect safety, errors, auth slice, protected-route round trips, search box, header, state components)
npm run lint && npm run typecheck && npm run build
NODE_PATH=$(npm root -g) node e2e/shell.e2e.cjs      # 36 checks in a real browser against the real API (needs the stack running and Playwright installed)
```
Component tests run the real routes, store and components against an in-memory fake of the API (`src/test/fakeApi.ts`); the browser script uses the real backend and database.
Use `http://localhost:5173` (not 127.0.0.1): the backend's CSRF origin allow-list names `localhost`, and it correctly rejects other origins.

## Known limits
- Home, store, search results, product page, cart editing and checkout are placeholders (cart and orders show real data through the shared states).
- Bundle: the entry chunk is about 511 kB (161 kB gzip), mostly MUI + Redux Toolkit; pages are split off. Worth revisiting after the real screens exist.
- The footer has only links to routes that exist; Eneba's help/legal pages are intentionally not faked.
- `e2e/shell.e2e.cjs` is not run by `npm test` (it needs a running stack and a browser); Playwright is not a project dependency.
