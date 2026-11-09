<?php

declare(strict_types=1);

namespace Database\Seeds;

/** Generates placeholder cover and banner artwork as SVG (no third-party images or logos). */
final class SvgArt
{
    public static function cover(string $title, Prng $rng): string
    {
        $h1 = $rng->int(0, 359);
        $h2 = ($h1 + $rng->int(40, 140)) % 360;
        $shapes = '';
        for ($i = 0; $i < $rng->int(4, 7); $i++) {
            $x = $rng->int(-40, 440);
            $y = $rng->int(-40, 400);
            $r = $rng->int(40, 170);
            $hue = $rng->chance(0.5) ? $h1 : $h2;
            $opacity = number_format($rng->int(10, 35) / 100, 2, '.', '');
            $shapes .= $rng->chance(0.6)
                ? sprintf('<circle cx="%d" cy="%d" r="%d" fill="hsl(%d,85%%,65%%)" opacity="%s"/>', $x, $y, $r, $hue, $opacity)
                : sprintf(
                    '<polygon points="%d,%d %d,%d %d,%d" fill="hsl(%d,90%%,70%%)" opacity="%s"/>',
                    $x, $y, $x + $r * 2, $y + $rng->int(-30, 60), $x + $r, $y + $r * 2, $hue, $opacity,
                );
        }

        $text = '';
        foreach (self::wrap($title, 15, 3) as $i => $line) {
            $text .= sprintf('<text x="24" y="%d" class="t">%s</text>', 395 + $i * 40, self::esc($line));
        }
        $initial = self::esc(mb_strtoupper(mb_substr($title, 0, 1)));

        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 533" width="400" height="533" role="img" aria-label="'
            . self::esc($title) . '">'
            . '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
            . sprintf('<stop offset="0" stop-color="hsl(%d,70%%,38%%)"/><stop offset="1" stop-color="hsl(%d,75%%,22%%)"/>', $h1, $h2)
            . '</linearGradient><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/>'
            . '<stop offset="1" stop-color="#000" stop-opacity="0.75"/></linearGradient>'
            . '<style>.t{font:800 34px Montserrat,Arial,sans-serif;fill:#fff}</style></defs>'
            . '<rect width="400" height="533" fill="url(#g)"/>' . $shapes
            . '<text x="200" y="260" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-weight="800" font-size="220" fill="#fff" opacity="0.10">'
            . $initial . '</text>'
            . '<rect y="300" width="400" height="233" fill="url(#s)"/>' . $text . '</svg>';
    }

    /** Artwork only: the title, subtitle and button are rendered by the frontend from the banners table, so they stay readable at any size. */
    public static function banner(string $title, Prng $rng): string
    {
        $h1 = $rng->int(0, 359);
        $h2 = ($h1 + $rng->int(50, 130)) % 360;
        $shapes = '';
        for ($i = 0; $i < 9; $i++) {
            $shapes .= sprintf(
                '<circle cx="%d" cy="%d" r="%d" fill="hsl(%d,85%%,68%%)" opacity="%s"/>',
                $rng->int(500, 1328), $rng->int(-40, 420), $rng->int(30, 190), $rng->chance(0.5) ? $h1 : $h2,
                number_format($rng->int(8, 28) / 100, 2, '.', ''),
            );
        }

        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1328 379" width="1328" height="379" preserveAspectRatio="xMidYMid slice" role="img" aria-label="'
            . self::esc($title) . '"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
            . sprintf('<stop offset="0" stop-color="hsl(%d,70%%,30%%)"/><stop offset="1" stop-color="hsl(%d,75%%,18%%)"/>', $h1, $h2)
            . '</linearGradient></defs><rect width="1328" height="379" fill="url(#g)"/>' . $shapes . '</svg>';
    }

    /** @return list<string> */
    private static function wrap(string $text, int $maxChars, int $maxLines): array
    {
        $lines = [];
        $current = '';
        foreach (explode(' ', $text) as $word) {
            if ($current !== '' && mb_strlen($current . ' ' . $word) > $maxChars) {
                $lines[] = $current;
                $current = $word;
            } else {
                $current = trim($current . ' ' . $word);
            }
        }
        $lines[] = $current;

        return array_slice($lines, 0, $maxLines);
    }

    private static function esc(string $value): string
    {
        return htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }
}
