import { BASE_CURRENCY, isDisplayCurrency } from './currencies';

const KEY = 'keymart:settings:v1';

/** The visitor's chosen display currency, kept in this browser. Never throws; euros by default. */
export function loadCurrency(): string {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const code = (parsed as { currency?: unknown } | null)?.currency;
    return isDisplayCurrency(code) ? code : BASE_CURRENCY;
  } catch {
    return BASE_CURRENCY;
  }
}

export function saveCurrency(currency: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ currency }));
  } catch {
    // storage unavailable: the choice lasts for this page view
  }
}
