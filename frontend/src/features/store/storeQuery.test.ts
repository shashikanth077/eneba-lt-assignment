import { describe, expect, it } from 'vitest';
import {
  facetsArg,
  parseStoreQuery,
  productsArg,
  sortsFor,
  toSearchParams,
  type StoreQuery,
} from './storeQuery';

const parse = (search: string) => parseStoreQuery(new URLSearchParams(search));

describe('parseStoreQuery', () => {
  it('reads every part of the view from the address', () => {
    expect(
      parse(
        'q=witch&platform=xbox&platform=steam&region=europe&genre=Action&price_min=500&price_max=3000&sort=price_asc&page=3',
      ),
    ).toEqual({
      q: 'witch',
      platforms: ['steam', 'xbox'], // sorted, so the same selection is one cache entry whatever the click order
      regions: ['europe'],
      genres: ['Action'],
      priceMin: 500,
      priceMax: 3000,
      sort: 'price_asc',
      page: 3,
    });
  });

  it('has sensible defaults for a bare /store', () => {
    expect(parse('')).toEqual({
      q: '',
      platforms: [],
      regions: [],
      genres: [],
      priceMin: null,
      priceMax: null,
      sort: 'popular',
      page: 1,
    });
  });

  it('repairs hand-edited or stale addresses instead of failing', () => {
    expect(parse('page=0').page).toBe(1);
    expect(parse('page=-4').page).toBe(1);
    expect(parse('page=abc').page).toBe(1);
    expect(parse('sort=bogus').sort).toBe('popular');
    expect(parse('sort=relevance').sort).toBe('popular'); // relevance needs a search text, the API would answer 422
    expect(parse('q=a&sort=relevance').sort).toBe('relevance');
    expect(parse('price_min=abc&price_max=-5')).toMatchObject({ priceMin: null, priceMax: null });
    expect(parse('price_min=3000&price_max=500')).toMatchObject({ priceMin: 500, priceMax: 3000 });
    expect(parse('platform=&platform=steam&platform=steam').platforms).toEqual(['steam']);
    expect(parse(`q=${'x'.repeat(300)}`).q).toHaveLength(100);
    expect(parse('q=%20%20hello%20').q).toBe('hello');
  });

  it('defaults to relevance when searching', () => {
    expect(parse('q=zelda').sort).toBe('relevance');
    expect(sortsFor('')).not.toContain('relevance');
    expect(sortsFor('zelda')).toContain('relevance');
  });
});

describe('toSearchParams', () => {
  const full: StoreQuery = {
    q: 'dark souls',
    platforms: ['steam', 'xbox'],
    regions: ['europe'],
    genres: ['Action', 'RPG'],
    priceMin: 500,
    priceMax: 3000,
    sort: 'newest',
    page: 2,
  };

  it('round-trips: the address of a view parses back to the same view', () => {
    expect(parseStoreQuery(toSearchParams(full))).toEqual(full);
    expect(parseStoreQuery(toSearchParams(parse('')))).toEqual(parse(''));
  });

  it('leaves defaults out, so a plain store is just /store', () => {
    expect(toSearchParams(parse('')).toString()).toBe('');
    expect(toSearchParams(parse('page=1&sort=popular')).toString()).toBe('');
    expect(toSearchParams(parse('q=a&sort=relevance')).toString()).toBe('q=a');
  });

  it('writes a stable order, whatever order the pieces arrived in', () => {
    expect(toSearchParams(parse('page=2&sort=newest&platform=b&platform=a&q=x')).toString()).toBe(
      'q=x&platform=a&platform=b&sort=newest&page=2',
    );
  });
});

describe('API arguments', () => {
  it('uses the bracket syntax the API reads and always sends sort, page and pageSize', () => {
    const arg = new URLSearchParams(
      productsArg(parse('platform=steam&platform=xbox&genre=Action&price_max=900')),
    );
    expect(arg.getAll('platform[]')).toEqual(['steam', 'xbox']);
    expect(arg.getAll('genre[]')).toEqual(['Action']);
    expect(arg.get('price_max')).toBe('900');
    expect(arg.get('sort')).toBe('popular');
    expect(arg.get('page')).toBe('1');
    expect(arg.get('pageSize')).toBe('24');
  });

  it('is the same string for the same view (that is what makes the cache work) and differs when the view differs', () => {
    expect(productsArg(parse('platform=a&platform=b'))).toBe(
      productsArg(parse('platform=b&platform=a')),
    );
    expect(productsArg(parse('page=2'))).not.toBe(productsArg(parse('page=3')));
  });

  it('keeps sort and page out of the facet request (counts do not depend on them)', () => {
    expect(facetsArg(parse('platform=steam&sort=newest&page=4'))).toBe('platform%5B%5D=steam');
    expect(facetsArg(parse(''))).toBe('');
  });
});
