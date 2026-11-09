<?php

declare(strict_types=1);

namespace Database\Seeds;

/**
 * Small deterministic random generator (xorshift32). PHP's mt_rand is stable too, but this one is
 * self-contained, so the seed data can never change because of a PHP upgrade.
 */
final class Prng
{
    private int $state;

    public function __construct(int $seed)
    {
        $this->state = ($seed & 0xFFFFFFFF) ?: 0x9E3779B9;
        for ($i = 0; $i < 8; $i++) { // warm up so nearby seeds diverge
            $this->next();
        }
    }

    public function next(): int
    {
        $x = $this->state;
        $x ^= ($x << 13) & 0xFFFFFFFF;
        $x ^= $x >> 17;
        $x ^= ($x << 5) & 0xFFFFFFFF;

        return $this->state = $x & 0xFFFFFFFF;
    }

    public function float(): float
    {
        return $this->next() / 4294967296;
    }

    /** Inclusive range. */
    public function int(int $min, int $max): int
    {
        return $min + $this->next() % ($max - $min + 1);
    }

    public function chance(float $probability): bool
    {
        return $this->float() < $probability;
    }

    /**
     * @template T
     * @param list<T> $items
     * @return T
     */
    public function pick(array $items): mixed
    {
        return $items[$this->int(0, count($items) - 1)];
    }

    /**
     * @template T
     * @param list<T> $items
     * @return list<T>
     */
    public function shuffle(array $items): array
    {
        for ($i = count($items) - 1; $i > 0; $i--) {
            $j = $this->int(0, $i);
            [$items[$i], $items[$j]] = [$items[$j], $items[$i]];
        }

        return $items;
    }

    /**
     * @param list<array{0: mixed, 1: int}> $weighted [item, weight] pairs
     */
    public function weighted(array $weighted): mixed
    {
        $total = array_sum(array_column($weighted, 1));
        $roll = $this->int(1, $total);
        foreach ($weighted as [$item, $weight]) {
            if (($roll -= $weight) <= 0) {
                return $item;
            }
        }

        return $weighted[0][0];
    }
}
