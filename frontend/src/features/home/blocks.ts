import type { BannerItem, HomeBlockMeta, HomeProduct } from '../../types/api.types';

/**
 * Everything the homepage receives is data from the database, so it is checked before it is rendered: a bad row must make ONE block
 * show an error (see BlockBoundary), never break the page and never turn a text field into a link to somewhere else.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** A path on this site ("/store?sort=newest"), never "//host", "https://...", "javascript:..." or something with control characters. */
export function isInternalPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    ![...value].some((c) => c.charCodeAt(0) < 32)
  );
}

/** "/api/home/deals" -> "/home/deals" (the API client already adds "/api"). Anything else is refused: the layout cannot make us fetch other URLs. */
export function blockQueryPath(endpoint: unknown): string | null {
  if (typeof endpoint !== 'string') return null;
  const match = /^\/api(\/[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*)$/i.exec(endpoint);
  return match ? match[1] : null;
}

export function isBlockMeta(value: unknown): value is HomeBlockMeta {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    typeof value.title === 'string' &&
    typeof value.endpoint === 'string'
  );
}

/** Layout entries without an id/type/title/endpoint are dropped (never rendered, never fetched). */
export function parseLayout(data: unknown): HomeBlockMeta[] {
  if (!isRecord(data) || !Array.isArray(data.blocks)) throw new Error('Unexpected layout response');
  return data.blocks
    .filter(isBlockMeta)
    .map((block) => ({ ...block, config: isRecord(block.config) ? block.config : {} }));
}

function itemsOf(data: unknown): unknown[] {
  if (!isRecord(data) || !Array.isArray(data.items)) throw new Error('Unexpected block response');
  return data.items;
}

export function parseBanners(data: unknown): BannerItem[] {
  return itemsOf(data).flatMap((item) =>
    isRecord(item) &&
    typeof item.id === 'number' &&
    isInternalPath(item.imageUrl) &&
    typeof item.title === 'string' &&
    typeof item.subtitle === 'string'
      ? [
          {
            id: item.id,
            imageUrl: item.imageUrl,
            title: item.title,
            subtitle: item.subtitle,
            // a banner whose link is not an on-site path is still shown, just without the button
            ctaLabel:
              isInternalPath(item.href) && typeof item.ctaLabel === 'string' ? item.ctaLabel : '',
            href: isInternalPath(item.href) ? item.href : '',
          },
        ]
      : [],
  );
}

export function parseProducts(data: unknown): HomeProduct[] {
  return itemsOf(data).flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'number' ||
      typeof item.slug !== 'string' ||
      typeof item.name !== 'string' ||
      !isInternalPath(item.coverUrl) ||
      !isRecord(item.platform) ||
      typeof item.platform.name !== 'string' ||
      !isRecord(item.region) ||
      typeof item.region.name !== 'string' ||
      (item.fromPriceCents !== null && typeof item.fromPriceCents !== 'number')
    ) {
      return [];
    }
    return [item as unknown as HomeProduct];
  });
}

/** Autoplay is opt-in through the block's config; below 2 s it would be unreadable, so it is ignored. */
export function autoplayMsOf(config: Record<string, unknown>): number | null {
  const value = config.autoplayMs;
  return typeof value === 'number' && Number.isFinite(value) && value >= 2000 ? value : null;
}
