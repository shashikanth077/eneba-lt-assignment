import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError } from '../../../test/fakeApi';
import { commerceBackend, line, order } from '../../../test/commerceBackend';
import { formatCurrency } from '../../../utils/formatCurrency';
import { renderApp } from '../../../test/renderApp';

// Stripe.js is a script from js.stripe.com; the tests replace it with a stand-in that records what the page asks of it.
const confirmPayment = vi.fn();
const elementsOptions = vi.fn();
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn(async () => ({ id: 'stripe' })) }));
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children, options }: { children: React.ReactNode; options: unknown }) => {
    elementsOptions(options);
    return <>{children}</>;
  },
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => ({ confirmPayment }),
  useElements: () => ({}),
}));

const CHECKOUT = {
  orderId: 7,
  clientSecret: 'pi_7_secret_abc',
  totalCents: 3000,
  currency: 'EUR',
  reservedUntil: '2026-01-02T10:15:00Z',
};
const A = line(1, 'Alpha Quest', 1500, 2);

beforeEach(() => {
  confirmPayment.mockReset();
  elementsOptions.mockReset();
  vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_123');
  localStorage.clear();
});
afterEach(() => vi.unstubAllEnvs());

async function openCheckout() {
  const view = renderApp('/checkout');
  await screen.findByRole('heading', { level: 1, name: 'Checkout' });
  return view;
}
const startPayment = async () =>
  userEvent.click(await screen.findByRole('button', { name: 'Continue to payment' }));

describe('order summary', () => {
  it("shows what is being bought and the server's total, and does not reserve anything yet", async () => {
    const api = commerceBackend({ lines: [A, line(2, 'Bravo Run', 1000)] });
    await openCheckout();

    const summary = within(await screen.findByRole('region', { name: 'Order summary' }));
    expect(summary.getByText('2 × Alpha Quest')).toBeInTheDocument();
    expect(summary.getByText('1 × Bravo Run')).toBeInTheDocument();
    expect(summary.getByText(formatCurrency(4000))).toBeInTheDocument();
    expect(api.callsTo('/api/checkout')).toHaveLength(0); // visiting the page holds no stock
  });

  it('an empty cart has nothing to check out', async () => {
    commerceBackend();
    renderApp('/checkout');
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument();
  });

  it('a cart with a problem line cannot start a payment', async () => {
    commerceBackend({ lines: [A], issues: [{ offerId: 1, code: 'inactive', message: 'x' }] });
    await openCheckout();
    expect(await screen.findByRole('button', { name: 'Continue to payment' })).toBeDisabled();
  });
});

