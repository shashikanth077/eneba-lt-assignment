/** Integer cents + ISO currency -> "€12.34" style text in the user's locale. */
export function formatCurrency(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency })
    .format(cents / 100)
    .replace(/[\u00a0\u202f]/g, ' ');
}
