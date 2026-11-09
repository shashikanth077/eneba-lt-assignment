import { loadStripe, type Stripe } from '@stripe/stripe-js';

/** The publishable key (pk_test_...), safe to ship to the browser. Empty when not configured. */
export const publishableKey = (): string => import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '';

/** This project only ever talks to Stripe's TEST mode: a live key is refused here, whatever the environment says. */
export const isTestKey = (key: string): boolean => key.startsWith('pk_test_');

let cached: { key: string; stripe: Promise<Stripe | null> } | null = null;

/** Loads Stripe.js once (it is a script from js.stripe.com) and reuses it. Null when there is no usable test key. */
export function getStripe(): Promise<Stripe | null> | null {
  const key = publishableKey();
  if (!isTestKey(key)) return null;
  if (cached === null || cached.key !== key) cached = { key, stripe: loadStripe(key) };
  return cached.stripe;
}
