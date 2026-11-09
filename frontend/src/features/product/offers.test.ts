import { describe, expect, it } from 'vitest';
import type { Offer } from '../../api/types';
import { bestPriceOfferIds, nextSort, sortOffers } from './offers';

const offer = (
  id: number,
  name: string,
  priceCents: number,
  rating: number,
  stock: number,
): Offer => ({
  id,
  seller: { id, name, rating },
  priceCents,
  stock,
  deliveryType: 'instant',
});

const A = offer(1, 'Alpha', 1500, 4.1, 10);
const B = offer(2, 'Bravo', 1000, 4.8, 3);
const C = offer(3, 'Charlie', 1000, 3.9, 50);
const ids = (offers: Offer[]) => offers.map((o) => o.id);

describe('sortOffers', () => {
  it('sorts by every column in both directions and does not touch the input', () => {
    const input = [A, B, C];
    expect(ids(sortOffers(input, { key: 'price', direction: 'asc' }))).toEqual([2, 3, 1]);
    expect(ids(sortOffers(input, { key: 'price', direction: 'desc' }))).toEqual([1, 2, 3]); // 15.00, then the 10.00 tie by id
    expect(ids(sortOffers(input, { key: 'rating', direction: 'desc' }))).toEqual([2, 1, 3]);
    expect(ids(sortOffers(input, { key: 'stock', direction: 'desc' }))).toEqual([3, 1, 2]);
    expect(ids(sortOffers(input, { key: 'seller', direction: 'asc' }))).toEqual([1, 2, 3]);
    expect(ids(sortOffers(input, { key: 'seller', direction: 'desc' }))).toEqual([3, 2, 1]);
    expect(ids(input)).toEqual([1, 2, 3]);
  });

  it('breaks ties by price, then id, so equal rows keep a stable order', () => {
    const twin = offer(9, 'Zulu', 1000, 4.8, 3);
    expect(ids(sortOffers([twin, B], { key: 'rating', direction: 'asc' }))).toEqual([2, 9]);
  });
});

describe('nextSort', () => {
  it('starts rating and stock biggest-first, price and seller smallest-first, and flips on a second click', () => {
    const price = { key: 'price' as const, direction: 'asc' as const };
    expect(nextSort(price, 'rating')).toEqual({ key: 'rating', direction: 'desc' });
    expect(nextSort(price, 'stock')).toEqual({ key: 'stock', direction: 'desc' });
    expect(nextSort(price, 'seller')).toEqual({ key: 'seller', direction: 'asc' });
    expect(nextSort(price, 'price')).toEqual({ key: 'price', direction: 'desc' });
    expect(nextSort({ key: 'rating', direction: 'desc' }, 'rating')).toEqual({
      key: 'rating',
      direction: 'asc',
    });
  });
});

describe('bestPriceOfferIds', () => {
  it('marks the cheapest offer, and every offer that ties for it', () => {
    expect([...bestPriceOfferIds([A, B, C])].sort()).toEqual([2, 3]);
    expect([...bestPriceOfferIds([A, B])]).toEqual([2]);
  });

  it('marks nothing when there is nothing to compare (one offer)', () => {
    expect(bestPriceOfferIds([A]).size).toBe(0);
    expect(bestPriceOfferIds([]).size).toBe(0);
  });

  it('ignores offers that cannot be bought, even when they are the cheapest', () => {
    const gone = offer(4, 'Gone', 500, 5, 0);
    expect([...bestPriceOfferIds([A, B, gone])]).toEqual([2]);
    expect(bestPriceOfferIds([A, gone]).size).toBe(0); // only one buyable offer left
  });
});
