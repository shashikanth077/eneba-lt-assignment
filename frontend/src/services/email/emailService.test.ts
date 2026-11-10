import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderDetail } from '../../types/api.types';
import { fakeApi } from '../../test/fakeApi';
import { buildOrderItemsHtml, escapeHtml } from './emailHelpers';
import {
  sendOrderConfirmationEmail,
  sendRegistrationEmail,
  sendVerificationEmail,
} from './emailService';

const send = vi.fn(async () => ({ status: 200, text: 'OK' }));
vi.mock('@emailjs/browser', () => ({
  default: { send: (...args: unknown[]) => (send as (...a: unknown[]) => unknown)(...args) },
}));

const user = { email: 'ana@example.com', displayName: 'Ana' };
const order: OrderDetail = {
  id: 42,
  status: 'paid',
  totalCents: 4500,
  currency: 'EUR',
  createdAt: '2026-01-02T10:00:00Z',
  paidAt: '2026-01-02T10:01:00Z',
  items: [
    {
      productSlug: 'a',
      productName: 'Alpha <b>Quest</b> & "Co"',
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
  vi.stubEnv('VITE_EMAILJS_AUTH_TEMPLATE_ID', 'tpl_auth');
  vi.stubEnv('VITE_EMAILJS_ORDER_TEMPLATE_ID', 'tpl_order');
};
const lastParams = () =>
  (send.mock.calls.at(-1) as unknown as [string, string, Record<string, string>])[2];

beforeEach(() => {
  send.mockClear();
  vi.unstubAllEnvs();
});

describe('escaping', () => {
  it('turns markup in a product name into text', () => {
    expect(escapeHtml(`<img src=x onerror="a()"> & 'b'`)).toBe(
      '&lt;img src=x onerror=&quot;a()&quot;&gt; &amp; &#39;b&#39;',
    );
  });

  it('escapes every value in the order rows and never reads a key', () => {
    const rows = buildOrderItemsHtml(order);
    expect(rows).toContain('Alpha &lt;b&gt;Quest&lt;/b&gt; &amp; &quot;Co&quot;');
    expect(rows).not.toContain('<b>Quest');
    expect(rows).not.toMatch(/SECRET-KEY/);
    expect(rows.match(/<tr>/g)).toHaveLength(2);
  });
});

describe('registration e-mail (AUTH template)', () => {
  it('uses the AUTH template, the public key and the welcome wording', async () => {
    configure();
    expect(await sendRegistrationEmail({ user })).toEqual({ status: 'sent' });
    expect(send).toHaveBeenCalledWith('svc', 'tpl_auth', expect.any(Object), { publicKey: 'pub' });
    expect(lastParams()).toMatchObject({
      to_name: 'Ana',
      to_email: 'ana@example.com',
      email_subject: 'Welcome to KEYMART – Your account is ready!',
      email_heading: 'Welcome aboard, Ana!',
      action_text: 'Explore Marketplace',
      action_url: `${window.location.origin}/`,
      expiry_message: '',
      company_name: 'KEYMART',
    });
    expect(lastParams().current_year).toBe(String(new Date().getFullYear()));
  });

  it('is skipped quietly when EmailJS is not configured', async () => {
    expect(await sendRegistrationEmail({ user })).toEqual({ status: 'skipped' });
    expect(send).not.toHaveBeenCalled();
  });

  it('is skipped when any one setting is missing', async () => {
    configure();
    vi.stubEnv('VITE_EMAILJS_AUTH_TEMPLATE_ID', '');
    expect(await sendRegistrationEmail({ user })).toEqual({ status: 'skipped' });
  });

  it('refuses to send without a recipient, and says what was missing', async () => {
    configure();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await sendRegistrationEmail({ user: { email: ' ', displayName: 'Ana' } });
    expect(result).toEqual({ status: 'invalid', missing: ['to_email'] });
    expect(send).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('turns a failure into a result, logging nothing about the person', async () => {
    configure();
    send.mockRejectedValueOnce(new Error('network: ana@example.com'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await sendRegistrationEmail({ user })).toEqual({ status: 'failed' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('ana@example.com');
    warn.mockRestore();
  });
});

describe('verification e-mail (same AUTH template, sent by the server)', () => {
  it('asks the API to send it: no token ever exists in the browser, and EmailJS is not called here', async () => {
    configure();
    const api = fakeApi({
      'POST /api/auth/resend-verification': { status: 202, body: { sent: true } },
    });
    expect(await sendVerificationEmail()).toEqual({ status: 'sent' });
    expect(api.callsTo('/api/auth/resend-verification')).toHaveLength(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('reports a refusal (for example the hourly limit) as failed', async () => {
    fakeApi({
      'POST /api/auth/resend-verification': {
        status: 429,
        body: { error: { code: 'too_many_requests', message: 'slow down', details: null } },
      },
    });
    expect(await sendVerificationEmail()).toEqual({ status: 'failed' });
  });
});

describe('order confirmation e-mail (ORDER template)', () => {
  it('has every variable of the template and nothing sensitive', async () => {
    configure();
    expect(await sendOrderConfirmationEmail({ order, user })).toEqual({ status: 'sent' });
    expect(send).toHaveBeenCalledWith('svc', 'tpl_order', expect.any(Object), { publicKey: 'pub' });
    const params = lastParams();
    expect(Object.keys(params).sort()).toEqual(
      [
        'company_name',
        'currency',
        'current_year',
        'discount',
        'order_date',
        'order_details_url',
        'order_items',
        'order_number',
        'order_status',
        'payment_method',
        'payment_status',
        'subtotal',
        'support_email',
        'to_email',
        'to_name',
        'total_amount',
      ].sort(),
    );
    expect(params).toMatchObject({
      order_number: '42',
      order_date: '2 January 2026',
      currency: 'EUR',
      payment_status: 'Paid',
      order_details_url: `${window.location.origin}/orders/42`,
    });
    expect(params.total_amount).toContain('45');
    expect(params.discount).toContain('0');
    expect(JSON.stringify(send.mock.calls)).not.toMatch(/SECRET-KEY/);
  });

  it('shows a discount when the server charged less than the lines add up to', async () => {
    configure();
    await sendOrderConfirmationEmail({ order: { ...order, totalCents: 4000 }, user });
    expect(lastParams().discount).toContain('5');
    expect(lastParams().subtotal).toContain('45');
  });

  it('is never sent for an order the server has not marked paid', async () => {
    configure();
    for (const status of ['pending', 'failed', 'expired'] as const) {
      const result = await sendOrderConfirmationEmail({ order: { ...order, status }, user });
      expect(result.status).toBe('invalid');
    }
    expect(send).not.toHaveBeenCalled();
  });
});
