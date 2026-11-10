import { ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppSelector } from '../../../app/hooks';
import { selectCartCount } from '../../../features/cart/cartSlice';
import styles from './Header.module.scss';

/** Cart icon with the number of items: the account's cart when signed in, the browser's own cart for a visitor. */
export function CartButton() {
  const shown = useAppSelector(selectCartCount);

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
