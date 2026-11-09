import LogoutIcon from '@mui/icons-material/Logout';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { useLogoutMutation } from '../../features/auth/authApi';
import { signOutStarted } from '../../features/auth/authSlice';
import { loginUrl } from '../../lib/redirect';

/** Signed out: Sign in / Register. Signed in: initial + name, opening a menu with orders, cart and sign out. */
export function AccountMenu() {
  const { status, user } = useAppSelector((state) => state.auth);
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [logout] = useLogoutMutation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (status === 'unknown') return <Skeleton variant="circular" width={40} height={40} />;

  if (status !== 'authenticated' || !user) {
    const signIn = loginUrl(location.pathname + location.search);
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <IconButton
          component={RouterLink}
          to={signIn}
          color="inherit"
          aria-label="Sign in"
          sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
        >
          <PersonOutlinedIcon />
        </IconButton>
        <Button
          component={RouterLink}
          to={signIn}
          color="inherit"
          sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
        >
          Sign in
        </Button>
        <Button
          component={RouterLink}
          to="/register"
          variant="contained"
          size="small"
          sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
        >
          Register
        </Button>
      </Box>
    );
  }

  const close = () => setAnchor(null);
  const signOut = async () => {
    close();
    // 1. flag the sign-out so a protected page shows "Signing out…" instead of redirecting to /login,
    // 2. go home, 3. end the session. (A failed logout clears the flag again and the user stays signed in.)
    dispatch(signOutStarted());
    await navigate('/');
    await logout();
  };

  return (
    <>
      <Button
        color="inherit"
        onClick={(event) => setAnchor(event.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        aria-label="Account menu"
        sx={{ gap: 1, textTransform: 'none' }}
      >
        <Avatar
          sx={{
            width: 32,
            height: 32,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            fontSize: 16,
            fontWeight: 800,
          }}
        >
          {user.displayName.charAt(0).toUpperCase()}
        </Avatar>
        <Box
          component="span"
          sx={{
            display: { xs: 'none', md: 'inline' },
            maxWidth: 140,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {user.displayName}
        </Box>
      </Button>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={close}>
        <Box sx={{ px: 2, py: 1, maxWidth: 260 }}>
          <Typography noWrap sx={{ fontWeight: 700 }}>
            {user.displayName}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {user.email}
          </Typography>
        </Box>
        <Divider />
        <MenuItem component={RouterLink} to="/account/orders" onClick={close}>
          <ListItemIcon>
            <ReceiptLongIcon fontSize="small" />
          </ListItemIcon>
          My orders
        </MenuItem>
        <MenuItem component={RouterLink} to="/cart" onClick={close}>
          <ListItemIcon>
            <ShoppingCartOutlinedIcon fontSize="small" />
          </ListItemIcon>
          Cart
        </MenuItem>
        <MenuItem onClick={() => void signOut()}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>
    </>
  );
}
