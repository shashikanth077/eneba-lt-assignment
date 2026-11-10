<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Catalog\ProductFilters;
use App\Catalog\ProductSort;
use PDO;

/**
 * Catalog reads. Every public method issues a FIXED number of statements regardless of result size
 * (list = 2, show = 2, facets = 4): no query inside a loop, so no N+1.
 *
 * "In stock" means: active offer with at least one 'available' key. Only those offers count towards
 * "from price", offer count and discount, so a card never advertises something nobody can buy.
 */
final class ProductRepository
{
    /**
     * Products joined with their cheapest in-stock offer (`a`, one row per product via ROW_NUMBER) plus how
     * many in-stock offers they have. The deal shown is the one on that cheapest offer, so price and discount agree.
     * The join is always LEFT (browsing, filters and search alike): a product nobody can buy right now is still listed, with no
     * cheapest offer (`a` columns are NULL, `inStock` false, no price) and last when sorting by price. Before this, browsing used an
     * INNER join, so a database without game keys (a fresh import) showed an empty store although every product existed.
     *
     * The stock test is a scalar `(SELECT ... LIMIT 1) IS NOT NULL` on purpose: written as EXISTS, the optimizer
     * turned it into a semi-join that scanned every available key (see docs/QUERY_PLANS.md); this form is a
     * dependent subquery, i.e. one index probe on (offer_id, status) per offer.
     */
    private const BASE_FROM = <<<'SQL'
        FROM products p
        JOIN platforms pl ON pl.id = p.platform_id
        JOIN regions r ON r.id = p.region_id
        LEFT JOIN (
            SELECT o.id AS offer_id, o.product_id, o.price_cents, d.discount_pct,
                   ROW_NUMBER() OVER (PARTITION BY o.product_id ORDER BY o.price_cents, o.id) AS rn,
                   COUNT(*) OVER (PARTITION BY o.product_id) AS offer_count
            FROM offers o
            LEFT JOIN deals d ON d.offer_id = o.id AND (d.ends_at IS NULL OR d.ends_at > NOW())
            WHERE o.active = 1
              AND (SELECT k.id FROM game_keys k WHERE k.offer_id = o.id AND k.status = 'available' LIMIT 1) IS NOT NULL
        ) a ON a.product_id = p.id AND a.rn = 1
        SQL;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * The main list statement (public so it can be EXPLAINed and tested).
     *
     * @return array{sql: string, params: list<int|string>}
     */
    public function listQuery(ProductFilters $filters, ProductSort $sort, int $page, int $pageSize): array
    {
        $params = [];
        $where = $this->where($filters, null, $params);
        $order = $this->orderBy($filters, $sort, $params);
        $sql = 'SELECT p.id, p.slug, p.name, pl.slug AS platform_slug, pl.name AS platform_name,
                       r.slug AS region_slug, r.name AS region_name,
                   a.offer_id, a.price_cents AS from_price_cents, a.offer_count, a.discount_pct,
                       (a.product_id IS NOT NULL) AS in_stock '
            . self::BASE_FROM
            . ' LEFT JOIN product_stats s ON s.product_id = p.id '
            . $where
            . ' ORDER BY ' . $order
            . ' LIMIT ? OFFSET ?';
        $params[] = $pageSize;
        $params[] = ($page - 1) * $pageSize;

        return ['sql' => $sql, 'params' => $params];
    }

    /**
     * @return array{rows: list<array<string, mixed>>, total: int}
     */
    public function list(ProductFilters $filters, ProductSort $sort, int $page, int $pageSize): array
    {
        $query = $this->listQuery($filters, $sort, $page, $pageSize);
        $rows = array_map(self::castCardRow(...), $this->fetchAll($query['sql'], $query['params']));

        $params = [];
        $countSql = 'SELECT COUNT(*) ' . self::BASE_FROM . ' ' . $this->where($filters, null, $params);
        $total = (int) $this->fetchAll($countSql, $params)[0]['COUNT(*)'];

        return ['rows' => $rows, 'total' => $total];
    }

