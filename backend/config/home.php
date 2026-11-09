<?php

declare(strict_types=1);

use App\Home\Blocks\BannersBlock;
use App\Home\Blocks\BestSellersBlock;
use App\Home\Blocks\DealsBlock;
use App\Home\Blocks\NewReleasesBlock;

/**
 * Every homepage block the backend can serve. A new block = one class implementing HomeBlock, one line here,
 * and one row in home_blocks (see docs/HOME_BLOCKS.md).
 *
 * @return list<class-string<App\Home\HomeBlock>>
 */
return [
    BannersBlock::class,
    BestSellersBlock::class,
    DealsBlock::class,
    NewReleasesBlock::class,
];
