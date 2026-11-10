import { Minus, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../../app/hooks';
import { Alert } from '../../../../components/common';
import { describeApiError } from '../../../../services/api/apiErrorHandler';
import type { CartIssue, CartLine } from '../../../../types/api.types';
import { formatCurrency } from '../../../../utils/formatCurrency';
import { MAX_QTY_PER_LINE } from '../../../../utils/constants';
import { removeLineRequest, selectLineState, setQuantityRequest } from '../../cartSlice';
import styles from './CartItem.module.scss';

/** One cart row. The server allows 1-5 of an offer; the + button also stops at the stock that exists. */
export function CartItem({ line, issue }: { line: CartLine; issue?: CartIssue }) {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectLineState(line.offerId));
  const busy = state?.pending ?? false;
  const max = Math.max(1, Math.min(MAX_QTY_PER_LINE, line.available));

  return (
    <li className={styles.item}>
      <div className={styles.layout}>
        <img
          src={`/api/images/products/${line.productSlug}.svg`}
          alt=""
          loading="lazy"
          className={styles.thumb}
        />
        <div className={styles.row}>
          <div>
            <Link to={`/product/${line.productSlug}`} className={styles.name}>
              {line.productName}
            </Link>
            <p className={styles.meta}>
              Sold by {line.sellerName} · {formatCurrency(line.unitCents)} each
            </p>
          </div>

          <div
            className={styles.stepper}
            role="group"
            aria-label={`Quantity of ${line.productName}`}
          >
            <button
              type="button"
              className={styles.iconButton}
              aria-label={`Decrease quantity of ${line.productName}`}
              disabled={busy || line.qty <= 1}
              onClick={() =>
                dispatch(setQuantityRequest({ offerId: line.offerId, qty: line.qty - 1 }))
              }
            >
              <Minus size={18} aria-hidden />
            </button>
            <span className={styles.qty} aria-live="polite">
              {line.qty}
            </span>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={`Increase quantity of ${line.productName}`}
              disabled={busy || line.qty >= max}
              onClick={() =>
                dispatch(setQuantityRequest({ offerId: line.offerId, qty: line.qty + 1 }))
              }
            >
              <Plus size={18} aria-hidden />
            </button>
          </div>

          <span className={styles.total}>{formatCurrency(line.lineCents)}</span>

          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Remove ${line.productName} from the cart`}
            disabled={busy}
            onClick={() => dispatch(removeLineRequest(line.offerId))}
          >
            <Trash2 size={20} aria-hidden />
          </button>
        </div>
      </div>
      {issue && <Alert severity="warning">{issue.message}</Alert>}
      {state?.error && <Alert severity="error">{describeApiError(state.error)}</Alert>}
    </li>
  );
}
