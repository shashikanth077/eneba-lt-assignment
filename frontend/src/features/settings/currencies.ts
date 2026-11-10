/**
 * Display currencies. The shop SELLS in euros and the card is always charged in euros; another currency only changes how catalogue
 * prices are shown. The rates are fixed reference values for this demo (NOT live exchange rates), which is why the cart, checkout and
 * orders always show euros and say so.
 */
export const BASE_CURRENCY = 'EUR';

export interface DisplayCurrency {
  code: string;
  label: string;
  /** units of this currency per 1 EUR */
  rate: number;
}

export const DISPLAY_CURRENCIES: DisplayCurrency[] = [
  { code: 'EUR', label: 'Euro (EUR)', rate: 1 },
  { code: 'USD', label: 'US Dollar (USD)', rate: 1.08 },
  { code: 'GBP', label: 'British Pound (GBP)', rate: 0.85 },
  { code: 'AED', label: 'United Arab Emirates Dirham (AED)', rate: 3.96 },
];

export const isDisplayCurrency = (code: unknown): code is string =>
  typeof code === 'string' && DISPLAY_CURRENCIES.some((currency) => currency.code === code);

/** Euro cents -> cents of the display currency (rounded). */
export function convertCents(euroCents: number, code: string): number {
  const rate = DISPLAY_CURRENCIES.find((currency) => currency.code === code)?.rate ?? 1;
  return Math.round(euroCents * rate);
}

/** Languages the interface is available in. Only English exists: there are no translations yet (docs/FRONTEND.md). */
export const LANGUAGES = [{ code: 'en', label: 'English (EU)' }];
