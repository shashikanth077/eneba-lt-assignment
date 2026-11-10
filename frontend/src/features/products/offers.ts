import type { Offer } from '../../types/api.types';

export type OfferSortKey = 'price' | 'rating' | 'stock' | 'seller';
export type SortDirection = 'asc' | 'desc';
export interface OfferSort {
  key: OfferSortKey;
  direction: SortDirection;
}

export const DEFAULT_OFFER_SORT: OfferSort = { key: 'price', direction: 'asc' };
/** Rating and stock are most useful biggest-first, so the first click on them sorts that way. */
const FIRST_DIRECTION: Record<OfferSortKey, SortDirection> = {
  price: 'asc',
  seller: 'asc',
  rating: 'desc',
  stock: 'desc',
};

export const isBuyable = (offer: Offer): boolean => offer.stock > 0;

/** Clicking the sorted column flips it; clicking another column starts it in its natural direction. */
export function nextSort(current: OfferSort, key: OfferSortKey): OfferSort {
  if (current.key !== key) return { key, direction: FIRST_DIRECTION[key] };
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}

const compare: Record<OfferSortKey, (a: Offer, b: Offer) => number> = {
  price: (a, b) => a.priceCents - b.priceCents,
  rating: (a, b) => a.seller.rating - b.seller.rating,
  stock: (a, b) => a.stock - b.stock,
  seller: (a, b) => a.seller.name.localeCompare(b.seller.name),
};

/** Never mutates its input. Ties fall back to price, then id, so equal rows keep a stable, explainable order. */
export function sortOffers(offers: Offer[], { key, direction }: OfferSort): Offer[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...offers].sort(
    (a, b) => sign * compare[key](a, b) || a.priceCents - b.priceCents || a.id - b.id,
  );
}

/**
 * The offers to mark "Best price": the cheapest of those that can be bought, all of them on a tie. With only one
 * buyable offer there is nothing to compare, so nothing is highlighted.
 */
export function bestPriceOfferIds(offers: Offer[]): Set<number> {
  const buyable = offers.filter(isBuyable);
  if (buyable.length < 2) return new Set();
  const cheapest = Math.min(...buyable.map((offer) => offer.priceCents));
  return new Set(buyable.filter((offer) => offer.priceCents === cheapest).map((offer) => offer.id));
}

export const LOW_STOCK_AT = 5;
