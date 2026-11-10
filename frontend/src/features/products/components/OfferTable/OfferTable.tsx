import { ArrowDown, ArrowUp, Star } from 'lucide-react';
import { useState } from 'react';
import { Alert, PriceDisplay } from '../../../../components/common';
import type { Offer } from '../../../../types/api.types';
import { classNames } from '../../../../utils/classNames';
import {
  DEFAULT_OFFER_SORT,
  LOW_STOCK_AT,
  bestPriceOfferIds,
  isBuyable,
  nextSort,
  sortOffers,
  type OfferSort,
  type OfferSortKey,
} from '../../offers';
import { AddToCartButton } from './AddToCartButton';
import styles from './OfferTable.module.scss';

interface OfferTableProps {
  productSlug: string;
  productName: string;
  regionName: string;
  offers: Offer[];
}

function StockText({ stock }: { stock: number }) {
  if (stock <= 0) return <span className={styles.muted}>Out of stock</span>;
  if (stock <= LOW_STOCK_AT) return <span className={styles.low}>Only {stock} left</span>;
  return <span>In stock ({stock})</span>;
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: OfferSortKey;
  sort: OfferSort;
  onSort: (sort: OfferSort) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className={styles.sortButton}
        onClick={() => onSort(nextSort(sort, sortKey))}
      >
        {label}
        {active &&
          (sort.direction === 'asc' ? (
            <ArrowUp size={14} aria-hidden />
          ) : (
            <ArrowDown size={14} aria-hidden />
          ))}
      </button>
    </th>
  );
}

/**
 * Every seller's offer for one game. Accessible table: a caption, column headers (`th scope="col"`), the seller as the row header,
 * and sortable columns whose header carries `aria-sort`. "Best price" is a text chip plus a border, never colour alone.
 */
export function OfferTable({ productSlug, productName, regionName, offers }: OfferTableProps) {
  const [sort, setSort] = useState<OfferSort>(DEFAULT_OFFER_SORT);
  const rows = sortOffers(offers, sort);
  const best = bestPriceOfferIds(offers);

  return (
    <>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <caption className="visually-hidden">
            Offers for {productName}. {offers.length} {offers.length === 1 ? 'seller' : 'sellers'}.
            Use the column buttons to sort.
          </caption>
          <thead>
            <tr>
              <SortableHeader label="Seller" sortKey="seller" sort={sort} onSort={setSort} />
              <th scope="col">Region</th>
              <SortableHeader label="Rating" sortKey="rating" sort={sort} onSort={setSort} />
              <SortableHeader label="Stock" sortKey="stock" sort={sort} onSort={setSort} />
              <SortableHeader label="Price" sortKey="price" sort={sort} onSort={setSort} />
              <th scope="col">
                <span className="visually-hidden">Buy</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((offer) => {
              const isBest = best.has(offer.id);
              return (
                <tr
                  key={offer.id}
                  className={classNames(
                    styles.row,
                    isBest && styles.best,
                    !isBuyable(offer) && styles.unavailable,
                  )}
                  data-best={isBest || undefined}
                >
                  <th scope="row" className={styles.seller}>
                    {offer.seller.name}
                    {isBest && <span className={styles.bestChip}>Best price</span>}
                  </th>
                  <td>{regionName}</td>
                  <td>
                    <span
                      className={styles.rating}
                      role="img"
                      aria-label={`Rated ${offer.seller.rating.toFixed(1)} out of 5`}
                    >
                      <Star size={16} aria-hidden />
                      {offer.seller.rating.toFixed(1)}
                    </span>
                  </td>
                  <td>
                    <StockText stock={offer.stock} />
                  </td>
                  <td>
                    <PriceDisplay
                      cents={offer.priceCents}
                      originalCents={offer.originalPriceCents}
                      size="sm"
                    />
                  </td>
                  <td>
                    <AddToCartButton offer={offer} productSlug={productSlug} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {offers.length === 1 && (
        <div className={styles.note}>
          <Alert severity="info">
            Only one seller has this game right now, so there is no price to compare.
          </Alert>
        </div>
      )}
    </>
  );
}
