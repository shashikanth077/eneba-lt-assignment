import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { MainLayout } from '../components/layout/MainLayout';
import { Loader } from '../components/common';
import { ProtectedRoute } from '../features/auth/components/ProtectedRoute';
import { RouteErrorBoundary } from './RouteErrorBoundary';

/**
 * Every screen is its own chunk (loaded when first visited) so the first paint on a phone stays small. A page module exports one
 * named component; adding a route is one entry here.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <MainLayout />,
    errorElement: <RouteErrorBoundary />,
    // shown while the first page's code is still loading (the very first paint of a lazy route)
    HydrateFallback: () => <Loader label="Loading KEYMART…" />,
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import('../features/home/pages/HomePage')).HomePage,
        }),
      },
      {
        path: 'store',
        lazy: async () => ({
          Component: (await import('../features/products/pages/ProductListingPage'))
            .ProductListingPage,
        }),
      },
      {
        path: 'search',
        lazy: async () => ({
          Component: (await import('../features/products/pages/SearchResultsPage'))
            .SearchResultsPage,
        }),
      },
      {
        path: 'product/:slug',
        lazy: async () => ({
          Component: (await import('../features/products/pages/ProductDetailsPage'))
            .ProductDetailsPage,
        }),
      },
      {
        path: 'login',
        lazy: async () => ({
          Component: (await import('../features/auth/pages/LoginPage')).LoginPage,
        }),
      },
      {
        path: 'register',
        lazy: async () => ({
          Component: (await import('../features/auth/pages/RegisterPage')).RegisterPage,
        }),
      },
      {
        // everything below needs a signed-in user: signed-out visitors are sent to /login?next=<this page> and back
        element: <ProtectedRoute />,
        children: [
          {
            path: 'cart',
            lazy: async () => ({
              Component: (await import('../features/cart/pages/CartPage')).CartPage,
            }),
          },
          {
            path: 'checkout',
            lazy: async () => ({
              Component: (await import('../features/checkout/pages/CheckoutPage')).CheckoutPage,
            }),
          },
          {
            path: 'orders',
            lazy: async () => ({
              Component: (await import('../features/orders/pages/OrderHistoryPage'))
                .OrderHistoryPage,
            }),
          },
          {
            path: 'orders/:id',
            lazy: async () => ({
              Component: (await import('../features/orders/pages/OrderDetailsPage'))
                .OrderDetailsPage,
            }),
          },
          {
            path: 'payment/success',
            lazy: async () => ({
              Component: (await import('../features/checkout/pages/PaymentResultPage'))
                .PaymentSuccessPage,
            }),
          },
          {
            path: 'payment/cancel',
            lazy: async () => ({
              Component: (await import('../features/checkout/pages/PaymentResultPage'))
                .PaymentCancelPage,
            }),
          },
        ],
      },
      {
        path: '*',
        lazy: async () => ({
          Component: (await import('../features/home/pages/NotFoundPage')).NotFoundPage,
        }),
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
