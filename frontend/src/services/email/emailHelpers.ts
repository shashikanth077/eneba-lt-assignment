import type { OrderDetail } from '../../types/api.types';
import { formatCurrency } from '../../utils/formatCurrency';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text that is placed inside HTML. Product and seller names come from the database and must never become markup. */
export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Names of the entries that are empty (after trimming): the "missing required variables" check. */
export function missingValues(values: Record<string, string>): string[] {
  return Object.entries(values)
    .filter(([, value]) => value.trim() === '')
    .map(([name]) => name);
}

/** A deliberately simple shape check (something@host.tld, no spaces): the server and EmailJS do the real validation. */
export const looksLikeEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export const isHttpUrl = (value: string): boolean => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
};

export const currentYear = (): string => String(new Date().getFullYear());

export const siteUrl = (path: string): string => `${window.location.origin}${path}`;

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
export const formatOrderDate = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
};

const CELL =
  'padding:12px 0;border-bottom:1px solid #e6e1f2;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1d1535;';

/**
 * The purchased products as table rows for {{{order_items}}}: name and seller on the left, line total on the right.
 * Every value is escaped. Only names, quantities and prices are read from the order: it carries game keys too, which are never touched.
 */
export function buildOrderItemsHtml(order: OrderDetail): string {
  return order.items
    .map((item) => {
      const name = escapeHtml(item.productName);
      const seller = escapeHtml(item.sellerName);
      const total = escapeHtml(formatCurrency(item.unitPriceCents * item.qty, order.currency));
      return (
        `<tr><td style="${CELL}">${name}<br><span style="font-size:12px;color:#6b6385;">Sold by ${seller} · Qty ${item.qty}</span></td>` +
        `<td align="right" style="${CELL}white-space:nowrap;font-weight:bold;">${total}</td></tr>`
      );
    })
    .join('');
}
