import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderDetail, User } from '../../api/types';
import {
  buildReceiptParams,
  buildWelcomeParams,
  emailConfig,
  sendOrderReceipt,
  sendWelcomeEmail,
} from './emailjs';
import { markReceiptDue, takeReceiptDue } from './receiptFlag';

const send = vi.fn(async () => ({ status: 200, text: 'OK' }));
vi.mock('@emailjs/browser', () => ({
  default: { send: (...args: unknown[]) => (send as (...a: unknown[]) => unknown)(...args) },
}));

const user: User = { id: 1, email: 'ana@example.com', displayName: 'Ana' };
const order: OrderDetail = {
  id: 42,
  status: 'paid',
  totalCents: 4500,
  currency: 'EUR',
  createdAt: '2026-01-02T10:00:00Z',
  items: [
    {
      productSlug: 'a',
      productName: 'Alpha Quest',
      sellerName: 'GameNest',
      unitPriceCents: 1500,
      qty: 2,
      keys: ['SECRET-KEY-ONE', 'SECRET-KEY-TWO'],
    },
    {
      productSlug: 'b',
      productName: 'Bravo Run',
      sellerName: 'Nova Keys',
      unitPriceCents: 1500,
      qty: 1,
      keys: ['SECRET-KEY-THREE'],
    },
  ],
};

const configure = () => {
  vi.stubEnv('VITE_EMAILJS_SERVICE_ID', 'svc');
  vi.stubEnv('VITE_EMAILJS_PUBLIC_KEY', 'pub');
  vi.stubEnv('VITE_EMAILJS_WELCOME_TEMPLATE_ID', 'tpl_welcome');
  vi.stubEnv('VITE_EMAILJS_ORDER_TEMPLATE_ID', 'tpl_order');
};

beforeEach(() => {
  send.mockClear();
  localStorage.clear();
});
afterEach(() => vi.unstubAllEnvs());

describe('receipt email content', () => {
  it('has the order number, every item with quantity and seller, and the total', () => {
    const params = buildReceiptParams(order, user);
    expect(params.order_id).toBe('42');
    expect(params.to_email).toBe('ana@example.com');
    expect(params.order_items.split('\n')).toHaveLength(2);
    expect(params.order_items).toContain('2 x Alpha Quest (GameNest)');
    expect(params.order_items).toContain('1 x Bravo Run (Nova Keys)');
    expect(params.order_total).toContain('45');
  });

  it('contains no key anywhere, whatever the order carries', () => {
    const everything = JSON.stringify(buildReceiptParams(order, user));
    expect(everything).not.toMatch(/SECRET-KEY/);
  });

  it('offers only the fields the templates use (no way to smuggle a key in as an extra field)', () => {
    expect(Object.keys(buildReceiptParams(order, user)).sort()).toEqual([
      'order_id',
      'order_items',
      'order_total',
      'to_email',
      'to_name',
    ]);
    expect(Object.keys(buildWelcomeParams(user)).sort()).toEqual(['to_email', 'to_name']);
  });
});

describe('sending', () => {
  it('does nothing, quietly, when EmailJS is not configured', async () => {
    expect(emailConfig()).toBeNull();
    expect(await sendWelcomeEmail(user)).toBe(false);
    expect(await sendOrderReceipt(order, user)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('is not configured when any one setting is missing', () => {
    configure();
    vi.stubEnv('VITE_EMAILJS_PUBLIC_KEY', '');
    expect(emailConfig()).toBeNull();
  });

  it('sends the welcome email with the welcome template and the public key', async () => {
    configure();
    expect(await sendWelcomeEmail(user)).toBe(true);
    expect(send).toHaveBeenCalledWith(
      'svc',
      'tpl_welcome',
      { to_email: 'ana@example.com', to_name: 'Ana' },
      { publicKey: 'pub' },
    );
  });

  it('turns a failure into false and a console warning instead of an exception', async () => {
    configure();
    send.mockRejectedValueOnce(new Error('network'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(sendOrderReceipt(order, user)).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('receipt flag', () => {
  it('is taken exactly once, per order', () => {
    expect(takeReceiptDue(1)).toBe(false);
    markReceiptDue(1);
    expect(takeReceiptDue(2)).toBe(false);
    expect(takeReceiptDue(1)).toBe(true);
    expect(takeReceiptDue(1)).toBe(false);
  });

  it('fails safe (no email) when storage is unavailable', () => {
    const broken = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(takeReceiptDue(1)).toBe(false);
    broken.mockRestore();
  });
});