describe('paying', () => {
  it("starts the payment with NO amount in the request (the server computes it) and shows the server's total on the Pay button", async () => {
    let sent: unknown = 'not called';
    const api = commerceBackend({
      lines: [A],
      extra: {
        'POST /api/checkout': ({ body }) => {
          sent = body;
          return { status: 201, body: CHECKOUT };
        },
      },
    });
    await openCheckout();
    await startPayment();

    expect(await screen.findByTestId('payment-element')).toBeInTheDocument();
    expect(sent).toBeNull(); // no body at all: nothing the browser says can change the amount
    expect(screen.getByRole('button', { name: `Pay ${formatCurrency(3000)}` })).toBeEnabled();
    expect(elementsOptions).toHaveBeenCalledWith(
      expect.objectContaining({ clientSecret: 'pi_7_secret_abc' }),
    );
    const posts = api.calls.filter((c) => c.startsWith('POST /api/checkout'));
    expect(posts).toEqual(['POST /api/checkout']);
    expect(screen.getByText(/4242 4242 4242 4242/)).toBeInTheDocument();
  });

  it('a payment that succeeds goes to the result page, which asks the server and waits while the order is pending', async () => {
    confirmPayment.mockResolvedValue({ paymentIntent: { status: 'succeeded' } });
    const api = commerceBackend({
      lines: [A],
      orders: [order(7, 'pending')],
      extra: { 'POST /api/checkout': { status: 201, body: CHECKOUT } },
    });
    const { router } = await openCheckout();
    await startPayment();
    await userEvent.click(
      await screen.findByRole('button', { name: `Pay ${formatCurrency(3000)}` }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe('/payment/success'));
    expect(router.state.location.search).toBe('?order=7');
    expect(confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        redirect: 'if_required',
        confirmParams: { return_url: `${window.location.origin}/payment/success?order=7` },
      }),
    );
    await waitFor(() => expect(screen.getByText('Confirming your payment…')).toBeInTheDocument()); // not paid yet: no keys, no redirect to the order
    await waitFor(() => expect(api.callsTo('/api/orders/7').length).toBeGreaterThan(0));
    expect(api.callsTo('/api/orders/7').length).toBeGreaterThan(0);
    expect(localStorage.getItem('keymart:receipt-due:7')).toBe('1'); // the receipt email is owed once the server confirms
  });

  it("a declined card shows Stripe's message, stays on the form and can be retried", async () => {
    confirmPayment.mockResolvedValueOnce({ error: { message: 'Your card was declined.' } });
    commerceBackend({
      lines: [A],
      extra: { 'POST /api/checkout': { status: 201, body: CHECKOUT } },
    });
    const { router } = await openCheckout();
    await startPayment();
    await userEvent.click(
      await screen.findByRole('button', { name: `Pay ${formatCurrency(3000)}` }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Your card was declined.');
    expect(router.state.location.pathname).toBe('/checkout');
    expect(screen.getByRole('button', { name: `Pay ${formatCurrency(3000)}` })).toBeEnabled();

    confirmPayment.mockResolvedValueOnce({ paymentIntent: { status: 'succeeded' } });
    await userEvent.click(screen.getByRole('button', { name: `Pay ${formatCurrency(3000)}` }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/payment/success'));
    expect(confirmPayment).toHaveBeenCalledTimes(2);
  });

  it('cannot be submitted twice while a payment is in flight', async () => {
    let finish: (value: unknown) => void = () => undefined;
    confirmPayment.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    commerceBackend({
      lines: [A],
      orders: [order(7, 'pending')],
      extra: { 'POST /api/checkout': { status: 201, body: CHECKOUT } },
    });
    await openCheckout();
    await startPayment();
    await userEvent.click(
      await screen.findByRole('button', { name: `Pay ${formatCurrency(3000)}` }),
    );

    expect(await screen.findByRole('button', { name: 'Processing…' })).toBeDisabled();
    finish({ paymentIntent: { status: 'succeeded' } });
    expect(confirmPayment).toHaveBeenCalledTimes(1);
  });
});

describe('when the server refuses to start the payment', () => {
  it('names the items that ran out and sends the buyer back to the cart', async () => {
    commerceBackend({
      lines: [A],
      extra: {
        'POST /api/checkout': apiError(
          409,
          'out_of_stock',
          'Some items are no longer available, nothing was reserved',
          {
            items: [{ offerId: 1, code: 'out_of_stock', requested: 2, available: 1 }],
          },
        ),
      },
    });
    await openCheckout();
    await startPayment();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('nothing was reserved or charged');
    expect(alert).toHaveTextContent('Alpha Quest: you want 2, 1 left');
    expect(within(alert).getByRole('link', { name: 'Back to cart' })).toHaveAttribute(
      'href',
      '/cart',
    );
    expect(screen.queryByTestId('payment-element')).not.toBeInTheDocument();
  });

  it('explains a payment provider problem and lets the buyer try again', async () => {
    commerceBackend({
      lines: [A],
      extra: {
        'POST /api/checkout': apiError(
          503,
          'payments_unavailable',
          'Payments are not available right now',
        ),
      },
    });
    await openCheckout();
    await startPayment();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Payments are not available right now',
    );
    expect(screen.getByRole('button', { name: 'Continue to payment' })).toBeEnabled();
  });

  it('without a Stripe TEST key the form says so, and a live key is refused', async () => {
    commerceBackend({
      lines: [A],
      extra: { 'POST /api/checkout': { status: 201, body: CHECKOUT } },
    });
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_live_abc');
    await openCheckout();
    await startPayment();
    expect(
      await screen.findByText(/Payments are not set up in this environment/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('payment-element')).not.toBeInTheDocument();
  });
});

describe('after the payment: the result page', () => {
  it('moves on to the order page by itself once the server says paid', async () => {
    confirmPayment.mockResolvedValue({ paymentIntent: { status: 'succeeded' } });
    commerceBackend({
      lines: [A],
      orders: [order(7, 'paid', { paidAt: '2026-01-02T10:01:00Z' })],
      extra: { 'POST /api/checkout': { status: 201, body: CHECKOUT } },
    });
    const { router } = await openCheckout();
    await startPayment();
    await userEvent.click(
      await screen.findByRole('button', { name: `Pay ${formatCurrency(3000)}` }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe('/orders/7'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Order #7' })).toBeInTheDocument();
  });

  it('says so when the order failed, and does not claim success', async () => {
    commerceBackend({ orders: [order(7, 'failed')] });
    renderApp('/payment/success?order=7');
    expect(await screen.findByText('The payment was not completed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to cart' })).toHaveAttribute('href', '/cart');
  });

  it('a redirect that Stripe reports as failed goes straight to the "canceled" message without asking for the order', async () => {
    const api = commerceBackend({ orders: [order(7, 'pending')] });
    renderApp('/payment/success?order=7&redirect_status=failed');
    expect(await screen.findByText('Payment canceled')).toBeInTheDocument();
    expect(api.callsTo('/api/orders/7')).toHaveLength(0);
  });

  it('/payment/cancel says nothing was charged', async () => {
    commerceBackend();
    renderApp('/payment/cancel');
    expect(await screen.findByText('Payment canceled')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to cart' })).toHaveAttribute('href', '/cart');
  });

  it('a missing or nonsense order number is handled', async () => {
    commerceBackend();
    renderApp('/payment/success?order=abc');
    expect(await screen.findByText('No order to show')).toBeInTheDocument();
  });
});
