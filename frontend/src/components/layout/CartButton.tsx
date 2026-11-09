import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import Badge from '@mui/material/Badge';
import IconButton from '@mui/material/IconButton';
import { Link as RouterLink } from 'react-router-dom';
import { useAppSelector } from '../../app/hooks';
import { useGetCartQuery } from '../../features/cart/cartApi';

/** Cart icon with the number of items in the (server-side) cart. Signed-out visitors have no cart: no request, no badge. */
export function CartButton() {
  const signedIn = useAppSelector((state) => state.auth.status === 'authenticated');
  const { data } = useGetCartQuery(undefined, { skip: !signedIn });
  const count = data?.lines.reduce((sum, line) => sum + line.qty, 0) ?? 0;

  return (
    <IconButton
      component={RouterLink}
      to="/cart"
      color="inherit"
      aria-label={count > 0 ? `Cart, ${count} items` : 'Cart'}
    >
      <Badge badgeContent={count} color="error" max={99}>
        <ShoppingCartOutlinedIcon />
      </Badge>
    </IconButton>
  );
}
