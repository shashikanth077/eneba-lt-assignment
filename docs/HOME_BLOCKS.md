# Homepage blocks

The homepage is assembled from independent blocks. The backend owns **what** is shown and **in which order**; the frontend only
renders what it receives. Nothing (block list, order, titles, product names, prices, banner text) is hardcoded in the frontend.

```
GET /api/home/layout ──▶ { blocks: [ {id,type,title,endpoint,config}, ... ] }      (enabled rows of home_blocks, by position)
        │
        └─ for each block, the frontend calls block.endpoint ──▶ GET /api/home/banners | best-sellers | deals | new-releases
```

## Endpoints
| Endpoint | Source | Response | Cache TTL |
|---|---|---|---|
| `GET /api/home/layout` | `home_blocks` (`enabled = 1`, by `position`) | `{ blocks: [{ id, type, title, endpoint, config }] }` | none (one tiny query; disabling must be instant) |
| `GET /api/home/banners` | `banners` | `{ items: [{ id, imageUrl, title, subtitle, ctaLabel, href }] }` | 5 min |
| `GET /api/home/best-sellers` | `product_stats.units_sold` | `{ items: ProductCard[] }` | 10 min |
| `GET /api/home/deals` | `deals` | `{ items: (ProductCard + originalPriceCents)[] }`, biggest discount first | 2 min (deals expire) |
| `GET /api/home/new-releases` | `products.release_date` | `{ items: ProductCard[] }`, released, newest first | 10 min |

- `id` is the block's slug; `type` names the frontend component (`hero`, `carousel`); `endpoint` is where its data lives; `config` is the row's JSON
  (`limit` for carousels, `autoplayMs` for the hero; `{}` when empty).
- Block endpoints list only **buyable** products (active offer + an available key). Cards have the same shape as the catalog's `ProductCard`;
  the deals block adds `originalPriceCents` because it must show the crossed-out price. `limit` is clamped to 1-50 (default 10).
- **Disabled or unknown block:** a row with `enabled = 0` disappears from the layout and its endpoint answers `404 not_found`. A row whose slug has no
  backend class is left out of the layout (the frontend is never sent an endpoint that would 404).

## How the blocks stay independent
`App\Home\HomeBlock` is the only thing they share:
```php
interface HomeBlock { slug(): string; path(): string; fetch(array $config): array; }
```
Each of `BannersBlock`, `BestSellersBlock`, `DealsBlock`, `NewReleasesBlock` is a `final` class that extends nothing, uses no trait, depends only on a `PDO`
and its **own** `TtlCache`, and imports nothing but those two types and the interface. It owns:
- **its queries** (three blocks show product cards, and each deliberately carries its own SQL and card mapping: roughly 40 duplicated lines per block
  are the price of being able to move a block into its own service by copying one file and the table it reads);
- **its payload shape**, and **its caching**: its own cache namespace/folder (`<CACHE_DIR>/<slug>/`), its own TTL, and a key that includes everything the
  output depends on (`limit`; for new releases also the day, because `CURDATE()` changes at midnight).

What *is* shared is infrastructure around the blocks, not between them: the layout/gating (`HomeLayout`, `HomeController`), the registry, and the cache implementation.
`HomeTest::testBlocksShareNothingBeyondTheBaseInterface` enforces the rules above with reflection and a scan of each file's `use` lines, so a future edit that couples
two blocks fails the build.

Failure isolation comes for free: each block is its own request. A block that errors (or is slow) leaves the others untouched; the frontend shows a per-block error.

## Caching
`App\Cache\TtlCache::remember($key, $ttl, $producer)`. Implementations: `FileTtlCache` (default, `CACHE_DRIVER=file`, JSON files under `CACHE_DIR`, atomic write via
temp file + rename) and `NullTtlCache` (`CACHE_DRIVER=none`, used by the tests). Best-effort by design: an unwritable directory or a corrupt file is a plain
cache miss, never an error. Known limits: no stampede protection (concurrent requests may each recompute once after expiry, fine for these cheap queries) and the
container filesystem is ephemeral on free hosting, so the cache is per-instance and cleared on redeploy. An APCu or Redis driver would be one more class
implementing `TtlCache` (not built: no APCu in the CLI/Docker image by default). Data changes inside a TTL are intentionally not visible until it expires.
Measured locally: `/api/home/best-sellers` 6.5 ms cold, 3 ms cached (mostly PHP bootstrap; the saved SQL is small at 120 products and grows with the catalog).

