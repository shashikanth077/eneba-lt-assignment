import { useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { Alert, Button, Loader } from '../../../components/common';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { ErrorMessage } from '../../../components/feedback/ErrorMessage';
import {
  leaveOrder,
  selectCurrentOrder,
  startOrderPolling,
  stopOrderPolling,
} from '../../orders/ordersSlice';

/**
 * /payment/success?order=ID: where the buyer lands after Stripe (and Stripe's return_url for redirect-based methods). It does not trust
 * the redirect: it asks the server for the order and waits until the payment webhook has made it paid, then moves on to the order page,
 * where the keys are. If the payment failed, expired or never completes it says so here.
 */
export function PaymentSuccessPage() {
  const [params] = useSearchParams();
  const id = Number(params.get('order'));
  const valid = Number.isInteger(id) && id > 0;
  const failedRedirect = params.get('redirect_status') === 'failed'; // Stripe's own signal when a redirect-based payment did not complete
  const dispatch = useAppDispatch();
  const { order, status, error, gaveUp, id: loadedId } = useAppSelector(selectCurrentOrder);

  useEffect(() => {
    if (!valid || failedRedirect) return;
    dispatch(startOrderPolling(id));
    return () => {
      dispatch(stopOrderPolling());
    };
  }, [dispatch, id, valid, failedRedirect]);

  if (!valid)
    return (
      <EmptyState
        title="No order to show"
        description="This page is reached after paying for an order."
        action={<Button to="/orders">My orders</Button>}
      />
    );
  if (failedRedirect) return <PaymentCanceledView orderId={id} />;
  if (order && loadedId === id) {
    if (order.status === 'paid') {
      dispatch(leaveOrder()); // the order page loads its own copy: keys are not kept around by this page
      return <Navigate to={`/orders/${id}`} replace />;
    }
    if (order.status === 'pending') {
      return gaveUp ? (
        <Alert
          severity="info"
          action={
            <Button variant="text" size="sm" onClick={() => dispatch(startOrderPolling(id))}>
              Check again
            </Button>
          }
        >
          We have not received the payment confirmation yet. If you paid, it can take a little
          longer. You can also find the order under My orders; you are not charged twice.
        </Alert>
      ) : (
        <div role="status">
          <Loader label="Confirming your payment…" />
        </div>
      );
    }
    return (
      <EmptyState
        title="The payment was not completed"
        description="You were not charged for this order. Your cart is still there if you want to try again."
        action={<Button to="/cart">Back to cart</Button>}
      />
    );
  }
  if (status === 'failed' && loadedId === id) {
    return (
      <ErrorMessage
        error={error}
        title="We could not check your payment"
        onRetry={() => dispatch(startOrderPolling(id))}
      />
    );
  }
  return <Loader label="Confirming your payment…" />;
}

function PaymentCanceledView({ orderId }: { orderId?: number }) {
  return (
    <EmptyState
      title="Payment canceled"
      description={
        orderId
          ? `Order #${orderId} was not paid and you were not charged. Your cart is still there if you want to try again.`
          : 'Nothing was charged. Your cart is still there if you want to try again.'
      }
      action={
        <Button to="/cart" size="lg">
          Back to cart
        </Button>
      }
    />
  );
}

/** /payment/cancel: the buyer backed out of a payment page. Nothing was charged. */
export function PaymentCancelPage() {
  const [params] = useSearchParams();
  const id = Number(params.get('order'));
  return <PaymentCanceledView orderId={Number.isInteger(id) && id > 0 ? id : undefined} />;
}
