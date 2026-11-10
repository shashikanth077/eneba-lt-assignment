import { ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppSelector } from '../../../app/hooks';
import { CartDrawer } from '../../../features/cart/components/CartDrawer';
import { selectCartCount } from '../../../features/cart/cartSlice';
import styles from './Header.module.scss';

/**
 * Cart icon with the number of items (the account's cart when signed in, the browser's own cart for a visitor). A plain click opens the
 * cart panel; it is still a real link to /cart, so "open in a new tab" and no-script browsers land on the full cart page.
 */
export function CartButton() {
  const shown = useAppSelector(selectCartCount);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Link
        to="/cart"
        className={styles.iconLink}
        aria-label={shown > 0 ? `Cart, ${shown} items` : 'Cart'}
        aria-haspopup="dialog"
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        <ShoppingCart aria-hidden />
        {shown > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {shown > 99 ? '99+' : shown}
          </span>
        )}
      </Link>
      <CartDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