## Adding a new block (backend)
1. Create `src/Home/Blocks/<Name>Block.php`: `final class ... implements HomeBlock`, constants `SLUG` and `PATH` (`/api/home/<name>`), constructor `(PDO, TtlCache)`,
   `fetch()` returning its payload, wrapped in its own `$this->cache->remember(...)`.
2. Add the class to `config/home.php` and a definition next to the others in `config/container.php` (its own cache namespace = its slug).
3. Insert a `home_blocks` row (`slug`, `type`, `title`, `endpoint` = the block's `PATH`, `position`, `config`).
That is all: the route is registered from the class constant, and the layout picks the row up. `HomeTest` fails if a row and a block ever disagree on the endpoint.

## Frontend contract (built in `frontend/src/features/home`, see docs/FRONTEND.md)
The page asks `GET /api/home/layout` once, then renders each block with a renderer chosen by `type`:
```ts
const renderers: Record<string, ComponentType<{ block: HomeBlockMeta }>> = { hero: HeroBlock, carousel: ProductCarousel };
// each renderer fetches block.endpoint itself (one saga-backed request per endpoint, keyed by the URL), so it has its own loading/error state
blocks.map((b) => { const R = renderers[b.type]; return R ? <R key={b.id} block={b} /> : null; });  // unknown type: skipped, never a crash
```
A new block that reuses an existing `type` needs no frontend change at all; a new `type` needs one renderer registered in that map, and no new route.

Implemented as `blockRegistry.ts` (`hero` -> `BannerCarousel`, `carousel` -> `ProductRail`), with a per-block error boundary and skeleton. Verified in a browser by editing
`home_blocks` and `banners` through SQL (`frontend/e2e/home.e2e.cjs`): reorder, disable (the page drops the block and its endpoint answers 404), a failing block, and a banner edit.
While developing, set `CACHE_DRIVER=none` so block *data* edits are visible at once; the layout itself is never cached.


## Sections added in P29

| Row (`home_blocks.slug`) | `type` | Source | Notes |
|---|---|---|---|
| `categories` | `shortcuts` | `GET /api/home/categories`: "Games", every platform that has products, the 4 biggest genres (`config.genres`) | each item is `{id, label, to, icon}`; the browser maps the icon key to a picture |
| `recently_viewed` | `recent` | none (`endpoint = ''`): the visitor's browser remembers the slugs (localStorage `keymart:recently-viewed:v1`, max 12) and the row asks `GET /api/products?slug[]=...` for them | a row without endpoint is kept by `HomeLayout` and drawn only in the browser; with no history the row is hidden |
| `recommended` | `carousel` | `GET /api/home/recommended`: buyable products ordered by popularity per euro (popular AND good value) | the same list for every visitor; it is not personal (no per-visitor data is kept on the server) |
| `upcoming` | `carousel` | `GET /api/home/upcoming`: buyable products whose `release_date` is in the future, soonest first; cards carry `releaseDate` | the demo data ages, so migration 009 and the seeder schedule a dozen products relative to today when none is upcoming |

Order: banner, categories, recently viewed, recommended, best sellers, deals, new releases, upcoming. New API detail: `GET /api/products` accepts `slug[]` (validated, at most 20).

## Language and currency (P29)

The header button "English EU | EUR" opens "Update your settings". **Currency** (EUR default, USD, GBP, AED) changes how catalogue prices are shown (cards, buy box, price filter); the choice is kept in localStorage. The rates are **fixed demo reference rates** in `features/settings/currencies.ts`, not live exchange rates, and **money is always euros**: the cart, checkout, Stripe charge and orders stay in EUR and say so. **Language** lists English only: the interface has no translations or i18n layer yet, so offering other languages would be pretend; adding one means extracting every string and is a separate task.
