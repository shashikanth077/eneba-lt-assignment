/**
 * Screenshots for the README (docs/screens/final/). Needs the API on :8080 and `npm run dev` on :5173 with the demo data.
 *   cd frontend && NODE_PATH=$(npm root -g) node e2e/readme.screens.cjs
 */
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = process.env.OUT ?? path.resolve(__dirname, '../../docs/screens/final');
fs.mkdirSync(OUT, { recursive: true });

async function settle(page) {
  // lazy images load when scrolled into view
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
}
const shot = (page, name, full = true) =>
  page.screenshot({
    path: path.join(OUT, `${name}.jpg`),
    type: 'jpeg',
    quality: 80,
    fullPage: full,
  });

(async () => {
  const browser = await chromium.launch();
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();

  // a visitor: home, store, product, cart panel, currency settings
  await page.goto(BASE + '/product/cobalt-wilds-steam-global');
  await page.getByRole('table').waitFor();
  await page.goto(BASE + '/');
  await page.getByRole('heading', { name: 'Upcoming games' }).waitFor();
  await settle(page);
  await shot(page, '01-home');

  await page.goto(BASE + '/store?platform=steam&sort=discount');
  await page.getByText(/\d+ games/).waitFor();
  await settle(page);
  await shot(page, '02-store', false);

  await page.goto(BASE + '/product/cobalt-wilds-steam-global');
  await page.getByRole('table').waitFor();
  await settle(page);
  await shot(page, '03-product', false);

  await page
    .getByRole('button', { name: /Add to cart, offer from/ })
    .first()
    .click();
  await page
    .getByRole('banner')
    .getByRole('link', { name: /^Cart, 1 items/ })
    .click();
  await page.getByRole('dialog', { name: 'My shopping cart' }).waitFor();
  await page.waitForTimeout(300);
  await shot(page, '04-cart-panel', false);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /Language and currency/ }).click();
  await page.getByRole('dialog', { name: 'Update your settings' }).waitFor();
  await shot(page, '05-settings', false);
  await page.keyboard.press('Escape');

  // the demo buyer: checkout summary, account, orders
  await page.goto(BASE + '/login');
  await page.getByLabel(/email/i).fill('demo.buyer@keymart.test');
  await page.getByLabel(/password/i).fill('Demo-Buyer-2027');
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await page.waitForURL(BASE + '/');
  await page.goto(BASE + '/checkout');
  await page.getByRole('region', { name: 'Order summary' }).waitFor();
  await shot(page, '06-checkout', false);
  await page.goto(BASE + '/orders');
  await page.getByRole('list', { name: 'Orders' }).waitFor();
  await shot(page, '07-orders', false);
  await page.goto(BASE + '/account');
  await page.getByRole('heading', { name: 'Edit profile' }).waitFor();
  await shot(page, '08-account', false);

  // a phone
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const mobile = await phone.newPage();
  await mobile.goto(BASE + '/');
  await mobile.getByRole('heading', { name: 'Recommended for you' }).waitFor();
  await settle(mobile);
  await mobile.screenshot({
    path: path.join(OUT, '09-home-mobile.jpg'),
    type: 'jpeg',
    quality: 80,
  });

  await browser.close();
  console.log('saved to', OUT);
})();
