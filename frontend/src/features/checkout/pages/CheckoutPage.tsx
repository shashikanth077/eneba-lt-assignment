import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { Loader } from '../../../components/common';
import { ErrorMessage } from '../../../components/feedback/ErrorMessage';
import { CartEmptyState } from '../../cart/components/CartEmptyState';
import { fetchCartRequest, selectCartState } from '../../cart/cartSlice';
import { CheckoutForm } from '../components/CheckoutForm';
import { OrderSummary } from '../components/OrderSummary';
import { resetCheckout } from '../checkoutSlice';
import styles from './CheckoutPage.module.scss';

export function CheckoutPage() {
  const dispatch = useAppDispatch();
  const { cart, status, error } = useAppSelector(selectCartState);

  useEffect(() => {
    dispatch(fetchCartRequest());
    return () => void dispatch(resetCheckout());
  }, [dispatch]);

  let body;
  if (cart === null && status === 'failed') {
    body = (
      <ErrorMessage
        error={error}
        title="We could not load your order"
        onRetry={() => dispatch(fetchCartRequest())}
      />
    );
  } else if (cart === null) {
    body = <Loader label="Loading your order…" />;
  } else if (cart.lines.length === 0) {
    body = <CartEmptyState description="Add a game to your cart before checking out." />;
  } else {
    body = (
      <div className={styles.layout}>
        <OrderSummary cart={cart} />
        <CheckoutForm cart={cart} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1>Checkout</h1>
      {body}
    </div>
  );
}
