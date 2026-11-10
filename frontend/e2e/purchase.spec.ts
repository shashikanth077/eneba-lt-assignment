import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const API = 'http://127.0.0.1:8080';
const WEBHOOK_SECRET = 'whsec_e2e';
const BACKEND = path.resolve(process.cwd(), '../backend');
// A new address per run, so the test can be repeated against the same database.
const email = `buyer-${Date.now()}@example.com`;
const KEY_PATTERN = /^[A-Z0-9]{5}(-[A-Z0-9]{5}){2}$/;

// What Stripe sends after the card 4242 4242 4242 4242 succeeds, signed the way Stripe signs it.
async function sendPaymentSucceeded(intentId: string, amountCents: number) {
  const body = JSON.stringify({
    id: `evt_e2e_${Date.now()}`,
    object: 'event',
    type: 'payment_intent.succeeded',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: intentId,
        object: 'payment_intent',
        amount: amountCents,
        amount_received: amountCents,
        currency: 'eur',
      },
    },
  });
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex');
  const response = await fetch(`${API}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${v1}` },
    body,
  });
  return response.status;
}

test('a visitor registers, fills a cart from two sellers, pays and reads the key', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const banner = page.getByRole('banner');
  const summary = page.getByRole('region', { name: 'Order summary' });

  await test.step('register', async () => {
    await page.goto('/register');
    await page.getByLabel(/display name/i).fill('E2E Buyer');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill('correct-horse-battery');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL('/');
  });

  await test.step('add offers from two different sellers; the cart badge follows', async () => {
    await page.goto('/product/tides-of-stormhaven-steam-global');
    await expect(page.getByRole('table')).toBeVisible();
    const sellers = await page
      .locator('tbody tr th')
      .evaluateAll((cells) => cells.map((cell) => cell.childNodes[0].textContent?.trim() ?? ''));
    expect(new Set(sellers).size).toBeGreaterThanOrEqual(2);
    await page.getByRole('button', { name: `Add to cart, offer from ${sellers[0]}` }).click();
    await expect(banner.getByRole('link', { name: 'Cart, 1 items' })).toBeVisible();
    await page.getByRole('button', { name: `Add to cart, offer from ${sellers[1]}` }).click();
    await expect(banner.getByRole('link', { name: 'Cart, 2 items' })).toBeVisible();
  });

  await test.step('the cart shows the server total and edits go through the server', async () => {
    await page.goto('/cart');
    await expect(page.getByRole('list', { name: 'Cart items' })).toBeVisible();
    await page
      .getByRole('button', { name: /Increase quantity of/ })
      .first()
      .click();
    await expect(summary.getByText('3 items')).toBeVisible();
    await page
      .getByRole('button', { name: /Decrease quantity of/ })
      .first()
      .click();
    await expect(summary.getByText('2 items')).toBeVisible();
    const cart = await (await page.request.get('/api/cart')).json();
    expect(cart.lines).toHaveLength(2);
    const euros = (cents: number) =>
      (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'EUR' });
    await expect(page.getByLabel('Total')).toHaveText(
      new RegExp(euros(cart.totalCents).replace(/\s/g, '\\s')),
    );
  });

  await test.step('checkout shows the same order and says plainly that Stripe is not set up', async () => {
    await page.goto('/checkout');
    await expect(summary).toBeVisible();
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    await expect(page.getByRole('alert')).toContainText(
      /not available|unavailable|not set up|not configured/i,
    );
  });

  // Order creation uses the API's fake payment gateway (the same one the PHP tests use): reserves the keys, order stays pending.
  const order = JSON.parse(
    execFileSync('php', ['tests/bin/dev_order.php', email], {
      cwd: BACKEND,
      encoding: 'utf8',
    }).trim(),
  ) as { orderId: number; paymentIntentId: string; totalCents: number };

  await test.step('while the payment is pending, no key is offered', async () => {
    await page.goto(`/orders/${order.orderId}`);
    await expect(page.getByText(/waiting for confirmation/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reveal key' })).toHaveCount(0);
  });

  await test.step('the signed webhook arrives and the open page flips to paid by itself', async () => {
    expect(await sendPaymentSucceeded(order.paymentIntentId, order.totalCents)).toBe(200);
    await expect(page.getByText('Payment confirmed. Your keys are below.')).toBeVisible({
      timeout: 15_000,
    });
  });

  await test.step('reveal and copy a key; hiding removes it again', async () => {
    const reveal = page.getByRole('button', { name: 'Reveal key' });
    expect(await reveal.count()).toBeGreaterThanOrEqual(2);
    expect(await page.locator('main').innerText()).not.toMatch(
      /[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}/,
    );
    await reveal.first().click();
    const key = await page.locator('main code').first().innerText();
    expect(key).toMatch(KEY_PATTERN);
    await page.getByRole('button', { name: 'Copy' }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(key);
    await page.getByRole('button', { name: 'Hide key' }).click();
    expect(await page.locator('main').innerText()).not.toContain(key);
  });

  await test.step('the order history lists the order as Paid, without keys', async () => {
    await page.goto('/orders');
    const row = page.getByRole('list', { name: 'Orders' }).getByRole('link').first();
    await expect(row).toContainText('Paid');
    expect(await page.locator('main').innerText()).not.toMatch(
      /[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}/,
    );
  });
});