    /**
     * Facet counts. Each facet is counted with every filter EXCEPT its own, so ticking "Steam" still shows how
     * many PlayStation products match the other filters. Zero-count options are dropped unless currently selected.
     *
     * @return array{
     *     platforms: list<array{value: string, label: string, count: int}>,
     *     regions: list<array{value: string, label: string, count: int}>,
     *     genres: list<array{value: string, label: string, count: int}>,
     *     price: array{min: int|null, max: int|null}
     * }
     */
    public function facets(ProductFilters $filters): array
    {
        $params = [];
        $where = $this->where($filters, 'platform', $params);
        $platforms = $this->fetchAll(
            'SELECT pl2.slug AS value, pl2.name AS label, COUNT(base.id) AS cnt FROM platforms pl2
             LEFT JOIN (SELECT p.id, p.platform_id ' . self::BASE_FROM . ' ' . $where . ') base ON base.platform_id = pl2.id
             GROUP BY pl2.id, pl2.slug, pl2.name ORDER BY pl2.name',
            $params,
        );

        $params = [];
        $where = $this->where($filters, 'region', $params);
        $regions = $this->fetchAll(
            'SELECT r2.slug AS value, r2.name AS label, COUNT(base.id) AS cnt FROM regions r2
             LEFT JOIN (SELECT p.id, p.region_id ' . self::BASE_FROM . ' ' . $where . ') base ON base.region_id = r2.id
             GROUP BY r2.id, r2.slug, r2.name ORDER BY r2.name',
            $params,
        );

        $params = [];
        $where = $this->where($filters, 'genre', $params);
        $genres = $this->fetchAll(
            'SELECT p.genre AS value, p.genre AS label, COUNT(*) AS cnt ' . self::BASE_FROM . ' ' . $where . ' GROUP BY p.genre ORDER BY p.genre',
            $params,
        );

        $params = [];
        $where = $this->where($filters, 'price', $params);
        $price = $this->fetchAll('SELECT MIN(a.price_cents) AS mn, MAX(a.price_cents) AS mx ' . self::BASE_FROM . ' ' . $where, $params)[0];

        return [
            'platforms' => self::options($platforms, $filters->platforms),
            'regions' => self::options($regions, $filters->regions),
            'genres' => self::options($genres, $filters->genres, appendMissingSelected: true),
            'price' => [
                'min' => $price['mn'] === null ? null : (int) $price['mn'],
                'max' => $price['mx'] === null ? null : (int) $price['mx'],
            ],
        ];
    }

    /** @return array<string, mixed>|null the product row, or null for an unknown slug */
    public function findBySlug(string $slug): ?array
    {
        $rows = $this->fetchAll(
            'SELECT p.id, p.slug, p.name, p.description, p.genre, p.publisher, p.release_date,
                    pl.slug AS platform_slug, pl.name AS platform_name, r.slug AS region_slug, r.name AS region_name
             FROM products p
             JOIN platforms pl ON pl.id = p.platform_id
             JOIN regions r ON r.id = p.region_id
             WHERE p.slug = ?',
            [$slug],
        );

        return $rows === [] ? null : ['id' => (int) $rows[0]['id']] + $rows[0];
    }

