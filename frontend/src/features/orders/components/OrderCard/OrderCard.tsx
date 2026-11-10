import { Link } from 'react-router-dom';
import type { OrderSummary } from '../../../../types/api.types';
import { formatCurrency } from '../../../../utils/formatCurrency';
import { formatDateTime } from '../../../../utils/formatDate';
import { OrderStatus } from '../OrderStatus';
import styles from './OrderCard.module.scss';

/** One row of the order history. It links to the order page; keys are shown only there, never in the list. */
export function OrderCard({ order }: { order: OrderSummary }) {
  return (
    <Link to={`/orders/${order.id}`} className={styles.card}>
      <span>
        <span className={styles.id}>Order #{order.id}</span>
        <span className={styles.meta} style={{ display: 'block' }}>
          {formatDateTime(order.createdAt)} · {order.itemCount}{' '}
          {order.itemCount === 1 ? 'item' : 'items'}
        </span>
      </span>
      <span className={styles.right}>
        <OrderStatus status={order.status} />
        <span className={styles.total}>{formatCurrency(order.totalCents)}</span>
      </span>
    </Link>
  );
}
