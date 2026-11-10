import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commerceBackend, order } from '../../../test/commerceBackend';
import { renderApp } from '../../../test/renderApp';
import { POLL_EVERY_MS, POLL_GIVE_UP_MS } from '../ordersSaga';

const send = vi.fn(async () => ({ status: 200, text: 'OK' }));
vi.mock('@emailjs/browser', () => ({
  default: { send: (...args: unknown[]) => (send as (...a: unknown[]) => unknown)(...args) },
}));

const KEY_A = 'AAAAA-BBBBB-CCCCC';
const KEY_B = 'DDDDD-EEEEE-FFFFF';
const paid = (over = {}) =>
  order(7, 'paid', {
    paidAt: '2026-01-02T10:01:00Z',
    items: [
      {
        productSlug: 'alpha-quest-steam-global',
        productName: 'Alpha Quest',
        sellerName: 'GameNest',
        unitPriceCents: 1500,
        qty: 2,
        keys: [KEY_A, KEY_B],
      },
    ],
    ...over,
  });
const pending = () => order(7, 'pending', { reservedUntil: '2026-01-02T10:15:00Z' });

beforeEach(() => {
  send.mockClear();
  localStorage.clear();
  vi.stubEnv('VITE_EMAILJS_SERVICE_ID', 'svc');
  vi.stubEnv('VITE_EMAILJS_PUBLIC_KEY', 'pub');
  vi.stubEnv('VITE_EMAILJS_WELCOME_TEMPLATE_ID', 'tpl_welcome');
  vi.stubEnv('VITE_EMAILJS_ORDER_TEMPLATE_ID', 'tpl_order');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function openOrder(id = 7) {
  const view = renderApp(`/orders/${id}`);
  await screen.findByRole('main');
  return view;
}
const main = () => within(screen.getByRole('main'));

describe('a paid order', () => {
  it('lists the items and shows every key hidden until asked for', async () => {
    commerceBackend({ orders: [paid()] });
    await openOrder();

    expect(await main().findByRole('heading', { level: 1, name: 'Order #7' })).toBeInTheDocument();
    expect(main().getByText('Payment confirmed. Your keys are below.')).toBeInTheDocument();
    expect(main().getByText('2 × Alpha Quest')).toBeInTheDocument();
    expect(main().queryByText(KEY_A)).not.toBeInTheDocument();
    expect(main().queryByText(KEY_B)).not.toBeInTheDocument();
    expect(main().getAllByRole('button', { name: 'Reveal key' })).toHaveLength(2);
    expect(main().queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
  });

  it('reveals one key at a time, can hide it again, and copies it to the clipboard', async () => {
    commerceBackend({ orders: [paid()] });
    const writeText = vi.fn(async () => undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await openOrder();

    const [first] = await main().findAllByRole('button', { name: 'Reveal key' });
    await user.click(first);
    expect(main().getByText(KEY_A)).toBeInTheDocument();
    expect(main().queryByText(KEY_B)).not.toBeInTheDocument();

    await user.click(main().getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(KEY_A);
    expect(await main().findByText('Key copied to the clipboard')).toBeInTheDocument();
    expect(main().getByRole('button', { name: 'Copied' })).toBeInTheDocument();

    await user.click(main().getByRole('button', { name: 'Hide key' }));
    expect(main().queryByText(KEY_A)).not.toBeInTheDocument();
  });

  it('says so, and the key stays selectable, when the browser refuses clipboard access', async () => {
    commerceBackend({ orders: [paid()] });
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn(async () => {
          throw new Error('denied');
        }),
      },
      configurable: true,
    });
    await openOrder();

    await user.click((await main().findAllByRole('button', { name: 'Reveal key' }))[0]);
    await user.click(main().getByRole('button', { name: 'Copy' }));
    expect(await main().findByText(/Could not copy automatically/)).toBeInTheDocument();
    expect(main().getByText(KEY_A)).toBeInTheDocument();
  });

  it("the keys leave the browser's memory (the store) when the order page is closed", async () => {
    commerceBackend({ orders: [paid()] });
    const { store, router } = await openOrder();
    await main().findByText('Payment confirmed. Your keys are below.');
    expect(JSON.stringify(store.getState())).toContain(KEY_A); // while the page is open

    await router.navigate('/orders');
    await waitFor(() => expect(JSON.stringify(store.getState())).not.toContain(KEY_A));
  });

  it('keys are never put in the page address or in browser storage', async () => {
    commerceBackend({ orders: [paid()] });
    const { router } = await openOrder();
    await userEvent.click((await main().findAllByRole('button', { name: 'Reveal key' }))[0]);

    expect(router.state.location.pathname + router.state.location.search).not.toMatch(
      /AAAAA|BBBBB/,
    );
    expect(JSON.stringify({ ...localStorage })).not.toContain(KEY_A);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(KEY_A);
  });
});

describe('the other order states', () => {
  it.each([
    ['failed', /did not go through/],
    ['expired', /expired before it was paid/],
    ['canceled', /replaced by a newer checkout/],
    ['refund_needed', /refunding you/],
    ['refunded', /was refunded/],
  ] as const)('%s: says what happened and shows no keys', async (status, message) => {
    commerceBackend({ orders: [order(7, status)] });
    await openOrder();
    expect(await main().findByText(message)).toBeInTheDocument();
    expect(main().queryByRole('button', { name: 'Reveal key' })).not.toBeInTheDocument();
  });

  it('an order that is not yours (or does not exist) is "not found", with no hint which', async () => {
    commerceBackend({ orders: [] });
    await openOrder(9);
    expect(await main().findByText('We could not find that order')).toBeInTheDocument();
  });

  it('a nonsense id is "not found" without asking the server', async () => {
    const api = commerceBackend();
    renderApp('/orders/abc');
    expect(await screen.findByText('We could not find that order')).toBeInTheDocument();
    expect(api.calls.some((c) => c.includes('/api/orders/'))).toBe(false);
  });
});

describe('pending payment: polling while the webhook is on its way', () => {
  it('says the payment is being confirmed, asks again every 2 s, and shows the keys the moment it is paid', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = commerceBackend({ orders: [pending()] });
    await openOrder();

    expect(await main().findByText(/waiting for confirmation/)).toBeInTheDocument();
    expect(main().queryByRole('button', { name: 'Reveal key' })).not.toBeInTheDocument();
    const before = api.callsTo('/api/orders/7').length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_EVERY_MS * 2 + 100);
    });
    expect(api.callsTo('/api/orders/7').length).toBeGreaterThanOrEqual(before + 2);
    expect(main().getByText(/waiting for confirmation/)).toBeInTheDocument();

    api.orders.set(7, paid()); // the webhook arrives
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_EVERY_MS + 100);
    });

    expect(await main().findByText('Payment confirmed. Your keys are below.')).toBeInTheDocument();
    expect(main().getAllByRole('button', { name: 'Reveal key' })).toHaveLength(2);
    expect(main().queryByText(/waiting for confirmation/)).not.toBeInTheDocument();
  });

  it('stops asking once the order is paid', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = commerceBackend({ orders: [paid()] });
    await openOrder();
    await main().findByText('Payment confirmed. Your keys are below.');
    const settled = api.callsTo('/api/orders/7').length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_EVERY_MS * 5);
    });
    expect(api.callsTo('/api/orders/7')).toHaveLength(settled);
  });

  it('gives up after two minutes, says so, and "Check again" asks once more', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = commerceBackend({ orders: [pending()] });
    await openOrder();
    await main().findByText(/waiting for confirmation/);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_GIVE_UP_MS + 100);
    });
    expect(
      await main().findByText(/have not received the payment confirmation yet/),
    ).toBeInTheDocument();
    const stopped = api.callsTo('/api/orders/7').length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_EVERY_MS * 5);
    });
    expect(api.callsTo('/api/orders/7')).toHaveLength(stopped);

    api.orders.set(7, paid());
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(main().getByRole('button', { name: 'Check again' }));
    expect(await main().findByText('Payment confirmed. Your keys are below.')).toBeInTheDocument();
  });

  it('a pending order that the server expires meanwhile ends as expired, not as an endless spinner', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = commerceBackend({ orders: [pending()] });
    await openOrder();
    await main().findByText(/waiting for confirmation/);
    api.orders.set(7, order(7, 'expired'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_EVERY_MS + 100);
    });
    expect(await main().findByText(/expired before it was paid/)).toBeInTheDocument();
  });
});

