import type { ComponentType } from 'react';
import { BannerCarousel } from './components/HeroBanner';
import { ProductRail } from './components/ProductRail';
import type { BlockProps } from './homeTypes';

/**
 * Which component draws which kind of block. The key is the block's `type` from the layout (home_blocks.type), NOT its name:
 * best sellers, deals and new releases are all "carousel", so a new row in home_blocks with an existing type needs no frontend change,
 * and a brand-new type needs exactly one line here. A type that is not listed is skipped, never a crash.
 */
export const blockRenderers: Record<string, ComponentType<BlockProps>> = {
  hero: BannerCarousel,
  carousel: ProductRail,
};
