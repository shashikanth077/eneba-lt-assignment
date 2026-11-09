# Query plans: product list

Engine used for these numbers: **MariaDB 10.11** (MySQL-compatible; the sandbox had no MySQL 8). Dataset: the full seed
(120 products, 408 offers, 14,391 keys). Re-run any time with `ProductRepository::listQuery()` (public on purpose).
MySQL 8 prints a different `EXPLAIN` layout and may pick different join orders, so check the plan there too;
the query uses only standard SQL available in both (window functions, derived tables, scalar subqueries).

## The main list query (`GET /api/products`)
```sql
SELECT p.id, p.slug, p.name, pl.slug, pl.name, r.slug, r.name,
       a.price_cents AS from_price_cents, a.offer_count, a.discount_pct
FROM products p
JOIN platforms pl ON pl.id = p.platform_id
JOIN regions r    ON r.id  = p.region_id
JOIN (                                   -- one row per product: its cheapest buyable offer
    SELECT o.product_id, o.price_cents, d.discount_pct,
           ROW_NUMBER() OVER (PARTITION BY o.product_id ORDER BY o.price_cents, o.id) AS rn,
           COUNT(*)     OVER (PARTITION BY o.product_id) AS offer_count
    FROM offers o
    LEFT JOIN deals d ON d.offer_id = o.id AND (d.ends_at IS NULL OR d.ends_at > NOW())
    WHERE o.active = 1
      AND (SELECT k.id FROM game_keys k WHERE k.offer_id = o.id AND k.status = 'available' LIMIT 1) IS NOT NULL
) a ON a.product_id = p.id AND a.rn = 1
LEFT JOIN product_stats s ON s.product_id = p.id
[WHERE pl.slug IN (?..) AND r.slug IN (?..) AND p.genre IN (?..) AND a.price_cents >= ? AND a.price_cents <= ?]
ORDER BY COALESCE(s.popularity, 0) DESC, p.id ASC      -- ORDER BY comes from the ProductSort enum, never from input
LIMIT ? OFFSET ?
```
Statements per request: **list = 2** (this query + a COUNT with the same joins/filters), **product page = 2**, **filters = 4**,
independent of how many rows come back (asserted by `CatalogTest::testStatementCountDoesNotGrowWithTheNumberOfRows`).

## EXPLAIN (final version)
Case A, default list (popular, page 1, no filters), **4.4 ms** for `list()` including the COUNT query (avg of 300 runs):
```
id select_type        table       type    key                  rows  Extra
1  PRIMARY            r           ALL     NULL                 5     Using temporary; Using filesort
1  PRIMARY            p           ref     idx_products_region  1
1  PRIMARY            pl          eq_ref  PRIMARY              1
1  PRIMARY            s           eq_ref  PRIMARY              1
1  PRIMARY            <derived2>  ref     key0                 10    Using where
2  DERIVED            o           ALL     NULL                 408   Using where; Using temporary
2  DERIVED            d           eq_ref  uq_deals_offer       1     Using where
3  DEPENDENT SUBQUERY k           ref     idx_keys_offer_status 17   Using where; Using index
```
Case B, `platform=steam&genre=Action&price_min=1000&price_max=4000&sort=price_asc`: same shape, 4.3 ms; the planner
uses `uq_platforms_slug` (const) and `idx_products_genre` with a rowid filter on `products`.

How to read it:
- `k` (game_keys) is a **covering index lookup** on `idx_keys_offer_status (offer_id, status, id)`, one probe per offer.
- `o` (offers) is read fully: every active offer is needed to find each product's cheapest one. 408 rows today.
- `Using temporary; Using filesort` is the ORDER BY over a computed value (`popularity`/`price` of the derived table);
  fine at catalog size, the cost is the sort of the matching rows, not of the whole database.
- With ~120 products the planner reads `regions` first and does not need most indexes; do not over-read the join order.

## What the EXPLAIN found (and what I changed)
The first version tested stock with `AND EXISTS (SELECT 1 FROM game_keys k WHERE k.offer_id = o.id AND k.status = 'available')`.
The optimizer turned that into a **semi-join with materialization**:
```
3  MATERIALIZED  k  ref  idx_keys_reserved  7138  Using index condition      <- scans every available key
```
and `list()` took **28.8 ms**. Rewriting the test as a scalar subquery with `LIMIT 1` (`(SELECT k.id ...) IS NOT NULL`) keeps it a
dependent subquery, i.e. the per-offer index probe above: **28.8 ms -> 4.4 ms (6.5x faster)**, same results (all catalog tests pass).

## Known limits (deliberate shortcuts)
- "From price", offer count and discount are computed per request. Fine for thousands of products; beyond ~10-50k, precompute them in a
  `product_prices` table updated when offers/keys change (checkout already touches both in one transaction).
- Only products with at least one **buyable** offer (active + an available key) are listed; sold-out products keep their page (`offers: []`).
- Search (`q`, relevance) is a separate task and not part of this query yet.
