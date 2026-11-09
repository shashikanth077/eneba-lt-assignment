<?php

declare(strict_types=1);

namespace Tests;

use App\Search\Scorer;
use App\Search\TextNormalizer;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** Pure functions: no database. */
final class SearchScoringTest extends TestCase
{
    #[DataProvider('normalizationCases')]
    public function testNormalize(string $input, string $expected): void
    {
        self::assertSame($expected, TextNormalizer::normalize($input));
    }

    /** @return array<string, array{string, string}> */
    public static function normalizationCases(): array
    {
        return [
            'lower case' => ['CyberPunk', 'cyberpunk'],
            'diacritics' => ['Café Tycoon', 'cafe tycoon'],
            'more diacritics' => ['Zoë Ñandú Œuvre Straße Łódź', 'zoe nandu oeuvre strasse lodz'],
            'punctuation becomes a space' => ['Counter-Strike: Global (2)', 'counter strike global 2'],
            'apostrophes vanish' => ["Assassin's Creed", 'assassins creed'],
            'curly apostrophe' => ["Assassin\u{2019}s Creed", 'assassins creed'],
            'ampersand and symbols' => ['Java & Bedrock!!!', 'java bedrock'],
            'whitespace collapses' => ["  wither \t  3  ", 'wither 3'],
            'digits stay' => ['FIFA 24', 'fifa 24'],
            'only symbols' => ['!!! --- %%%', ''],
            'sql wildcard characters' => ['100%_legit', '100 legit'],
            'empty' => ['', ''],
        ];
    }

    public function testTrigramsArePaddedPerWord(): void
    {
        self::assertSame(['  c', ' cy', 'cyb', 'ybe', 'ber', 'er '], array_keys(TextNormalizer::trigrams('cyber')));
        self::assertSame([], TextNormalizer::trigrams(''));
        $a = array_keys(TextNormalizer::trigrams('ring elden'));
        $b = array_keys(TextNormalizer::trigrams('elden ring'));
        sort($a);
        sort($b);
        self::assertSame($a, $b, 'trigram sets ignore word order');
    }

    public function testExactBeatsTypoBeatsUnrelated(): void
    {
        $title = 'the witcher 3 wild hunt';

        $exact = Scorer::score('the witcher 3 wild hunt', $title);
        $partial = Scorer::score('witcher 3', $title);
        $typo = Scorer::score('wither 3', $title);
        $unrelated = Scorer::score('stormhaven', $title);

        self::assertSame(1.0, $exact);
        self::assertGreaterThan($typo, $partial);
        self::assertGreaterThan($unrelated + 0.3, $typo);
        self::assertLessThan(0.4, $unrelated);
    }

    public function testWordOrderChangesBarelyMatter(): void
    {
        $title = 'elden ring';

        self::assertGreaterThan(Scorer::score('ring elden', $title), Scorer::score('elden ring', $title), 'the right order is still preferred');
        self::assertGreaterThan(0.85, Scorer::score('ring elden', $title));
    }

    public function testPartialWordsScoreHighWhenTheyStartAWord(): void
    {
        self::assertGreaterThan(0.8, Scorer::score('cyber', 'cyberpunk 2077'));
        self::assertGreaterThan(0.8, Scorer::score('cyb', 'cyberpunk 2077'));
        self::assertGreaterThan(Scorer::score('punk', 'cyberpunk 2077'), Scorer::score('cyber', 'cyberpunk 2077'), 'a word start beats the middle of a word');
    }

    public function testASignificantUnmatchedWordPenalisesTheTitle(): void
    {
        // Both titles contain the "3"; only one contains something like "wither".
        self::assertGreaterThan(0.6, Scorer::score('wither 3', 'the witcher 3 wild hunt'));
        self::assertLessThan(0.4, Scorer::score('wither 3', 'the last odyssey 3'));
    }

    public function testShortWordsAreNotFuzzy(): void
    {
        self::assertSame(0.0, Scorer::score('ab', 'cd'));
        self::assertLessThan(0.4, Scorer::score('ice', 'ace of spades'), '3-letter words must match exactly');
    }

    public function testDegenerateInputScoresZero(): void
    {
        self::assertSame(0.0, Scorer::score('', 'anything'));
        self::assertSame(0.0, Scorer::score('anything', ''));
        self::assertSame(0.0, Scorer::score('zzzzz', 'tides of stormhaven'));
    }

    public function testScoreIsAlwaysBetweenZeroAndOne(): void
    {
        foreach (['a', 'the', 'cyber punk 2077 phantom liberty ultimate edition', '3', 'wither 3'] as $q) {
            foreach (['the witcher 3 wild hunt', 'a', 'cyberpunk 2077', 'x'] as $t) {
                $score = Scorer::score($q, $t);
                self::assertGreaterThanOrEqual(0.0, $score);
                self::assertLessThanOrEqual(1.0, $score);
            }
        }
    }
}
