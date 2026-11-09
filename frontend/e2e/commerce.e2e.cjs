/**
 * Browser check of sign-up, cart, checkout, order page and keys against the real API and database.
 *
 * What it can NOT do: pay with Stripe. Stripe.js (js.stripe.com) and the Stripe API are separate services, and this check runs
 * without a Stripe account. So it plays Stripe's part: a pending order is created with the backend's fake payment gateway
 * (backend/tests/bin/dev_order.php) and a correctly SIGNED webhook is posted to the real webhook endpoint, exactly what Stripe sends
 * after the card 4242 4242 4242 4242 succeeds. Everything after the card form is therefore real: polling, keys, reveal, copy.
 *
 * Needs: API on :8080 started with STRIPE_WEBHOOK_SECRET=whsec_e2e (and an empty STRIPE_SECRET_KEY), `npm run dev` on :5173.
 *   cd frontend && SQL_CMD="mariadb --socket=/run/mysqld/mysqld.sock keymart" NODE_PATH=$(npm root -g) node e2e/commerce.e2e.cjs
 */
const { chromium } = require('playwright');
const { execSync } = require('node:child_process');
const { createHmac } = require('node:crypto');
const path = require('node:path');

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://127.0.0.1:8080';
const SECRET = process.env.WEBHOOK_SECRET ?? 'whsec_e2e';
const BACKEND = path.resolve(__dirname, '../../backend');
let failed = 0;
const check = (ok, name) => {
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${name}`);
  if (!ok) failed += 1;
};

const webhook = async (eventId, intentId, amount) => {
  const body = JSON.stringify({
    id: eventId,
    object: 'event',
    type: 'payment_intent.succeeded',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: intentId,
        object: 'payment_intent',
        amount,
        amount_received: amount,
        currency: 'eur',
      },
    },
  });
  const t = Math.floor(Date.now() / 1000);
  const signature = `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex')}`;
  const response = await fetch(`${API}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
    body,
  });
  return response.status;
};

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(String(e)));
  page.on(
    'console',
    (m) =>
      m.type() === 'error' &&
      !/401|404|503|Failed to load resource/.test(m.text()) &&
      problems.push(m.text()),
  );
  const header = () => page.getByRole('banner');

  // 1. Sign up: validation first, then success.
  await page.goto(BASE + '/register');
  await page.getByRole('button', { name: 'Create account' }).click();
  check(
    await page.getByText('Use at least 8 characters').isVisible(),
    'sign-up: an empty form is rejected in the browser, with every message',
  );
  const email = `buyer-${Date.now()}@example.com`;
  await page.getByLabel(/display name/i).fill('E2E Buyer');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(BASE + '/');
  check(true, 'sign-up works and lands on the homepage');
  await page.goto(BASE + '/register');
  await page.waitForURL(BASE + '/'); // signed in: the form is not shown again

  // 2. Cart: two offers from different sellers, edit, remove, totals from the server.
  const slug = 'tides-of-stormhaven-steam-global';
  await page.goto(BASE + `/product/${slug}`);
  await page.getByRole('table').waitFor();
  const sellers = await page.$$eval('tbody tr th', (els) =>
    els.map((e) => e.childNodes[0].textContent.trim()),
  );
  await page.getByRole('button', { name: `Add ${sellers[0]}'s offer to cart` }).click();
  await header().getByRole('link', { name: 'Cart, 1 items' }).waitFor();
  await page.getByRole('button', { name: `Add ${sellers[1]}'s offer to cart` }).click();
  await header().getByRole('link', { name: 'Cart, 2 items' }).waitFor();
  await page.goto(BASE + '/cart');
  await page.getByRole('list', { name: 'Cart items' }).waitFor();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/cart.png` });
  const serverCart = async () =>
    (
      await page.request.get(`${API}/api/cart`, {
        headers: {
          Cookie: (await context.cookies()).map((c) => `${c.name}=${c.value}`).join('; '),
        },
      })
    ).json();
  const euros = (cents) =>
    (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'EUR' });
  const totalText = async () => (await page.getByLabel('Total').innerText()).replace(/\s/g, ' ');
  let cart = await serverCart();
  check(
    (await totalText()) === euros(cart.totalCents).replace(/\s/g, ' '),
    `cart total is the server's (${await totalText()})`,
  );
  await page
    .getByRole('button', { name: /Increase quantity of/ })
    .first()
    .click();
  await header().getByRole('link', { name: 'Cart, 3 items' }).waitFor();
  cart = await serverCart();
  check(
    cart.lines.reduce((n, l) => n + l.qty, 0) === 3 &&
      (await totalText()) === euros(cart.totalCents).replace(/\s/g, ' '),
    'increasing a quantity updates the server cart and the total',
  );
  await page
    .getByRole('button', { name: /Decrease quantity of/ })
    .first()
    .click();
  await header().getByRole('link', { name: 'Cart, 2 items' }).waitFor();
  check(true, 'decreasing it again works');
  await page
    .getByRole('button', { name: /Remove .* from the cart/ })
    .last()
    .click();
  await header().getByRole('link', { name: 'Cart, 1 items' }).waitFor();
  check(
    (await page.getByRole('list', { name: 'Cart items' }).locator('li').count()) === 1,
    'removing a line drops it',
  );
  await page.goto(BASE + `/product/${slug}`);
  await page.getByRole('table').waitFor();
  await page.getByRole('button', { name: `Add ${sellers[1]}'s offer to cart` }).click();
  await header().getByRole('link', { name: 'Cart, 2 items' }).waitFor();

  // 3. Checkout page: summary, and an honest failure when Stripe is not configured.
  await page.goto(BASE + '/checkout');
  await page.getByRole('region', { name: 'Order summary' }).waitFor();
  cart = await serverCart();
  const summaryText = await page.getByRole('region', { name: 'Order summary' }).innerText();
  check(
    summaryText.replace(/\s/g, ' ').includes(euros(cart.totalCents).replace(/\s/g, ' ')),
    'checkout summary shows the server total',
  );
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.getByRole('alert').waitFor();
  check(
    /not available|unavailable|not set up|not configured/i.test(
      await page.getByRole('alert').innerText(),
    ),
    `no Stripe key: a clear message, not a crash (${(await page.getByRole('alert').innerText()).replace(/\s+/g, ' ')})`,
  );
  check(
    (await page.getByTestId('payment-element').count()) === 0 &&
      (await page.locator('iframe').count()) === 0,
    'no payment form without a key',
  );

  // 4. A pending order (as after "Pay"), then Stripe's webhook arrives while the page is open.
  const made = JSON.parse(
    execSync(`php tests/bin/dev_order.php ${email}`, { cwd: BACKEND, encoding: 'utf8' }).trim(),
  );
  await page.goto(BASE + `/account/orders/${made.orderId}`);
  await page.getByText(/waiting for confirmation/).waitFor();
  check(true, 'pending order: "waiting for confirmation", no keys');
  check(
    (await page.getByRole('button', { name: 'Reveal key' }).count()) === 0,
    'no key is offered while pending',
  );
  await page.waitForTimeout(2500); // still pending after a poll: it keeps waiting
  check(
    await page.getByText(/waiting for confirmation/).isVisible(),
    'still waiting, still polling',
  );
  check(
    (await webhook(`evt_e2e_${Date.now()}`, made.paymentIntentId, made.totalCents)) === 200,
    'a correctly signed webhook is accepted',
  );
  await page.getByText('Payment confirmed. Your keys are below.').waitFor({ timeout: 10000 });
  check(true, 'the page flips to paid by itself (no reload)');
  const reveal = page.getByRole('button', { name: 'Reveal key' });
  const keyCount = await reveal.count();
  check(keyCount >= 2, `one hidden key per bought unit (${keyCount})`);
  const bodyBefore = await page.locator('main').innerText();
  check(
    !/[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}/.test(bodyBefore),
    'keys are not in the page text until revealed',
  );
  await reveal.first().click();
  const keyText = await page.locator('main code').first().innerText();
  check(/^[A-Z0-9]{5}(-[A-Z0-9]{5}){2}$/.test(keyText), `reveal shows a key (${keyText})`);
  await page.getByRole('button', { name: 'Copy' }).click();
  check(
    (await page.evaluate(() => navigator.clipboard.readText())) === keyText,
    'copy puts the key on the clipboard',
  );
  if (process.env.SHOTS)
    await page.screenshot({ path: `${process.env.SHOTS}/order-paid.png`, fullPage: true });
  await page.getByRole('button', { name: 'Hide key' }).click();
  check(!(await page.locator('main').innerText()).includes(keyText), 'hide removes it again');

  // 5. After payment: cart emptied of what was bought, list shows paid and no keys, storage and URL clean.
  check(
    (await header().getByRole('link', { name: /^Cart/ }).getAttribute('aria-label')) === 'Cart',
    'the cart badge is gone once the order is paid',
  );
  await page.goto(BASE + '/account/orders');
  const row = page.getByRole('list', { name: 'Orders' }).getByRole('link').first();
  await row.waitFor();
  check(/Paid/.test(await row.innerText()), 'order list shows the order as Paid');
  check(
    !/[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}/.test(await page.locator('main').innerText()),
    'no keys on the order list',
  );
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  check(!stored.includes(keyText), 'the key is not in browser storage');
  check(!page.url().includes(keyText), 'the key is not in the address');
  const apiList = await (await page.request.get(`${API}/api/orders`)).text();
  check(!apiList.includes(keyText), 'GET /api/orders (the list) carries no keys');

  // 6. Somebody else cannot see it.
  const other = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const stranger = await other.newPage();
  await stranger.goto(BASE + '/register');
  await stranger.getByLabel(/display name/i).fill('Stranger');
  await stranger.getByLabel(/email/i).fill(`stranger-${Date.now()}@example.com`);
  await stranger.getByLabel(/password/i).fill('correct-horse-battery');
  await stranger.getByRole('button', { name: 'Create account' }).click();
  await stranger.waitForURL(BASE + '/');
  await stranger.goto(BASE + `/account/orders/${made.orderId}`);
  await stranger.getByText('We could not find that order').waitFor();
  check(
    !(await stranger.locator('body').innerText()).includes(keyText),
    "another account gets 'not found' and no key",
  );
  await other.close();

  check(problems.length === 0, `no page or console errors ${problems.join(' | ')}`);
  await browser.close();
  console.log(failed === 0 ? '\nall checks passed' : `\n${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
