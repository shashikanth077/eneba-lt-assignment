<?php

declare(strict_types=1);

namespace Database\Seeds;

use App\Search\TextNormalizer;
use App\Support\DemoAccounts;
use App\Support\KeyCipher;
use DateTimeImmutable;
use PDO;

/**
 * Deterministic, idempotent demo data. Everything is generated in memory from fixed seeds first
 * (so the result never depends on what is already in the database), then upserted by natural key.
 *
 * Re-running never duplicates rows, never touches keys that already exist (they may be sold),
 * and never resets product_stats (they may have changed through real sales).
 */
final class DatabaseSeeder
{
    private const SEED = 20270101;
    private const PRODUCT_COUNT = 120;
    private const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

    public function __construct(private readonly PDO $pdo, private readonly KeyCipher $cipher)
    {
    }

    /** @return array<string, int> row counts per table */
    public function run(): array
    {
        $this->pdo->beginTransaction();
        try {
            $platformIds = $this->seedLookup('platforms', CatalogData::PLATFORMS);
            $regionIds = $this->seedLookup('regions', CatalogData::REGIONS);
            $sellerIds = $this->seedSellers();
            $products = $this->seedProducts(array_values($platformIds), array_values($regionIds));
            $this->seedOffersKeysDealsStats($products, array_values($sellerIds));
            $this->seedBanners();
            $this->seedHomeBlocks();
            $this->ensureUpcomingProducts();
            $this->seedDemoUsers();
            $this->seedDemoOrders();
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return $this->counts();
    }

    /** @return array<string, int> */
    public function counts(): array
    {
        $counts = [];
        foreach (['platforms', 'regions', 'sellers', 'products', 'offers', 'game_keys', 'deals', 'product_stats', 'banners', 'home_blocks'] as $table) {
            $counts[$table] = (int) $this->pdo->query("SELECT COUNT(*) FROM $table")->fetchColumn();
        }

        return $counts;
    }

    /**
     * @param list<array{0: string, 1: string}> $rows [slug, name]
     * @return array<string, int> slug => id
     */
    private function seedLookup(string $table, array $rows): array
    {
        $this->upsert($table, ['slug', 'name'], $rows, ['name']);
        $ids = [];
        foreach ($this->pdo->query("SELECT id, slug FROM $table ORDER BY id") as $row) {
            $ids[$row['slug']] = (int) $row['id'];
        }

        return array_intersect_key($ids, array_flip(array_column($rows, 0)));
    }

    /** @return array<string, int> name => id */
    private function seedSellers(): array
    {
        $rng = new Prng(self::SEED + 3);
        $rows = [];
        foreach (CatalogData::SELLERS as $name) {
            $rows[] = [$name, number_format($rng->int(38, 50) / 10, 1, '.', '')];
        }
        $this->upsert('sellers', ['name', 'rating'], $rows, ['rating']);

        $ids = [];
        foreach ($this->pdo->query('SELECT id, name FROM sellers') as $row) {
            $ids[$row['name']] = (int) $row['id'];
        }

        return array_intersect_key($ids, array_flip(CatalogData::SELLERS));
    }

    /**
     * @param list<int> $platformIds
     * @param list<int> $regionIds
     * @return list<array{id: int, base_price: int, release: string}>
     */
    private function seedProducts(array $platformIds, array $regionIds): array
    {
        $rng = new Prng(self::SEED + 4);
        $art = new Prng(self::SEED + 5);
        $rows = [];
        $meta = [];
        $slugs = [];

        while (count($rows) < self::PRODUCT_COUNT) {
            $title = $this->title($rng);
            $platformIndex = $rng->weighted([[0, 40], [1, 20], [2, 15], [3, 10], [4, 10], [5, 5]]);
            $regionIndex = $platformIndex === 0
                ? $rng->weighted([[0, 55], [1, 30], [2, 5], [3, 5], [4, 5]])
                : $rng->weighted([[0, 25], [1, 25], [2, 25], [3, 15], [4, 10]]);

            $slug = $this->slugify($title . '-' . CatalogData::PLATFORMS[$platformIndex][0] . '-' . CatalogData::REGIONS[$regionIndex][0]);
            if (isset($slugs[$slug])) {
                continue;
            }
            $slugs[$slug] = true;

            $genre = $rng->pick(CatalogData::GENRES);
            $publisher = $rng->pick(CatalogData::PUBLISHERS);
            $release = (new DateTimeImmutable('2017-01-01'))->modify('+' . $rng->int(0, 3575) . ' days'); // up to 2026-10-15
            $description = sprintf(
                '%s is a %s game from %s. %s',
                $title,
                mb_strtolower($genre),
                $publisher,
                $rng->pick(CatalogData::FLAVOR[$genre]),
            );

            $age = (new DateTimeImmutable('2026-11-01'))->diff($release)->days;
            $base = match (true) {
                $age <= 365 => $rng->int(3999, 6999),
                $age <= 1095 => $rng->int(1999, 4999),
                default => $rng->int(499, 2499),
            };

            $rows[] = [
                $slug, $title, TextNormalizer::normalize($title), $description, $genre, $publisher, $release->format('Y-m-d'),
                $platformIds[$platformIndex], $regionIds[$regionIndex], SvgArt::cover($title, $art),
            ];
            $meta[$slug] = ['base_price' => $base, 'release' => $release->format('Y-m-d')];
        }

        $this->upsert(
            'products',
            ['slug', 'name', 'name_norm', 'description', 'genre', 'publisher', 'release_date', 'platform_id', 'region_id', 'cover_svg'],
            $rows,
            ['name', 'name_norm', 'description', 'genre', 'publisher', 'release_date', 'platform_id', 'region_id', 'cover_svg'],
            50,
        );

        $ids = [];
        foreach ($this->pdo->query('SELECT id, slug FROM products') as $row) {
            $ids[$row['slug']] = (int) $row['id'];
        }

        $products = [];
        foreach ($meta as $slug => $info) {
            $products[] = ['id' => $ids[$slug]] + $info;
        }

        return $products;
    }

    /**
     * @param list<array{id: int, base_price: int, release: string}> $products
     * @param list<int> $sellerIds
     */
    private function seedOffersKeysDealsStats(array $products, array $sellerIds): void
    {
        $rng = new Prng(self::SEED + 6);
        $offerRows = [];
        $plan = []; // per offer: product id, seller id, key count (resolved to offer ids after the upsert)
        $dealPlan = [];
        $stats = [];

        foreach ($products as $product) {
            $offerCount = $rng->int(2, 5);
            $chosen = array_slice($rng->shuffle($sellerIds), 0, $offerCount);
            $prices = [];
            foreach ($chosen as $sellerId) {
                $price = max(99, (int) (round($product['base_price'] * (0.88 + $rng->float() * 0.30) / 10) * 10) - 1);
                $prices[$sellerId] = $price;
                $offerRows[] = [$product['id'], $sellerId, $price];
                $plan[] = ['product' => $product['id'], 'seller' => $sellerId, 'keys' => $rng->int(20, 50)];
            }
            if ($rng->chance(0.30)) {
                $rng->pick($chosen); // keep the random stream identical to earlier versions of this seeder
                $sellerId = array_search(min($prices), $prices, true); // a discounted offer is the cheapest one
                $pct = $rng->int(1, 12) * 5; // 5..60
                // Keep the crossed-out price believable (<= 89.99): shrink the discount instead of inflating the price.
                while ($pct >= 5 && $prices[$sellerId] / (1 - $pct / 100) > 8999) {
                    $pct -= 5;
                }
                if ($pct >= 5) {
                    $original = (int) (round($prices[$sellerId] / (1 - $pct / 100) / 10) * 10) - 1;
                    $dealPlan[] = ['product' => $product['id'], 'seller' => $sellerId, 'original' => $original, 'pct' => $pct];
                }
            }

            $sold = (int) floor(($rng->float() ** 3) * 5000) + ($product['release'] >= '2025-11-01' ? 300 : 0);
            $views = $sold * $rng->int(8, 25) + $rng->int(0, 500);
            $stats[] = [$product['id'], $sold, $views, $sold * 2 + intdiv($views, 20)];
        }

        $this->upsert('offers', ['product_id', 'seller_id', 'price_cents'], $offerRows, ['price_cents']);

        $offerIds = []; // "product:seller" => offer id
        foreach ($this->pdo->query('SELECT id, product_id, seller_id FROM offers') as $row) {
            $offerIds[$row['product_id'] . ':' . $row['seller_id']] = (int) $row['id'];
        }

        // Game keys are INVENTORY, not catalogue data: they are created only for an offer that has no key rows at all (never topped up, so a
        // sold-out offer stays sold out), they are random (not derivable from this code), and a repeated run adds nothing.
        $this->assertExistingKeysReadable();
        $haveKeys = array_flip(array_map('intval', $this->pdo->query('SELECT DISTINCT offer_id FROM game_keys')->fetchAll(PDO::FETCH_COLUMN)));
        $keyRows = [];
        foreach ($plan as $offer) {
            $offerId = $offerIds[$offer['product'] . ':' . $offer['seller']];
            if (isset($haveKeys[$offerId])) {
                continue;
            }
            $seen = [];
            for ($i = 0; $i < $offer['keys']; $i++) {
                do {
                    $plain = $this->generateKey();
                } while (isset($seen[$plain]));
                $seen[$plain] = true;
                $keyRows[] = [$offerId, $this->cipher->encrypt($plain), KeyCipher::fingerprint($plain)];
            }
        }
        // INSERT IGNORE on the unique fingerprint is the last line of defence against a duplicate.
        $this->insertIgnore('game_keys', ['offer_id', 'key_enc', 'key_hash'], $keyRows, 300);

        $dealRows = array_map(
            static fn (array $d): array => [$offerIds[$d['product'] . ':' . $d['seller']], $d['original'], $d['pct']],
            $dealPlan,
        );
        $this->upsert('deals', ['offer_id', 'original_price_cents', 'discount_pct'], $dealRows, ['original_price_cents', 'discount_pct']);
        // Deals are seed-owned: drop any left over from an older version of the plan.
        $keep = array_column($dealRows, 0);
        $this->pdo->prepare('DELETE FROM deals WHERE offer_id NOT IN (' . implode(',', array_fill(0, count($keep), '?')) . ')')->execute($keep);

        $this->insertIgnore('product_stats', ['product_id', 'units_sold', 'view_count', 'popularity'], $stats);
    }

    private function seedBanners(): void
    {
        $rng = new Prng(self::SEED + 8);
        $rows = [];
        foreach (CatalogData::BANNERS as $position => [$slug, $title, $subtitle, $cta, $href]) {
            $rows[] = [$slug, $title, $subtitle, $cta, $href, SvgArt::banner($title, $rng), $position + 1];
        }
        $this->upsert('banners', ['slug', 'title', 'subtitle', 'cta_label', 'href', 'image_svg', 'position'], $rows, ['title', 'subtitle', 'cta_label', 'href', 'image_svg', 'position']);
    }

    private function seedHomeBlocks(): void
    {
        $rows = [
            ['banner', 'hero', 'Featured', '/api/home/banners', 1, '{"autoplayMs":6000}'],
            ['categories', 'shortcuts', 'Categories', '/api/home/categories', 2, '{"genres":4}'],
            ['recently_viewed', 'recent', 'Recently viewed', '', 3, '{"limit":6}'], // no endpoint: drawn from the visitor's own history
            ['recommended', 'carousel', 'Recommended for you', '/api/home/recommended', 4, '{"limit":10}'],
            ['best_sellers', 'carousel', 'Best sellers', '/api/home/best-sellers', 5, '{"limit":10}'],
            ['deals', 'carousel', 'Hot deals', '/api/home/deals', 6, '{"limit":10}'],
            ['new_releases', 'carousel', 'New releases', '/api/home/new-releases', 7, '{"limit":10}'],
            ['upcoming', 'carousel', 'Upcoming games', '/api/home/upcoming', 8, '{"limit":10}'],
        ];
        $this->upsert('home_blocks', ['slug', 'type', 'title', 'endpoint', 'position', 'config'], $rows, ['type', 'title', 'endpoint', 'position', 'config']);
    }

    private function title(Prng $rng): string
    {
        $adjective = $rng->pick(CatalogData::ADJECTIVES);
        $noun = $rng->pick(CatalogData::NOUNS);

        return match ($rng->weighted([[0, 40], [1, 35], [2, 25]])) {
            0 => "$adjective $noun",
            1 => "$noun of " . $rng->pick(CatalogData::PLACES),
            default => "$adjective $noun " . $rng->pick(CatalogData::SUBTITLES),
        };
    }

    /** New keys must be encrypted with the same KEY_ENCRYPTION_KEY as the existing ones, or the stock would be half unreadable. */
    private function assertExistingKeysReadable(): void
    {
        $sample = $this->pdo->query('SELECT key_enc FROM game_keys ORDER BY id LIMIT 1')->fetchColumn();
        if ($sample === false) {
            return;
        }
        try {
            $this->cipher->decrypt((string) $sample);
        } catch (\Throwable) {
            throw new \RuntimeException('The existing game keys cannot be decrypted with the current KEY_ENCRYPTION_KEY. Refusing to add keys encrypted under a different key: restore the original key.');
        }
    }

    private function generateKey(): string
    {
        $groups = [];
        for ($g = 0; $g < 3; $g++) {
            $group = '';
            for ($i = 0; $i < 5; $i++) {
                $group .= self::KEY_ALPHABET[random_int(0, strlen(self::KEY_ALPHABET) - 1)];
            }
            $groups[] = $group;
        }

        return implode('-', $groups);
    }

    private function slugify(string $text): string
    {
        return trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($text)), '-');
    }

    /**
     * Multi-row INSERT ... ON DUPLICATE KEY UPDATE. Table and column names come from this class, never from input.
     *
     * @param list<string> $columns
     * @param list<list<mixed>> $rows
     * @param list<string> $updateColumns
     */
    private function upsert(string $table, array $columns, array $rows, array $updateColumns, int $chunk = 200): void
    {
        $update = implode(', ', array_map(static fn (string $c): string => "$c = VALUES($c)", $updateColumns));
        $this->writeRows("INSERT INTO $table", " ON DUPLICATE KEY UPDATE $update", $columns, $rows, $chunk);
    }

    /**
     * @param list<string> $columns
     * @param list<list<mixed>> $rows
     */
    private function insertIgnore(string $table, array $columns, array $rows, int $chunk = 200): void
    {
        $this->writeRows("INSERT IGNORE INTO $table", '', $columns, $rows, $chunk);
    }

    /**
     * @param list<string> $columns
     * @param list<list<mixed>> $rows
     */
    private function writeRows(string $prefix, string $suffix, array $columns, array $rows, int $chunk): void
    {
        $placeholders = '(' . implode(',', array_fill(0, count($columns), '?')) . ')';
        foreach (array_chunk($rows, $chunk) as $batch) {
            $sql = $prefix . ' (' . implode(',', $columns) . ') VALUES '
                . implode(',', array_fill(0, count($batch), $placeholders)) . $suffix;
            $this->pdo->prepare($sql)->execute(array_merge(...$batch));
        }
    }

    /** Created once (an existing account keeps its password and orders) and already verified, so the verification banner does not show. */
    private function seedDemoUsers(): void
    {
        $exists = $this->pdo->prepare('SELECT 1 FROM users WHERE email = ?');
        $insert = $this->pdo->prepare('INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES (?, ?, ?, NOW())');
        foreach (DemoAccounts::ALL as [$email, $name, $password]) {
            $exists->execute([$email]);
            if ($exists->fetchColumn() === false) {
                $insert->execute([$email, password_hash($password, PASSWORD_ARGON2ID), $name]);
            }
        }
    }

    /**
     * Realistic history for the demo accounts, so "My orders" is not empty: paid orders whose keys were really taken from the shelf
     * (status sold, order_id, sold_at), exactly as a purchase would leave them. Created once per account (an account that already has
     * any order is left alone), so re-running never adds orders or consumes more stock.
     */
    private function seedDemoOrders(): void
    {
        // [account, days ago, offers as [offer position in id order, qty]]
        $plans = [
            ['demo.buyer@keymart.test', 12, [[0, 1], [7, 2]]],
            ['demo.buyer@keymart.test', 3, [[15, 1]]],
            ['demo.shopper@keymart.test', 6, [[22, 1]]],
        ];
        $hasOrders = $this->pdo->prepare('SELECT 1 FROM orders WHERE user_id = ? LIMIT 1');
        $userId = $this->pdo->prepare('SELECT id FROM users WHERE email = ?');
        $offers = $this->pdo->query(
            "SELECT o.id, o.product_id, o.price_cents, p.slug, p.name, s.name AS seller
             FROM offers o JOIN products p ON p.id = o.product_id JOIN sellers s ON s.id = o.seller_id
             WHERE o.active = 1 AND (SELECT COUNT(*) FROM game_keys k WHERE k.offer_id = o.id AND k.status = 'available') >= 5
             ORDER BY o.id LIMIT 40",
        )->fetchAll();
        $done = [];
        foreach ($plans as [$email, $daysAgo, $lines]) {
            $userId->execute([$email]);
            $id = $userId->fetchColumn();
            if ($id === false || isset($done[$email])) {
                continue;
            }
            $hasOrders->execute([$id]);
            $firstTime = $hasOrders->fetchColumn() === false;
            $done[$email] = true; // decided once per account: its later plans belong to the same first run
            if (!$firstTime) {
                continue;
            }
            foreach ($plans as [$planEmail, $planDays, $planLines]) {
                if ($planEmail === $email) {
                    $this->createPaidOrder((int) $id, $planDays, $planLines, $offers);
                }
            }
        }
    }

    /**
     * @param list<array{0: int, 1: int}> $lines
     * @param list<array<string, mixed>> $offers
     */
    private function createPaidOrder(int $userId, int $daysAgo, array $lines, array $offers): void
    {
        $picked = [];
        $total = 0;
        foreach ($lines as [$position, $qty]) {
            $offer = $offers[$position] ?? null;
            $available = $offer === null ? 0 : (int) $this->pdo->query("SELECT COUNT(*) FROM game_keys WHERE offer_id = {$offer['id']} AND status = 'available'")->fetchColumn();
            if ($offer === null || $available < $qty) {
                return; // not enough stock to build a truthful order: skip it rather than invent one
            }
            $picked[] = [$offer, $qty];
            $total += (int) $offer['price_cents'] * $qty;
        }
        $paidAt = (new DateTimeImmutable('now', new \DateTimeZone('UTC')))->modify("-$daysAgo days")->format('Y-m-d H:i:s');
        $this->pdo->prepare(
            "INSERT INTO orders (user_id, status, currency, total_cents, reserved_until, paid_at, created_at) VALUES (?, 'paid', 'EUR', ?, ?, ?, ?)",
        )->execute([$userId, $total, $paidAt, $paidAt, $paidAt]);
        $orderId = (int) $this->pdo->lastInsertId();
        $item = $this->pdo->prepare(
            'INSERT INTO order_items (order_id, offer_id, product_id, product_slug, product_name, seller_name, unit_price_cents, qty) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        );
        foreach ($picked as [$offer, $qty]) {
            $item->execute([$orderId, $offer['id'], $offer['product_id'], $offer['slug'], $offer['name'], $offer['seller'], $offer['price_cents'], $qty]);
            $this->pdo->prepare(sprintf(
                "UPDATE game_keys SET status = 'sold', order_id = ?, reserved_until = NULL, sold_at = ? WHERE offer_id = ? AND status = 'available' ORDER BY id LIMIT %d",
                $qty,
            ))->execute([$orderId, $paidAt, $offer['id']]);
        }
    }

    /**
     * The "Upcoming games" row needs products whose release date is still ahead. Demo data ages (every date eventually passes), so
     * when NO product is upcoming, a few are scheduled relative to today. Skipped when some already are, so a re-run changes nothing.
     */
    private function ensureUpcomingProducts(): void
    {
        $this->pdo->exec(
            'UPDATE products SET release_date = DATE_ADD(CURDATE(), INTERVAL (id % 9) * 11 + 7 DAY)
             WHERE id % 10 = 3 AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM products WHERE release_date > CURDATE() LIMIT 1) future)',
        );
    }
}
