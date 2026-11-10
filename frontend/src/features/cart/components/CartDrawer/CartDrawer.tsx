import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../../../app/hooks';
import { Button, Loader, Modal } from '../../../../components/common';
import { formatCurrency } from '../../../../utils/formatCurrency';
import { loginUrl } from '../../../../utils/redirect';
import { selectIsAuthenticated } from '../../../auth/authSlice';
import { CartItem } from '../CartItem';
import { fetchCartRequest, selectCartCount, selectCartState } from '../../cartSlice';
import styles from './CartDrawer.module.scss';

/**
 * The cart panel opened by the header's cart icon: every line (picture, name, seller, price, quantity, remove, stock warnings), the
 * total, and two actions: View cart and Checkout now. The same panel serves visitors (their browser's cart) and signed-in buyers (the
 * server's cart). Opening it refreshes prices and stock.
 */
export function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const { cart, status } = useAppSelector(selectCartState);
  const count = useAppSelector(selectCartCount);
  const signedIn = useAppSelector(selectIsAuthenticated);

  useEffect(() => {
    if (open) dispatch(fetchCartRequest());
  }, [open, dispatch]);

  const blocked = (cart?.issues.length ?? 0) > 0;
  const issues = new Map((cart?.issues ?? []).map((issue) => [issue.offerId, issue]));
  const lines = cart?.lines ?? [];

  return (
    <Modal open={open} onClose={onClose} title="My shopping cart" variant="drawerRight">
      {cart === null && status !== 'failed' ? (
        <Loader label="Loading your cart…" />
      ) : lines.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Your cart is empty</p>
          <p>Add a game and it will wait for you here.</p>
          <Button to="/store" onClick={onClose}>
            Browse the store
          </Button>
        </div>
      ) : (
        <>
          <ul className={styles.items} aria-label="Cart items">
            {lines.map((line) => (
              <CartItem key={line.offerId} line={line} issue={issues.get(line.offerId)} />
            ))}
          </ul>
          <div className={styles.footer}>
            <div className={styles.total}>
              <span>
                Total ({count} {count === 1 ? 'item' : 'items'})
              </span>
              <strong aria-label="Cart total">
                {formatCurrency(cart?.totalCents ?? 0, cart?.currency)}
              </strong>
            </div>
            <Button to="/cart" size="lg" fullWidth onClick={onClose}>
              View cart
            </Button>
            <Button
              to={signedIn ? '/checkout' : loginUrl('/checkout')}
              variant="outline"
              size="lg"
              fullWidth
              linkDisabled={blocked}
              onClick={onClose}
            >
              Checkout now
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
