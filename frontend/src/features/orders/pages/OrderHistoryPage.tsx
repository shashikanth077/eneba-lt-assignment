import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { Button, Loader, Pagination } from '../../../components/common';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { ErrorMessage } from '../../../components/feedback/ErrorMessage';
import { ORDERS_PAGE_SIZE } from '../../../utils/constants';
import { OrderCard } from '../components/OrderCard';
import { fetchOrdersRequest, selectOrdersEntry } from '../ordersSlice';
import styles from './OrderHistoryPage.module.scss';

/** Order history, newest first, page in the address. Each order opens its own page (keys are shown only there). */
export function OrderHistoryPage() {
  const dispatch = useAppDispatch();
  const [params, setParams] = useSearchParams();
  const page = /^\d{1,6}$/.test(params.get('page') ?? '')
    ? Math.max(1, Number(params.get('page')))
    : 1;

  useEffect(() => {
    dispatch(fetchOrdersRequest(String(page), { force: true })); // new orders appear and statuses change: always ask
  }, [dispatch, page]);
  const entry = useAppSelector(selectOrdersEntry(page));
  const data = entry?.data;

  let body;
  if (data === undefined) {
    body =
      entry?.status === 'failed' ? (
        <ErrorMessage
          error={entry.error}
          title="We could not load your orders"
          onRetry={() => dispatch(fetchOrdersRequest(String(page), { force: true }))}
        />
      ) : (
        <Loader label="Loading your orders…" />
      );
  } else if (data.items.length === 0) {
    body = (
      <EmptyState
        title="No orders yet"
        description="When you buy a game key, your order shows up here."
        action={<Button to="/store">Browse the store</Button>}
      />
    );
  } else {
    body = (
      <>
        <ul className={styles.list} aria-label="Orders">
          {data.items.map((order) => (
            <li key={order.id}>
              <OrderCard order={order} />
            </li>
          ))}
        </ul>
        <Pagination
          page={page}
          pageCount={Math.ceil(data.total / ORDERS_PAGE_SIZE)}
          onChange={(next) => setParams(next > 1 ? { page: String(next) } : {})}
        />
      </>
    );
  }

  return (
    <div className={styles.page}>
      <h1>My orders</h1>
      {body}
    </div>
  );
}
