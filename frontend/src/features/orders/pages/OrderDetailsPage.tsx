import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { Alert, Button, Loader } from '../../../components/common';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { ErrorMessage } from '../../../components/feedback/ErrorMessage';
import type { OrderDetail } from '../../../types/api.types';
import { formatCurrency } from '../../../utils/formatCurrency';
import { formatDateTime } from '../../../utils/formatDate';
import { KeyReveal } from '../components/KeyReveal';
import { OrderStatus } from '../components/OrderStatus';
import {
  leaveOrder,
  selectCurrentOrder,
  startOrderPolling,
  stopOrderPolling,
} from '../ordersSlice';
import styles from './OrderDetailsPage.module.scss';

function StatusNotice({
  order,
  gaveUp,
  onCheck,
}: {
  order: OrderDetail;
  gaveUp: boolean;
  onCheck: () => void;
}) {
  switch (order.status) {
    case 'pending':
      return gaveUp ? (
        <Alert
          severity="info"
          action={
            <Button variant="text" size="sm" onClick={onCheck}>
              Check again
            </Button>
          }
        >
          We have not received the payment confirmation yet. If you paid, it can take a little
          longer: check again in a minute. You are not charged twice.
        </Alert>
      ) : (
        <Alert severity="info" role="status" icon={<Loader inline />}>
          Payment received, waiting for confirmation… This usually takes a few seconds. Your keys
          appear here as soon as it is confirmed; you can stay on this page.
        </Alert>
      );
    case 'paid':
      return (
        <Alert severity="success" role="status">
          Payment confirmed. Your keys are below.
        </Alert>
      );
    case 'failed':
      return (
        <Alert severity="error">
          The payment did not go through and you were not charged. You can try again from your cart.
        </Alert>
      );
    case 'expired':
      return (
        <Alert severity="warning">
          This order expired before it was paid, and the keys went back on sale. Start a new order
          from your cart.
        </Alert>
      );
    case 'canceled':
      return <Alert severity="warning">This order was replaced by a newer checkout.</Alert>;
    case 'refund_needed':
      return (
        <Alert severity="warning">
          The keys ran out while your payment was being confirmed. We are refunding you
          automatically.
        </Alert>
      );
    case 'refunded':
      return <Alert severity="info">This order was refunded.</Alert>;
  }
}

function NotFound() {
  return (
    <EmptyState
      title="We could not find that order"
      description="It may belong to another account, or the link is wrong."
      action={<Button to="/orders">My orders</Button>}
    />
  );
}

function OrderView({
  order,
  gaveUp,
  onCheck,
}: {
  order: OrderDetail;
  gaveUp: boolean;
  onCheck: () => void;
}) {
  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <h1>Order #{order.id}</h1>
        <OrderStatus status={order.status} />
      </div>
      <p className={styles.muted}>
        Placed {formatDateTime(order.createdAt)}
        {order.paidAt && ` · paid ${formatDateTime(order.paidAt)}`}
      </p>

      <StatusNotice order={order} gaveUp={gaveUp} onCheck={onCheck} />

      <ul className={styles.items} aria-label="Items">
        {order.items.map((item) => (
          <li key={`${item.productSlug}-${item.sellerName}`} className={styles.item}>
            <div className={styles.itemHead}>
              <div>
                <Link to={`/product/${item.productSlug}`} className={styles.itemName}>
                  {item.qty} × {item.productName}
                </Link>
                <p className={styles.sub}>
                  Sold by {item.sellerName} · {formatCurrency(item.unitPriceCents, order.currency)}{' '}
                  each
                </p>
              </div>
              <strong>{formatCurrency(item.unitPriceCents * item.qty, order.currency)}</strong>
            </div>
            {item.keys && (
              <div className={styles.keys} role="group" aria-label={`Keys for ${item.productName}`}>
                {item.keys.map((key, index) => (
                  <KeyReveal
                    key={index}
                    value={key}
                    label={`${item.productName}, key ${index + 1} of ${item.keys?.length ?? 0}`}
                  />
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className={styles.total}>
        <span>Total</span>
        <strong>{formatCurrency(order.totalCents, order.currency)}</strong>
      </div>
      <div>
        <Button to="/orders" variant="text">
          All my orders
        </Button>
      </div>
    </div>
  );
}

/**
 * One order. While it is `pending` (Stripe has taken the card but its webhook has not reached the server yet) the saga asks the server
 * every 2 s and the page flips to the keys by itself; it gives up after 2 minutes and offers a manual check instead of polling forever.
 * What this page shows is only ever what the server says: the browser's own idea of "I paid" never unlocks a key.
 */
export function OrderDetailsPage() {
  const id = Number(useParams().id);
  const valid = Number.isInteger(id) && id > 0;
  const dispatch = useAppDispatch();
  const { order, status, error, gaveUp, id: loadedId } = useAppSelector(selectCurrentOrder);

  useEffect(() => {
    if (!valid) return;
    dispatch(startOrderPolling(id));
    return () => {
      dispatch(stopOrderPolling());
      dispatch(leaveOrder()); // the keys leave the browser's memory when the page closes
    };
  }, [dispatch, id, valid]);

  if (!valid) return <NotFound />;
  if (order && loadedId === id) {
    return (
      <OrderView order={order} gaveUp={gaveUp} onCheck={() => dispatch(startOrderPolling(id))} />
    );
  }
  if (status === 'failed' && loadedId === id) {
    return error?.status === 404 ? (
      <NotFound />
    ) : (
      <ErrorMessage
        error={error}
        title="We could not load this order"
        onRetry={() => dispatch(startOrderPolling(id))}
      />
    );
  }
  return <Loader label="Loading your order…" />;
}
