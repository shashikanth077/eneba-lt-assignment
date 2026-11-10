import { ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppSelector } from '../../../app/hooks';
import { selectIsAuthenticated } from '../../../features/auth/authSlice';
import { selectCartCount } from '../../../features/cart/cartSlice';
import styles from './Header.module.scss';

/** Cart icon with the number of items in the (server-side) cart. Signed-out visitors have no cart: no badge. */
export function CartButton() {
  const signedIn = useAppSelector(selectIsAuthenticated);
  const count = useAppSelector(selectCartCount);
  const shown = signedIn ? count : 0;

  return (
    <Link
      to="/cart"
      className={styles.iconLink}
      aria-label={shown > 0 ? `Cart, ${shown} items` : 'Cart'}
    >
      <ShoppingCart aria-hidden />
      {shown > 0 && (
        <span className={styles.badge} aria-hidden="true">
          {shown > 99 ? '99+' : shown}
        </span>
      )}
    </Link>
  );
}