    /**
     * All buyable offers of a product, cheapest first, with seller, deal and live stock in ONE statement
     * (stock is a correlated count served from the (offer_id, status) index).
     *
     * @return list<array<string, mixed>>
     */
    public function offersFor(int $productId): array
    {
        $rows = $this->fetchAll(
            'SELECT o.id, o.price_cents, s.id AS seller_id, s.name AS seller_name, s.rating AS seller_rating,
                    d.original_price_cents, d.discount_pct,
                    (SELECT COUNT(*) FROM game_keys k WHERE k.offer_id = o.id AND k.status = \'available\') AS stock
             FROM offers o
             JOIN sellers s ON s.id = o.seller_id
             LEFT JOIN deals d ON d.offer_id = o.id AND (d.ends_at IS NULL OR d.ends_at > NOW())
             WHERE o.product_id = ? AND o.active = 1
             HAVING stock > 0
             ORDER BY o.price_cents ASC, o.id ASC',
            [$productId],
        );

        return array_map(static fn (array $r): array => [
            'id' => (int) $r['id'],
            'price_cents' => (int) $r['price_cents'],
            'seller_id' => (int) $r['seller_id'],
            'seller_name' => $r['seller_name'],
            'seller_rating' => (float) $r['seller_rating'],
            'original_price_cents' => $r['original_price_cents'] === null ? null : (int) $r['original_price_cents'],
            'discount_pct' => $r['discount_pct'] === null ? null : (int) $r['discount_pct'],
            'stock' => (int) $r['stock'],
        ], $rows);
    }

    /**
     * ORDER BY text. Relevance keeps the order of the ranked id list via FIELD(); its ids are bound parameters.
     *
     * @param list<int|string> $params appended in placeholder order
     */
    private function orderBy(ProductFilters $filters, ProductSort $sort, array &$params): string
    {
        if ($sort !== ProductSort::Relevance) {
            return $sort->orderBy();
        }
        $ids = $filters->searchIds ?? throw new \LogicException('Relevance sort needs a search');
        if ($ids === []) {
            return 'p.id ASC';
        }
        array_push($params, ...$ids);

        return 'FIELD(p.id, ' . implode(',', array_fill(0, count($ids), '?')) . ')';
    }

    /**
     * WHERE clause for the filters, skipping one dimension (used by facets). Values go through placeholders only.
     *
     * @param list<int|string> $params appended in placeholder order
     */
    private function where(ProductFilters $f, ?string $exclude, array &$params): string
    {
        $conditions = [];
        $in = static function (string $column, array $values) use (&$conditions, &$params): void {
            $conditions[] = $column . ' IN (' . implode(',', array_fill(0, count($values), '?')) . ')';
            array_push($params, ...$values);
        };

        if ($f->searchIds !== null) {
            if ($f->searchIds === []) {
                $conditions[] = '1 = 0'; // searched, nothing similar: an empty IN () would be invalid SQL
            } else {
                $in('p.id', $f->searchIds);
            }
        }
        if ($exclude !== 'platform' && $f->platforms !== []) {
            $in('pl.slug', $f->platforms);
        }
        if ($exclude !== 'region' && $f->regions !== []) {
            $in('r.slug', $f->regions);
        }
        if ($exclude !== 'genre' && $f->genres !== []) {
            $in('p.genre', $f->genres);
        }
        if ($exclude !== 'price') {
            if ($f->priceMin !== null) {
                $conditions[] = 'a.price_cents >= ?';
                $params[] = $f->priceMin;
            }
            if ($f->priceMax !== null) {
                $conditions[] = 'a.price_cents <= ?';
                $params[] = $f->priceMax;
            }
        }

        return $conditions === [] ? '' : 'WHERE ' . implode(' AND ', $conditions);
    }

    /**
     * Keeps options with matches plus the currently selected ones (so the UI can untick them).
     * Platforms/regions come from lookup tables, so a selected one is always among the rows (count 0 if no match).
     * Genres have no table: a selected genre without matches has no row, so it is appended with count 0.
     *
     * @param list<array<string, mixed>> $rows
     * @param list<string> $selected
     * @return list<array{value: string, label: string, count: int}>
     */
    private static function options(array $rows, array $selected, bool $appendMissingSelected = false): array
    {
        $options = [];
        foreach ($rows as $row) {
            $count = (int) $row['cnt'];
            if ($count > 0 || in_array($row['value'], $selected, true)) {
                $options[] = ['value' => (string) $row['value'], 'label' => (string) $row['label'], 'count' => $count];
            }
        }
        if ($appendMissingSelected) {
            $present = array_column($options, 'value');
            foreach ($selected as $value) {
                if (!in_array($value, $present, true)) {
                    $options[] = ['value' => $value, 'label' => $value, 'count' => 0];
                }
            }
        }

        return $options;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private static function castCardRow(array $row): array
    {
        $row['id'] = (int) $row['id'];
        $row['offer_id'] = $row['offer_id'] === null ? null : (int) $row['offer_id'];
        $row['from_price_cents'] = $row['from_price_cents'] === null ? null : (int) $row['from_price_cents'];
        $row['offer_count'] = (int) $row['offer_count'];
        $row['in_stock'] = (bool) $row['in_stock'];
        $row['discount_pct'] = $row['discount_pct'] === null ? null : (int) $row['discount_pct'];

        return $row;
    }

    /**
     * @param list<int|string> $params
     * @return list<array<string, mixed>>
     */
    private function fetchAll(string $sql, array $params): array
    {
        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $i => $value) {
            $stmt->bindValue($i + 1, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
        }
        $stmt->execute();

        return $stmt->fetchAll();
    }
}
