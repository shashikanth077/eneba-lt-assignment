/**
 * Takes the screenshot set used for the visual comparison (docs/screens): the main screens at a desktop and a phone width.
 *   cd frontend && NODE_PATH=$(npm root -g) OUT=../docs/screens/before node e2e/screens.e2e.cjs
 * Needs the stack running (API with RATE_LIMITS_ENABLED=false because it registers a user; `npm run dev`). Env: BASE_URL, OUT.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = process.env.OUT ?? 'screens';
const SLUG = 'tides-of-stormhaven-steam-global';
fs.mkdirSync(OUT, { recursive: true });

const SIZES = { desktop: { width: 1920, height: 1080 }, mobile: { width: 390, height: 844 } };

(async () => {
  const browser = await chromium.launch();
  for (const [name, viewport] of Object.entries(SIZES)) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const shot = async (file, options = {}) => {
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${name}-${file}.png`, ...options });
    };

    await page.goto(BASE + '/');
    await page.getByRole('region', { name: 'Best sellers' }).waitFor();
    await shot('01-home');
    await page.evaluate(() => {
      const top =
        document.querySelector('section[aria-labelledby]')?.getBoundingClientRect().top ?? 0;
      window.scrollBy(0, top - 90);
    });
    await shot('02-home-cards');

    await page.goto(BASE + '/store?platform=steam');
    await page.waitForSelector('ul[aria-label="Games"][aria-busy="false"]');
    await shot('03-store');

    await page.goto(BASE + `/product/${SLUG}`);
    await page.getByRole('table').waitFor();
    await shot('04-product', { fullPage: true });

    await page.goto(BASE + '/register');
    await shot('05-register');
    const email = `shots-${name}-${Date.now()}@example.com`;
    await page.getByLabel(/display name/i).fill('Shots User');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill('correct-horse-battery');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL(BASE + '/');

    await page.goto(BASE + `/product/${SLUG}`);
    await page.getByRole('table').waitFor();
    const buttons = page.getByRole('button', { name: /Add to cart, offer from/ });
    await buttons.nth(0).click();
    await page
      .getByRole('banner')
      .getByRole('link', { name: /Cart, 1/ })
      .waitFor();
    await buttons.nth(1).click();
    await page
      .getByRole('banner')
      .getByRole('link', { name: /Cart, 2/ })
      .waitFor();

    await page.goto(BASE + '/cart');
    await page.getByRole('list', { name: 'Cart items' }).waitFor();
    await shot('06-cart');
    await page.goto(BASE + '/checkout');
    await page.getByRole('button', { name: 'Continue to payment' }).waitFor();
    await shot('07-checkout');
    await context.close();
  }
  await browser.close();
  console.log('saved to', OUT);
})();
