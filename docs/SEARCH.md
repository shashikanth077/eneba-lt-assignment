# Search: how it works, what it costs, where it stops

Endpoints: `GET /api/search?q=`, `GET /api/search/suggest?q=` (best 6) and `GET /api/products?q=` (same engine, plus the catalog's
filters, sorts and facets). Constraint from the brief: **LIKE for candidates, PHP for re-ranking**.

## Pipeline
```
q ──normalize──▶ SQL candidates (LIKE, capped at 200) ──▶ PHP re-rank (score 0..1) ──▶ keep score >= 0.40 ──▶ ranked ids
                                                                                                   │
                         catalog SQL: WHERE p.id IN (ids) + filters, ORDER BY FIELD(p.id, ids) | other sort, LIMIT/OFFSET ◀──┘
```
1. **Normalize** (`App\Search\TextNormalizer`): lower-case, strip diacritics (explicit Latin table, no `intl` needed), drop apostrophes
   ("assassin's" -> "assassins"), every other non `[a-z0-9]` becomes a space. The seeder uses the same function for `products.name_norm`,
   so both sides always meet in the same form.
2. **Candidates** (`SearchRepository`, one statement): `name_norm LIKE ?` OR-ed over (a) the whole phrase as a substring,
   (b) each word as a title prefix and as a word prefix, (c) up to 12 inner 3-letter pieces of the words. (c) is what makes typos
   retrievable: "wither" shares `wit`, `ith`, `the`, `her` with "witcher". Rows are ordered by how many patterns they match
   (then popularity), so **the cap of 200 keeps the best candidates, not arbitrary ones**. All patterns are bound parameters; normalized
   text cannot contain `%` or `_`, so a user cannot inject wildcards either.
