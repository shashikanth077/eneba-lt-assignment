<?php

declare(strict_types=1);

namespace Database\Seeds;

/** Static word lists and reference rows. Titles are invented from generic words (no real games). */
final class CatalogData
{
    /** @var list<array{0: string, 1: string}> [slug, name] */
    public const PLATFORMS = [
        ['steam', 'Steam'], ['playstation', 'PlayStation'], ['xbox', 'Xbox'],
        ['nintendo-switch', 'Nintendo Switch'], ['epic-games', 'Epic Games'], ['gog', 'GOG'],
    ];

    /** @var list<array{0: string, 1: string}> */
    public const REGIONS = [
        ['global', 'Global'], ['europe', 'Europe'], ['united-states', 'United States'],
        ['united-kingdom', 'United Kingdom'], ['latin-america', 'Latin America'],
    ];

    /** @var list<string> */
    public const SELLERS = [
        'PixelVault', 'KeyHarbor', 'GameNest', 'LootLagoon', 'Nova Keys', 'ArcadeBay',
        'DigitalDen', 'Questline Store', 'Blue Orchard', 'TurboKeys', 'Mint Market', 'Northwind Games',
    ];

    /** @var list<string> */
    public const GENRES = [
        'Action', 'Adventure', 'RPG', 'Strategy', 'Simulation', 'Racing', 'Shooter', 'Puzzle', 'Platformer', 'Horror',
    ];

    /** @var list<string> */
    public const PUBLISHERS = [
        'Northgate Interactive', 'Brightforge Games', 'Hollowtree Studios', 'Cobalt Peak', 'Emberlight Entertainment',
        'Silverfin Games', 'Tidewalker Studio', 'Paperkite Games', 'Ironvale Software', 'Moonbarrow Labs',
        'Redwood Collective', 'Foxglove Works',
    ];

    /** @var list<string> */
    public const ADJECTIVES = [
        'Neon', 'Crimson', 'Iron', 'Hollow', 'Silent', 'Frozen', 'Solar', 'Rogue', 'Ember', 'Shattered', 'Lunar', 'Feral',
        'Gilded', 'Obsidian', 'Wild', 'Last', 'Cobalt', 'Ancient', 'Rusty', 'Phantom', 'Savage', 'Velvet', 'Radiant',
        'Forgotten', 'Burning', 'Hidden', 'Electric', 'Midnight', 'Broken', 'Golden',
    ];

    /** @var list<string> */
    public const NOUNS = [
        'Harbor', 'Citadel', 'Frontier', 'Odyssey', 'Kingdom', 'Circuit', 'Horizon', 'Outpost', 'Canyon', 'Empire',
        'Voyage', 'Reckoning', 'Garden', 'Fortress', 'Tides', 'Gambit', 'Bastion', 'Dynasty', 'Expanse', 'Vanguard',
        'Legacy', 'Rift', 'Sanctuary', 'Wilds', 'Foundry', 'Meridian', 'Covenant', 'Skyline', 'Drift', 'Nexus',
    ];

    /** @var list<string> */
    public const PLACES = [
        'Ashfall', 'Redmoor', 'Skyreach', 'the Deep', 'Stormhaven', 'Dawnglass', 'Blackwater', 'Eldermere', 'the North',
        'Greywick', 'Sunspire', 'Thornfield',
    ];

    /** @var list<string> */
    public const SUBTITLES = ['Reborn', 'Origins', 'Redux', 'Chronicles', 'Remastered', 'Definitive Edition', 'Deluxe Edition'];

    /** @var array<string, list<string>> */
    public const FLAVOR = [
        'Action' => ['Fast, punchy combat rewards timing and nerve.', 'Chain moves into relentless combos across handcrafted arenas.'],
        'Adventure' => ['Explore a living world full of secrets, companions and hard choices.', 'A story-driven journey where every path leaves a mark.'],
        'RPG' => ['Build your hero, forge alliances and shape the fate of the realm.', 'Deep character progression meets a branching, reactive story.'],
        'Strategy' => ['Outsmart rivals with careful planning, supply lines and bold gambits.', 'Command armies and economies in a map that rewards foresight.'],
        'Simulation' => ['Design, manage and optimise in a world that reacts to every decision.', 'A calm, detailed sandbox with systems you can master for hundreds of hours.'],
        'Racing' => ['Tune your machine and push the limits on tracks that change with the weather.', 'Pure speed with a handling model that rewards precision.'],
        'Shooter' => ['Tight gunplay, smart enemies and maps built for movement.', 'Team up or go solo in high-stakes, high-tempo firefights.'],
        'Puzzle' => ['Clever mechanics unfold into mind-bending challenges, one room at a time.', 'Relaxing to start, brilliantly tricky to finish.'],
        'Platformer' => ['Precise jumps, hidden routes and a soundtrack that keeps you moving.', 'Classic platforming reimagined with modern polish.'],
        'Horror' => ['Dread builds in every corridor as resources run low and the dark closes in.', 'Survive an atmosphere so tense you will want the lights on.'],
    ];

    /** @var list<array{0: string, 1: string, 2: string, 3: string, 4: string}> [slug, title, subtitle, cta, href] */
    public const BANNERS = [
        ['new-arrivals', 'Fresh drops, instant keys', 'The newest releases, delivered in seconds', 'Shop new releases', '/store?sort=newest'],
        ['weekend-deals', 'Up to -60% this weekend', 'Hand-picked prices from trusted sellers', 'See the deals', '/store?sort=price_asc'],
        ['steam-keys', 'Steam keys from 4.99 EUR', 'Build your library without the big price tag', 'Browse Steam', '/store?platform=steam'],
        ['top-sellers', 'What everyone is playing', 'The best-selling games right now', 'View best sellers', '/store?sort=popular'],
    ];
}
