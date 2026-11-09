<?php

declare(strict_types=1);

namespace App\Search;

/**
 * One normalisation for BOTH sides of a search: products.name_norm is written with it (seeder) and
 * the query is run through it, so "Café Tycoon!" and "CAFE tycoon" meet in the same form.
 *
 * Steps: lower-case -> strip diacritics (explicit Latin table, no intl extension needed) -> drop apostrophes
 * ("assassin's" -> "assassins") -> every other non [a-z0-9] becomes a space -> collapse spaces.
 */
final class TextNormalizer
{
    /** Latin-1 Supplement and Latin Extended-A letters people actually type, mapped to ASCII. */
    private const DIACRITICS = [
        'à' => 'a', 'á' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'å' => 'a', 'ā' => 'a', 'ă' => 'a', 'ą' => 'a', 'æ' => 'ae',
        'ç' => 'c', 'ć' => 'c', 'ĉ' => 'c', 'ċ' => 'c', 'č' => 'c', 'ď' => 'd', 'đ' => 'd', 'ð' => 'd',
        'è' => 'e', 'é' => 'e', 'ê' => 'e', 'ë' => 'e', 'ē' => 'e', 'ĕ' => 'e', 'ė' => 'e', 'ę' => 'e', 'ě' => 'e',
        'ĝ' => 'g', 'ğ' => 'g', 'ġ' => 'g', 'ģ' => 'g', 'ĥ' => 'h', 'ħ' => 'h',
        'ì' => 'i', 'í' => 'i', 'î' => 'i', 'ï' => 'i', 'ĩ' => 'i', 'ī' => 'i', 'ĭ' => 'i', 'į' => 'i', 'ı' => 'i',
        'ĵ' => 'j', 'ķ' => 'k', 'ĺ' => 'l', 'ļ' => 'l', 'ľ' => 'l', 'ł' => 'l',
        'ñ' => 'n', 'ń' => 'n', 'ņ' => 'n', 'ň' => 'n',
        'ò' => 'o', 'ó' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o', 'ø' => 'o', 'ō' => 'o', 'ŏ' => 'o', 'ő' => 'o', 'œ' => 'oe',
        'ŕ' => 'r', 'ŗ' => 'r', 'ř' => 'r', 'ś' => 's', 'ŝ' => 's', 'ş' => 's', 'š' => 's', 'ß' => 'ss',
        'ţ' => 't', 'ť' => 't', 'ŧ' => 't',
        'ù' => 'u', 'ú' => 'u', 'û' => 'u', 'ü' => 'u', 'ũ' => 'u', 'ū' => 'u', 'ŭ' => 'u', 'ů' => 'u', 'ű' => 'u', 'ų' => 'u',
        'ŵ' => 'w', 'ý' => 'y', 'ÿ' => 'y', 'ŷ' => 'y', 'ź' => 'z', 'ż' => 'z', 'ž' => 'z',
    ];

    public static function normalize(string $text): string
    {
        $text = mb_strtolower($text, 'UTF-8');
        $text = strtr($text, self::DIACRITICS);
        $text = str_replace(["'", "\u{2019}", "\u{2018}", '`'], '', $text); // apostrophes disappear, they do not split words
        $text = preg_replace('/[^a-z0-9]+/', ' ', $text) ?? '';

        return trim($text);
    }

    /** @return list<string> */
    public static function tokens(string $normalized): array
    {
        return $normalized === '' ? [] : explode(' ', $normalized);
    }

    /**
     * pg_trgm-style trigrams: every word is padded with two leading spaces and one trailing space, so word
     * starts and ends carry weight ("cyber" -> "  c", " cy", "cyb", "ybe", "ber", "er ").
     *
     * @return array<string, true> set of trigrams
     */
    public static function trigrams(string $normalized): array
    {
        $set = [];
        foreach (self::tokens($normalized) as $word) {
            $padded = '  ' . $word . ' ';
            for ($i = 0, $n = strlen($padded) - 2; $i < $n; $i++) {
                $set[substr($padded, $i, 3)] = true;
            }
        }

        return $set;
    }
}