3. **Re-rank** (`Scorer`, pure function): `score = 0.50 * tokenScore + 0.30 * trigramScore + bonus`, clamped to 1.
   - *tokenScore*: every query word is matched on its own against the best title word, so **word order is irrelevant**. Typo: `1 - levenshtein / maxLen`.
     Partly typed word: 0.92 x the same against the start of the title word ("cyber" ~ "cyberpunk"). Inside a word: 0.85 ("punk" in "cyberpunk").
     Words of up to 3 characters must match exactly. Mean over the query words.
   - *trigramScore*: pg_trgm-style padded trigrams; `0.6 * containment` (share of the query's trigrams found in the title, good for partial names)
     `+ 0.4 * Jaccard` (stops short queries from preferring very long titles).
   - *bonus* (max 0.20): exact title +0.20; title starts with the query +0.10; every query word starts a distinct title word +0.10.
   - *coverage penalty*: in a multi-word query, a word of 4+ letters that matches nothing (< 0.6) multiplies the score by 0.6.
     This is why "wither 3" returns The Witcher 3 and not every title that merely ends in "3".
   - Below **0.40** a candidate is dropped (noise floor). Ties: score, then popularity, then id.
4. **Catalog**: the ranked ids become a `p.id IN (...)` filter; `sort=relevance` orders with `FIELD(p.id, ...)`, every other sort/filter/facet/page works
   as before. Searching uses a `LEFT JOIN` on the cheapest-offer subquery, so **out-of-stock products are found** (`inStock: false`,
   `fromPriceCents: null`). A price filter excludes them, price sorts put them last, plain browsing still hides them.

Example scores (from the unit tests / fixture): `witcher 3` -> 0.83, `wither 3` -> 0.67, `cyberpnuk` -> 0.53, `ring elden` -> 0.90 (vs 1.0 for `elden ring`),
`cyber` -> Cyber Nexus Arena 0.92 and Cyberpunk 2077 0.85, `zzzzz` -> nothing.

## Complexity
Let P = products, K = LIKE patterns (<= 29, typically 8-20), C = candidates (<= 200), Tq/Tt = words in query/title (<= 8 / ~5), L = word length (~8).

| Stage | Cost | Notes |
|---|---|---|
| SQL candidates | **O(P x K)** | `LIKE '%x%'` cannot use an index, so it is a full scan of `products` with K comparisons per row; top-N by hit count via LIMIT |
| PHP re-rank | **O(C x Tq x Tt x L^2)** ~ 200 x 8 x 5 x 64 = 0.5M ops worst case | independent of catalog size because C is capped; Levenshtein is O(L^2) per word pair |
| Catalog SQL | as in `docs/QUERY_PLANS.md` | `IN (<= 200 ids)` + the usual joins |
| Memory | O(C) | at most 200 short strings |

## Measured (sandbox, MariaDB 10.11, untuned, one query at a time, median of 5)
Generated titles ("Crimson Harbor of Ashfall", ...), no index can serve `LIKE '%x%'`:

| Products | partial word `crimson` | two typos `crimsn harbr` | `zzzzzz` (no match) | PHP re-rank (any query) |
|---|---|---|---|---|
| 120 (the seed) | 0.6 ms | 0.7 ms | 0.3 ms | 0.04-0.09 ms |
| 10,000 | 16 ms | 25 ms | 7 ms | ~1 ms |
| 50,000 | 76 ms | 118 ms | 34 ms | ~1 ms |
| 100,000 | 144 ms | 219 ms | 65 ms | ~1 ms |

The SQL scan grows linearly and dominates; the re-rank stays flat at about 1 ms (the cap does its job: with >= 10k products broad queries hit the 200 cap).

## Scale limit (my honest number)
**Comfortable up to roughly 10-20k products, acceptable to ~50k, not beyond.** Autocomplete fires on every (debounced) keystroke and each one is a full scan,
so the budget is per-keystroke latency x concurrent users, not just one query. The seed (120 products) and this assignment are 2-3 orders of magnitude below the limit.
Other limits: filters are applied after the top-200 cut (a very broad query plus a narrow filter can lose matches), weights are hand-tuned on a small test set,
no synonyms or abbreviations (`gta`), no stemming, no learning from clicks.

## What I would use in production
- **Meilisearch or Typesense** (single binary, typo tolerance, prefix search, ranking rules, filters/facets, instant suggestions, PHP SDK). It replaces steps 2-3 and the
  facet queries for search. At larger scale or with synonyms/multi-language: **OpenSearch/Elasticsearch** (n-gram analyzers, `fuzziness`, synonyms, scoring tuning).
- MySQL stays the source of truth; documents (`name`, platform, region, genre, `from price`, `inStock`, popularity) are pushed to the engine on product/offer/stock changes
  (outbox table + worker), and the catalog API keeps its response shapes.
- If we were on PostgreSQL: `pg_trgm` + a GIN index gives indexed trigram similarity (`%` / `similarity()`), good to millions of rows. MySQL `FULLTEXT` (even with ngram) is not
  typo-tolerant, so it would not meet the brief on its own.
- Add: request rate limiting on `/search/suggest`, a short cache for popular queries, and click/conversion feedback to tune ranking.

## Tests (all in `backend/tests`)
- `SearchTest`: **29-case query table** through the real HTTP stack (exact, partial `cyber`/`cyb`, typos `wither 3` / `cyberpnuk` / `minecrft` / `red dead redemtion`,
  word order, split word `cyber punk 2077`, case/punctuation, hyphen, apostrophe, diacritics both ways, several matches, out-of-stock found, nonsense, SQL-injection string,
  `%`/`_`, symbols only), plus score ordering, out-of-stock behaviour, `q` on `/api/products`, filters/pagination/facets with `q`, validation (422), suggest (top 6, short queries,
  shape), candidate cap.
- `SearchScoringTest`: normalization (12 cases), trigram padding, scoring properties (exact > typo > unrelated, word order, short words are not fuzzy, bounds).
- `SearchSeededTest`: on the seeded 120 titles, every title is searched mangled (exact, upper-case + punctuation, reversed words, one letter dropped, two letters swapped): top hit
  must be the title itself (>= 95%); partial names must keep the intended title in the results (>= 97%); results for a word equal a plain SQL ground truth.
- Mutation check (deliberate breaks, then restored): no noise filter, no typo tolerance, out-of-stock hidden, cap ignored, no coverage penalty were each caught by failing tests.
