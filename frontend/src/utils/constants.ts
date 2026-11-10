/** Where the shared constants live: values the TypeScript side needs (the SCSS side has styles/variables.scss). */
export const PAGE_SIZE = 24;
export const ORDERS_PAGE_SIZE = 10;
export const MAX_QTY_PER_LINE = 5;

/** The brand colours as JS values, for the one place CSS cannot reach: Stripe's Payment Element (rendered in an iframe). */
export const STRIPE_THEME = {
  colorPrimary: '#fad318',
  colorBackground: '#2a0e69',
  colorText: '#ffffff',
  fontFamily: 'Montserrat, Helvetica Neue, Arial, sans-serif',
  borderRadius: '2px',
} as const;

/** How long a search box must rest before it searches. */
export const SEARCH_DEBOUNCE_MS = 400;
