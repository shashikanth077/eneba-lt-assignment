import { classNames } from '../../../utils/classNames';
import { formatCurrency } from '../../../utils/formatCurrency';
import styles from './PriceDisplay.module.scss';

interface PriceDisplayProps {
  cents: number;
  currency?: string;
  originalCents?: number;
  discountPct?: number;
  /** Show the small "From" line above the price (product cards, the product page). */
  from?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function PriceDisplay({
  cents,
  currency,
  originalCents,
  discountPct,
  from = false,
  size = 'md',
}: PriceDisplayProps) {
  const showLine = from || originalCents !== undefined || discountPct !== undefined;
  return (
    <span className={styles.wrap}>
      {showLine && (
        <span className={styles.from}>
          {from && 'From'}
          {originalCents !== undefined && (
            <span className={styles.original}>{formatCurrency(originalCents, currency)}</span>
          )}
          {discountPct !== undefined && <span className={styles.discount}>-{discountPct}%</span>}
        </span>
      )}
      <span className={classNames(styles.price, styles[size])}>
        {formatCurrency(cents, currency)}
      </span>
    </span>
  );
}
