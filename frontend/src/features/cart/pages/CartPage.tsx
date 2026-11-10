import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { Loader } from '../../../components/common';
import { ErrorMessage } from '../../../components/feedback/ErrorMessage';
import { CartEmptyState } from '../components/CartEmptyState';
import { CartItem } from '../components/CartItem';
import { CartSummary } from '../components/CartSummary';
import { fetchCartRequest, selectCartState } from '../cartSlice';
import styles from './CartPage.module.scss';

export function CartPage() {
  const dispatch = useAppDispatch();
  const { cart, status, error } = useAppSelector(selectCartState);

  useEffect(() => {
    dispatch(fetchCartRequest()); // always refresh: prices and stock are read live by the server
  }, [dispatch]);

  let body;
  if (cart === null && status === 'failed') {
    body = (
      <ErrorMessage
        error={error}
        title="We could not load your cart"
        onRetry={() => dispatch(fetchCartRequest())}
      />
    );
  } else if (cart === null) {
    body = <Loader label="Loading your cart…" />;
  } else if (cart.lines.length === 0) {
    body = <CartEmptyState />;
  } else {
    const issues = new Map(cart.issues.map((issue) => [issue.offerId, issue]));
    body = (
      <div className={styles.layout}>
        <ul className={styles.items} aria-label="Cart items">
          {cart.lines.map((line) => (
            <CartItem key={line.offerId} line={line} issue={issues.get(line.offerId)} />
          ))}
        </ul>
        <CartSummary cart={cart} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1>Your cart</h1>
      {body}
    </div>
  );
}
