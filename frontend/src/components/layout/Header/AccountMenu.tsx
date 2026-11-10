import { LogOut, Receipt, ShoppingCart, User as UserIcon } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { Menu, MenuDivider, MenuHeader, MenuItem, Skeleton } from '../../common';
import { logoutRequest, selectAuth } from '../../../features/auth/authSlice';
import { loginUrl } from '../../../utils/redirect';
import styles from './Header.module.scss';

/** Signed out: Sign in / Register. Signed in: initial + name, opening a menu with orders, cart and sign out. */
export function AccountMenu() {
  const { status, user } = useAppSelector(selectAuth);
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  if (status === 'unknown')
    return <Skeleton style={{ width: 40, height: 40, borderRadius: '50%' }} />;

  if (status !== 'authenticated' || !user) {
    const signIn = loginUrl(location.pathname + location.search);
    return (
      <div className={styles.actions}>
        <Link to={signIn} className={`${styles.iconLink} ${styles.onlySmall}`} aria-label="Sign in">
          <UserIcon aria-hidden />
        </Link>
        <span className={styles.authLinks}>
          <Link to={signIn}>
            <UserIcon size={22} aria-hidden style={{ marginRight: 8 }} />
            Sign in
          </Link>
          <span className={styles.divider} aria-hidden="true" />
          <Link to="/register">Register</Link>
        </span>
      </div>
    );
  }

  const signOut = () => {
    // 1. flag the sign-out (the action itself sets the flag) so a protected page shows "Signing out…" instead of redirecting to /login,
    // 2. go home, 3. the saga ends the session. A failed logout still ends it here: this browser is done with it.
    dispatch(logoutRequest());
    void navigate('/');
  };

  return (
    <Menu
      trigger={(props) => (
        <button
          type="button"
          className={styles.account}
          aria-label={`Account menu, ${user.displayName}`}
          {...props}
        >
          <span
            className={styles.avatar}
            data-initial={user.displayName.charAt(0).toUpperCase()}
            aria-hidden="true"
          />
          <span className={styles.accountName}>{user.displayName}</span>
        </button>
      )}
    >
      <MenuHeader>
        <strong>{user.displayName}</strong>
        <div className={styles.email}>{user.email}</div>
      </MenuHeader>
      <MenuDivider />
      <MenuItem to="/orders">
        <Receipt size={18} aria-hidden /> My orders
      </MenuItem>
      <MenuItem to="/cart">
        <ShoppingCart size={18} aria-hidden /> Cart
      </MenuItem>
      <MenuItem onClick={signOut}>
        <LogOut size={18} aria-hidden /> Sign out
      </MenuItem>
    </Menu>
  );
}
