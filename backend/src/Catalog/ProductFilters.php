<?php

declare(strict_types=1);

namespace App\Catalog;

use App\Exceptions\ValidationException;

/**
 * Validated catalog filters from the query string:
 *   platform[]=steam  region[]=europe  genre[]=RPG  price_min=500  price_max=2500   (prices in cents)
 * A single value (platform=steam) is accepted too. Values are matched against slugs (genre: its name).
 */
final class ProductFilters
{
    private const MAX_VALUES = 20;

    /**
     * @param list<string> $platforms
     * @param list<string> $regions
     * @param list<string> $genres
     * @param list<int>|null $searchIds ranked product ids from a text search (best first); null = not searching.
     *                                  An empty list means "searched, found nothing". Searching also lists
     *                                  products that are out of stock.
     */
    public function __construct(
        public readonly array $platforms = [],
        public readonly array $regions = [],
        public readonly array $genres = [],
        public readonly ?int $priceMin = null,
        public readonly ?int $priceMax = null,
        public readonly ?array $searchIds = null,
    ) {
    }

    /** @param list<int> $rankedIds */
    public function withSearch(array $rankedIds): self
    {
        return new self($this->platforms, $this->regions, $this->genres, $this->priceMin, $this->priceMax, array_values($rankedIds));
    }

    /** @param array<string, mixed> $query */
    public static function fromQuery(array $query): self
    {
        $errors = [];
        $lists = [];
        foreach (['platform' => 'platforms', 'region' => 'regions', 'genre' => 'genres'] as $param => $name) {
            $lists[$name] = self::list($query[$param] ?? [], $param, $errors);
        }
        $min = self::cents($query['price_min'] ?? null, 'price_min', $errors);
        $max = self::cents($query['price_max'] ?? null, 'price_max', $errors);
        if ($min !== null && $max !== null && $min > $max) {
            $errors['price_min'][] = 'Must not be greater than price_max';
        }

        if ($errors !== []) {
            throw new ValidationException($errors);
        }

        return new self($lists['platforms'], $lists['regions'], $lists['genres'], $min, $max);
    }

    /**
     * @param array<string, list<string>> $errors
     * @return list<string>
     */
    private static function list(mixed $raw, string $param, array &$errors): array
    {
        $values = is_array($raw) ? array_values($raw) : [$raw];
        $clean = [];
        foreach ($values as $value) {
            if ($value === '' || $value === null) {
                continue;
            }
            if (!is_string($value) || preg_match('/^[\p{L}\p{N} .+&\-]{1,60}$/u', $value) !== 1) {
                $errors[$param][] = 'Contains an invalid value';

                return [];
            }
            $clean[] = $value;
        }
        if (count($clean) > self::MAX_VALUES) {
            $errors[$param][] = 'At most ' . self::MAX_VALUES . ' values are allowed';

            return [];
        }

        return array_values(array_unique($clean));
    }

    /** @param array<string, list<string>> $errors */
    private static function cents(mixed $raw, string $param, array &$errors): ?int
    {
        if ($raw === null || $raw === '') {
            return null;
        }
        if (!is_string($raw) || preg_match('/^\d{1,9}$/', $raw) !== 1) {
            $errors[$param][] = 'Must be a non-negative integer (cents)';

            return null;
        }

        return (int) $raw;
    }

    public function isEmpty(): bool
    {
        return $this->platforms === [] && $this->regions === [] && $this->genres === []
            && $this->priceMin === null && $this->priceMax === null && $this->searchIds === null;
    }
}
