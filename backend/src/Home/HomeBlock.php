<?php

declare(strict_types=1);

namespace App\Home;

/**
 * The ONLY thing homepage blocks have in common. A block is a self-contained unit: it owns its queries, its payload shape
 * and its caching, and it must not extend another block, use a shared trait or call another block. That is what lets any
 * block be moved into its own service later by copying one class and its table(s).
 *
 * Implementations also declare `public const SLUG` (the home_blocks.slug they serve) and `public const PATH`
 * (their endpoint), which the router reads without instantiating the block (see config/routes.php).
 */
interface HomeBlock
{
    /** Matches home_blocks.slug. */
    public function slug(): string;

    /** The endpoint serving this block, e.g. "/api/home/deals". */
    public function path(): string;

    /**
     * The block's response body.
     *
     * @param array<string, mixed> $config the block's home_blocks.config (e.g. ["limit" => 10])
     * @return array<string, mixed>
     */
    public function fetch(array $config): array;
}
