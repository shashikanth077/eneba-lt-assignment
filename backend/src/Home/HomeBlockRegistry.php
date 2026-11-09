<?php

declare(strict_types=1);

namespace App\Home;

use Psr\Container\ContainerInterface;

/** Knows which block classes exist (config/home.php). Instantiates them lazily, so listing routes never touches the database. */
final class HomeBlockRegistry
{
    /** @param list<class-string<HomeBlock>> $classes */
    public function __construct(private readonly ContainerInterface $container, private readonly array $classes)
    {
    }

    /** @return list<array{slug: string, path: string}> static facts read from class constants, no instantiation */
    public function routes(): array
    {
        return array_map(static fn (string $class): array => ['slug' => $class::SLUG, 'path' => $class::PATH], $this->classes);
    }

    public function has(string $slug): bool
    {
        return $this->classFor($slug) !== null;
    }

    public function get(string $slug): HomeBlock
    {
        $class = $this->classFor($slug) ?? throw new \OutOfBoundsException("No homepage block '$slug'");

        return $this->container->get($class);
    }

    /** @return class-string<HomeBlock>|null */
    private function classFor(string $slug): ?string
    {
        foreach ($this->classes as $class) {
            if ($class::SLUG === $slug) {
                return $class;
            }
        }

        return null;
    }
}
