/**
 * Browser check of /search and /product/:slug against the real API and database.
 *   cd frontend && SQL_CMD="mariadb --socket=/run/mysqld/mysqld.sock keymart" NODE_PATH=$(npm root -g) node e2e/product.e2e.cjs
 * (The API's registration limit is 10/hour per address: start it with RATE_LIMITS_ENABLED=false when you run these repeatedly.)
 * SQL_CMD runs a statement given with -e (used to make a game have one offer / none, and to undo it). Env: BASE_URL, SHOTS.
 */
const { chromium } = require('playwright');
const { execSync } = require('node:child_process');

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const SQL = process.env.SQL_CMD;
let failed = 0;
const check = (ok, name) => {
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${name}`);
  if (!ok) failed += 1;
};
const sql = (statement) => execSync(`${SQL} -N -e "${statement}"`, { encoding: 'utf8' }).trim();

(async () => {
  if (!SQL) throw new Error('Set SQL_CMD (see the header of this file)');
  const slug = 'tides-of-stormhaven-steam-global';
  const productId = sql(`SELECT id FROM products WHERE slug='${slug}'`);
  const original = sql(
    `SELECT GROUP_CONCAT(id) FROM offers WHERE product_id=${productId} AND active=1`,
  ).split(',');

  const browser = await chromium.launch();
  const page = await (
    await browser.newContext({ viewport: { width: 1280, height: 900 } })
  ).newPage();
  const problems = []; // 401 (visitor not signed in) and 404 (the deliberately unknown slug) are expected answers
  page.on('pageerror', (e) => problems.push(String(e)));
  page.on(
    'console',
    (m) => m.type() === 'error' && !/401|404/.test(m.text()) && problems.push(m.text()),
  );

  try {
    // 1. Search: typo -> did you mean -> corrected results.
    await page.goto(BASE + '/search?q=stormhavn');
    await page.getByText(/Did you mean/).waitFor();
    const hint = await page.getByRole('status').filter({ hasText: 'Did you mean' }).innerText();
    check(/stormhaven/.test(hint), `weak match offers a correction (${hint.replace(/\s+/g, ' ')})`);
    await page.getByRole('link', { name: 'stormhaven', exact: true }).click();
    await page.waitForURL('**/search?q=stormhaven');
    await page.getByText(/Did you mean/).waitFor({ state: 'detached' }); // the old results' hint goes once the new answer is in
    await page.waitForSelector('ul[aria-label="Games"][aria-busy="false"]');
    check(
      (await page.getByText(/Did you mean/).count()) === 0,
      'the corrected search is a strong match: no hint',
    );
    await page.goto(BASE + '/search?q=zzzzzz');
    await page.getByText('No games found for “zzzzzz”').waitFor();
    check(true, 'a query with no match shows the empty state');
    await page.goto(BASE + '/search');
    await page.getByText('Search for a game').waitFor();
    check(true, 'no query: asks for one');
    await page.goto(BASE + '/search?q=stormhaven');
    await page.waitForSelector('ul[aria-label="Games"][aria-busy="false"]');
    await page
      .getByRole('main')
      .getByRole('link', { name: /Tides of Stormhaven/ })
      .first()
      .click();
    await page.waitForURL(`**/product/${slug}`);

    // 2. Product page.
    await page.getByRole('table').waitFor();
    check(
      (await page.getByRole('heading', { level: 1 }).innerText()) === 'Tides of Stormhaven',
      'product page opens from the results',
    );
    const rows = await page.locator('tbody tr').count();
    check(rows === original.length, `one row per offer (${rows})`);
    check((await page.getByText('Best price').count()) === 1, 'exactly one best price');
    const firstSeller = await page.locator('tbody tr th').first().innerText();
    check(/Best price/.test(firstSeller), 'the best price is on the first row (sorted by price)');
    await page
      .getByRole('columnheader', { name: /Rating/ })
      .getByRole('button')
      .click();
    check(
      (await page.getByRole('columnheader', { name: /Rating/ }).getAttribute('aria-sort')) ===
        'descending',
      'sorting by rating marks aria-sort',
    );
    const ratings = await page.$$eval('tbody tr [role=img]', (els) =>
      els.map((e) => Number(e.getAttribute('aria-label').match(/[\d.]+/)[0])),
    );
    check(
      ratings.every((r, i) => i === 0 || ratings[i - 1] >= r),
      `rows are in rating order (${ratings})`,
    );
    if (process.env.SHOTS)
      await page.screenshot({ path: `${process.env.SHOTS}/product-desktop.png`, fullPage: true });

    // 3. Signed out: add to cart goes to sign in and comes back.
    await page
      .getByRole('button', { name: /Add .* offer to cart/ })
      .first()
      .click();
    await page.waitForURL(/\/login\?next=/);
    check(
      decodeURIComponent(page.url()).includes(`next=/product/${slug}`),
      'signed-out add to cart goes to sign in with a way back',
    );
    await page.goto(BASE + '/register');
    const email = `e2e-${Date.now()}@example.com`;
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/name/i).first().fill('E2E Buyer');
    await page
      .getByLabel(/password/i)
      .first()
      .fill('correct-horse-battery');
    await page.getByRole('button', { name: /create account|register|sign up/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/register'));

    // 4. Signed in: two offers from different sellers.
    await page.goto(BASE + `/product/${slug}`);
    await page.getByRole('table').waitFor();
    const cartLink = page.getByRole('banner').getByRole('link', { name: /^Cart/ });
    const sellers = await page.$$eval('tbody tr th', (els) =>
      els.map((e) => e.childNodes[0].textContent.trim()),
    );
    const [a, b] = sellers;
    await page.getByRole('button', { name: `Add ${a}'s offer to cart` }).click();
    await page.getByRole('banner').getByRole('link', { name: 'Cart, 1 items' }).waitFor();
    await page.getByRole('button', { name: `Add ${b}'s offer to cart` }).click();
    await page.getByRole('banner').getByRole('link', { name: 'Cart, 2 items' }).waitFor();
    check(true, `adding offers from ${a} and ${b} updates the cart badge to 2`);
    check(
      (await page.getByText('In your cart: 1').count()) === 2,
      'both rows say "In your cart: 1"',
    );
    await page.goto(BASE + '/cart');
    await page.waitForLoadState('networkidle');
    const cartText = await page.locator('main').innerText();
    check(/2 items/.test(cartText), 'the cart page (still a placeholder) counts 2 items');
    check(
      (await cartLink.getAttribute('aria-label')) === 'Cart, 2 items',
      'badge survives navigation',
    );

    // 5. Single offer, then no offers (deactivate in the database, restore afterwards).
    sql(`UPDATE offers SET active=0 WHERE product_id=${productId} AND id<>${original[0]}`);
    await page.goto(BASE + `/product/${slug}`);
    await page.getByRole('table').waitFor();
    check((await page.locator('tbody tr').count()) === 1, 'single offer: one row');
    check((await page.getByText('Best price').count()) === 0, 'single offer: no best price');
    await page.getByText(/Only one seller has this game/).waitFor();
    check(true, 'single offer: explains there is nothing to compare');
    sql(`UPDATE offers SET active=0 WHERE product_id=${productId}`);
    await page.goto(BASE + `/product/${slug}`);
    await page.getByText('No seller has keys for this game right now').waitFor();
    check((await page.getByRole('table').count()) === 0, 'no offers: no table, clear message');
    await page.goto(BASE + '/product/does-not-exist');
    check(
      await page
        .getByText('We could not find that game')
        .waitFor()
        .then(() => true),
      'unknown slug: not found state',
    );
  } finally {
    sql(
      `UPDATE offers SET active=1 WHERE product_id=${productId} AND id IN (${original.join(',')})`,
    );
  }

  check(problems.length === 0, `no page or console errors ${problems.join(' | ')}`);
  await browser.close();
  console.log(
    failed === 0
      ? '\nall checks passed (offers restored)'
      : `\n${failed} check(s) failed (offers restored)`,
  );
  process.exit(failed === 0 ? 0 : 1);
})();
