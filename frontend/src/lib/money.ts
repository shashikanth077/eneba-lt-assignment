/** Integer cents + ISO currency -> "12.34 €" style text in the user's locale. */
export function formatMoney(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}
