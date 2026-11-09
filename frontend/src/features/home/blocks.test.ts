import { describe, expect, it } from 'vitest';
import {
  autoplayMsOf,
  blockQueryPath,
  isInternalPath,
  parseBanners,
  parseLayout,
  parseProducts,
} from './blocks';

const product = (over: Record<string, unknown> = {}) => ({
  id: 1,
  slug: 'g-steam-global',
  name: 'Game',
  coverUrl: '/api/images/products/g-steam-global.svg',
  platform: { slug: 'steam', name: 'Steam' },
  region: { slug: 'global', name: 'Global' },
  fromPriceCents: 1999,
  offerCount: 2,
  inStock: true,
  ...over,
});
const banner = (over: Record<string, unknown> = {}) => ({
  id: 1,
  imageUrl: '/api/images/banners/a.svg',
  title: 'Title',
  subtitle: 'Sub',
  ctaLabel: 'Go',
  href: '/store',
  ...over,
});

describe('isInternalPath', () => {
  it.each(['/store', '/store?sort=newest', '/product/some-game', '/api/images/banners/a.svg'])(
    'accepts %s',
    (value) => {
      expect(isInternalPath(value)).toBe(true);
    },
  );
  it.each([
    '//evil.example',
    'https://evil.example',
    'javascript:alert(1)',
    '/\\evil',
    'store',
    '',
    '/a\nb',
    5,
    null,
    undefined,
  ])('rejects %j', (value) => {
    expect(isInternalPath(value)).toBe(false);
  });
});

describe('blockQueryPath', () => {
  it('turns the layout endpoint into the API client path', () => {
    expect(blockQueryPath('/api/home/deals')).toBe('/home/deals');
    expect(blockQueryPath('/api/home/best-sellers')).toBe('/home/best-sellers');
    expect(blockQueryPath('/api/home/staff_picks')).toBe('/home/staff_picks');
  });
  it.each([
    'https://evil.example/api/home/x',
    '//evil.example',
    '/api/',
    '/api',
    '/other/home/x',
    '/api/../etc/passwd',
    '/api/home/a b',
    '/api/home/x?y=1',
    '/api/home//x',
    5,
    null,
    undefined,
  ])('refuses %j: the layout cannot make the page fetch anything else', (value) => {
    expect(blockQueryPath(value)).toBeNull();
  });
});

describe('parseLayout', () => {
  it('keeps well-formed blocks in order and defaults a missing config', () => {
    const blocks = parseLayout({
      blocks: [
        { id: 'a', type: 'hero', title: 'A', endpoint: '/api/home/a' },
        { id: 'b', type: 'carousel', title: 'B', endpoint: '/api/home/b', config: { limit: 3 } },
      ],
    });

    expect(blocks.map((b) => b.id)).toEqual(['a', 'b']);
    expect(blocks[0].config).toEqual({});
    expect(blocks[1].config).toEqual({ limit: 3 });
  });
  it('drops entries that cannot be rendered or fetched', () => {
    expect(
      parseLayout({
        blocks: [
          null,
          'x',
          { id: 'a' },
          { id: 'a', type: 'hero', title: 'A' },
          { id: 'ok', type: 'hero', title: 'T', endpoint: '/api/home/x' },
        ],
      }).map((b) => b.id),
    ).toEqual(['ok']);
  });
  it.each([null, {}, { blocks: 'nope' }, []])(
    'throws on a response that is not a layout: %j',
    (value) => {
      expect(() => parseLayout(value)).toThrow();
    },
  );
});

describe('parseBanners', () => {
  it('maps valid banners', () => {
    expect(parseBanners({ items: [banner()] })).toEqual([banner()]);
  });
  it('keeps a banner whose link is unsafe but removes the link and button', () => {
    const [parsed] = parseBanners({ items: [banner({ href: 'javascript:alert(1)' })] });

    expect(parsed.href).toBe('');
    expect(parsed.ctaLabel).toBe('');
  });
  it('drops a banner whose image is not an on-site path, or that is malformed', () => {
    expect(
      parseBanners({
        items: [
          banner({ imageUrl: 'https://evil.example/x.svg' }),
          banner({ id: 'x' }),
          null,
          banner({ id: 2 }),
        ],
      }).map((b) => b.id),
    ).toEqual([2]);
  });
  it.each([null, {}, { items: 'x' }])('throws when the response is not a block: %j', (value) => {
    expect(() => parseBanners(value)).toThrow();
  });
});

describe('parseProducts', () => {
  it('accepts cards, including the extra deal field', () => {
    expect(
      parseProducts({
        items: [product(), product({ id: 2, discountPct: 50, originalPriceCents: 3998 })],
      }),
    ).toHaveLength(2);
  });
  it('drops malformed cards instead of failing the whole block', () => {
    const result = parseProducts({
      items: [
        product(),
        product({ id: 'x' }),
        product({ coverUrl: 'https://evil.example/c.svg' }),
        product({ platform: null }),
        product({ fromPriceCents: 'free' }),
        null,
        product({ id: 9, fromPriceCents: null }),
      ],
    });

    expect(result.map((p) => p.id)).toEqual([1, 9]);
  });
  it('throws when the response is not a block', () => {
    expect(() => parseProducts({ products: [] })).toThrow();
  });
});

describe('autoplayMsOf', () => {
  it('is opt-in and ignores unreadable speeds', () => {
    expect(autoplayMsOf({ autoplayMs: 6000 })).toBe(6000);
    expect(autoplayMsOf({ autoplayMs: 500 })).toBeNull();
    expect(autoplayMsOf({ autoplayMs: '6000' })).toBeNull();
    expect(autoplayMsOf({})).toBeNull();
  });
});