describe('confirmation email', () => {
  it('is sent once when an order this browser paid for becomes paid, and contains the order number and items but NO key', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.setItem('keymart:receipt-due:7', '1');
    const api = commerceBackend({ orders: [pending()] });
    await openOrder();
    await main().findByText(/waiting for confirmation/);
    expect(send).not.toHaveBeenCalled(); // not before the server says paid

    api.orders.set(7, paid());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_EVERY_MS + 100);
    });
    await main().findByText('Payment confirmed. Your keys are below.');

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const [service, template, params, options] = send.mock.calls[0] as unknown as [
      string,
      string,
      Record<string, string>,
      { publicKey: string },
    ];
    expect([service, template, options]).toEqual(['svc', 'tpl_order', { publicKey: 'pub' }]);
    expect(params).toMatchObject({ to_email: 'ana@example.com', order_id: '7' });
    expect(params.order_items).toContain('2 x Alpha Quest (GameNest)');
    const everything = JSON.stringify(send.mock.calls);
    expect(everything).not.toContain(KEY_A);
    expect(everything).not.toContain(KEY_B);
    expect(localStorage.getItem('keymart:receipt-due:7')).toBeNull();
  });

  it('is not sent again when the page is opened again later', async () => {
    commerceBackend({ orders: [paid()] }); // no flag: an old order, or the email already went out
    await openOrder();
    await main().findByText('Payment confirmed. Your keys are below.');
    expect(send).not.toHaveBeenCalled();
  });

  it('a failing email service never breaks the page', async () => {
    send.mockRejectedValueOnce(new Error('EmailJS down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.setItem('keymart:receipt-due:7', '1');
    commerceBackend({ orders: [paid()] });
    await openOrder();
    expect(await main().findByText('Payment confirmed. Your keys are below.')).toBeInTheDocument();
    await waitFor(() => expect(warn).toHaveBeenCalled());
    warn.mockRestore();
  });
});
