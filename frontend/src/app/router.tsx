import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { LoadingState } from '../components/state/LoadingState';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { RouteErrorBoundary } from './RouteErrorBoundary';

/**
 * Every screen is its own chunk (loaded when first visited) so the first paint on a phone stays small. A page module exports one
 * named component; adding a route is one line here.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteErrorBoundary />,
    // shown while the first page's code is still loading (the very first paint of a lazy route)
    HydrateFallback: () => <LoadingState label="Loading KEYMART…" minHeight="100vh" />,
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('../features/home/HomePage')).HomePage }),
      },
      {
        path: 'store',
        lazy: async () => ({ Component: (await import('../features/store/StorePage')).StorePage }),
      },
      {
        path: 'search',
        lazy: async () => ({
          Component: (await import('../features/search/SearchPage')).SearchPage,
        }),
      },
      {
        path: 'product/:slug',
        lazy: async () => ({
          Component: (await import('../features/product/ProductPage')).ProductPage,
        }),
      },
      {
        path: 'login',
        lazy: async () => ({ Component: (await import('../features/auth/LoginPage')).LoginPage }),
      },
      {
        path: 'register',
        lazy: async () => ({
          Component: (await import('../features/auth/RegisterPage')).RegisterPage,
        }),
      },
      {
        // everything below needs a signed-in user: signed-out visitors are sent to /login?next=<this page> and back
        element: <ProtectedRoute />,
        children: [
          {
            path: 'cart',
            lazy: async () => ({ Component: (await import('../features/cart/CartPage')).CartPage }),
          },
          {
            path: 'checkout',
            lazy: async () => ({
              Component: (await import('../features/checkout/CheckoutPage')).CheckoutPage,
            }),
          },
          {
            path: 'account/orders',
            lazy: async () => ({
              Component: (await import('../features/orders/AccountOrdersPage')).AccountOrdersPage,
            }),
          },
        ],
      },
      {
        path: '*',
        lazy: async () => ({
          Component: (await import('../features/home/NotFoundPage')).NotFoundPage,
        }),
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
