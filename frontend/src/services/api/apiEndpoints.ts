/** Every backend path in one place, so a renamed route is a one-line change. */
export const endpoints = {
  me: '/auth/me',
  login: '/auth/login',
  register: '/auth/register',
  logout: '/auth/logout',
  profile: '/auth/profile',
  changePassword: '/auth/change-password',
  clientLog: '/client-log',
  verifyEmail: '/auth/verify-email',
  resendVerification: '/auth/resend-verification',
  products: '/products',
  product: (slug: string) => `/products/${encodeURIComponent(slug)}`,
  filters: '/filters',
  search: '/search',
  suggest: '/search/suggest',
  homeLayout: '/home/layout',
  cart: '/cart',
  cartLine: (offerId: number) => `/cart/${offerId}`,
  checkout: '/checkout',
  orders: '/orders',
  order: (id: number) => `/orders/${id}`,
} as const;

/** Auth calls that are SUPPOSED to be able to answer 401 (a wrong password, "who am I?" while signed out). */
export const AUTH_PROBES: readonly string[] = [
  endpoints.me,
  endpoints.login,
  endpoints.register,
  endpoints.logout,
];
