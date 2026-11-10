/**
 * Browser check of /store against the real API and database.
 *   cd frontend && NODE_PATH=$(npm root -g) node e2e/store.e2e.cjs      (stack running: php -S + npm run dev)
 * Env: BASE_URL (default http://localhost:5173), SHOTS (screenshot directory, optional).
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
let failed = 0;
const check = (ok, name) => {
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${name}`);
  if (!ok) failed += 1;
};

/** Everything a person can see that depends on the view: the games, the controls, the chips. */
async function snapshot(page) {
  return page.evaluate(() => ({
    games: [...document.querySelectorAll('ul[aria-label="Games"] a')].map((a) =>
      a.getAttribute('href'),
    ),
    count: document.querySelector('[aria-live="polite"]')?.textContent,
    checked: [...document.querySelectorAll('aside input[type=checkbox]:checked')].map(
      (i) => i.closest('label')?.textContent,
    ),
    search: document.querySelector('main input[type=search]')?.value,
    sort: document.querySelector('main select')?.selectedOptions[0]?.textContent,
    price: [...document.querySelectorAll('input[type=range]')].map((i) => i.value),
    chips: [
      ...document.querySelectorAll('section[aria-label="Active filters"] .MuiChip-label'),
    ].map((c) => c.textContent),
    page: document.querySelector('button[aria-current="page"]')?.textContent,
  }));
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  const requests = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/products?'))
      requests.push(decodeURIComponent(new URL(r.url()).search));
  });
  const settled = async () => {
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('ul[aria-label="Games"][aria-busy="false"]');
  };

  /** Runs an action and waits for the products answer it causes (and for the grid to be idle again). */
  const act = async (action) => {
    const answer = page.waitForResponse((r) => r.url().includes('/api/products?'));
    await action();
    await answer;
    await settled();
  };

  // 1. A filtered address, reloaded, gives exactly the same view.
  const url =
    BASE +
    '/store?q=o&platform=steam&platform=playstation&genre=Action&genre=Adventure&price_min=1000&price_max=4000&sort=price_asc';
  await page.goto(url);
  await settled();
  const first = await snapshot(page);
  await page.reload();
  await settled();
  const second = await snapshot(page);
  check(first.games.length > 0, `filtered view has games (${first.games.length}, ${first.count})`);
  check(
    JSON.stringify(first) === JSON.stringify(second),
    'reload reproduces the exact same view (games, controls, chips)',
  );
  check(
    first.sort === 'Price: low to high' && first.search === 'o',
    'sort and search box show the address state',
  );
  check(first.price.join() === '10,40', `slider shows 10..40 (${first.price})`);
  // a new tab opening the same address = what sharing a link does
  const other = await context.newPage();
  await other.goto(url);
  await other.waitForSelector('ul[aria-label="Games"]');
  await other.waitForLoadState('networkidle');
  check(
    JSON.stringify(await snapshot(other)) === JSON.stringify(first),
    'a second tab opening the link sees the same view',
  );
  await other.close();

  // 2. The prices really are in range and sorted.
  const prices = await page.$$eval('ul[aria-label="Games"] li', (lis) =>
    lis.map((li) =>
      Number(
        li.textContent
          .match(/(\d+)[.,](\d\d)\s*€|€\s*(\d+)[.,](\d\d)/)
          ?.slice(1)
          .filter(Boolean)
          .join('.') ?? NaN,
      ),
    ),
  );
  check(
    prices.every((p) => p >= 10 && p <= 40),
    `all prices within 10..40 (${prices.slice(0, 5)}...)`,
  );
  check(
    prices.every((p, i) => i === 0 || prices[i - 1] <= p),
    'sorted by price ascending',
  );

  // 3. Back / forward.
  await page.goto(BASE + '/store');
  await settled();
  const plain = await snapshot(page);
  await act(() => page.getByRole('checkbox', { name: /^Xbox/ }).click());
  await page.waitForURL('**/store?platform=xbox');
  const xbox = await snapshot(page);
  check(
    xbox.games.length > 0 && xbox.games.length < plain.games.length,
    'ticking Xbox narrows the grid',
  );
  await page
    .getByRole('combobox', { name: 'Sort by' })
    .selectOption({ label: 'Price: high to low' });
  await page.waitForURL('**/store?platform=xbox&sort=price_desc');
  await page.goBack();
  await page.waitForURL('**/store?platform=xbox');
  await settled();
  check(
    JSON.stringify(await snapshot(page)) === JSON.stringify(xbox),
    'Back restores the previous view exactly',
  );
  await page.goBack();
  await page.waitForURL(BASE + '/store');
  await settled();
  check(
    JSON.stringify(await snapshot(page)) === JSON.stringify(plain),
    'Back again restores the unfiltered store',
  );
  await page.goForward();
  await page.waitForURL('**/store?platform=xbox');
  check(true, 'Forward works');

  // 4. Price slider is debounced: a burst of key presses = one request.
  await page.goto(BASE + '/store');
  await settled();
  requests.length = 0;
  const maxThumb = page.getByRole('slider', { name: 'Maximum price' });
  await maxThumb.focus();
  const answer = page.waitForResponse((r) => r.url().includes('/api/products?'));
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(200);
  check(requests.length === 0, 'no request while the slider is still being moved');
  await answer;
  await settled();
  check(
    requests.length === 1,
    `one request after the slider rests (${requests.length}: ${requests.join(' ')})`,
  );
  check(/price_max=\d+/.test(page.url()), `the address has the price (${page.url()})`);

  // 5. Pagination.
  await page.goto(BASE + '/store');
  await settled();
  await act(() => page.getByRole('button', { name: /page 2/ }).click());
  await page.waitForURL('**/store?page=2');
  const pageTwo = await snapshot(page);
  check(pageTwo.page === '2' && pageTwo.games.length > 0, 'page 2 opens through the address');
  await page.reload();
  await settled();
  check(
    JSON.stringify(await snapshot(page)) === JSON.stringify(pageTwo),
    'page 2 survives a reload',
  );

  // 6. Chips + clear all.
  await page.goto(BASE + '/store?platform=steam&genre=Action');
  await settled();
  await page.getByLabel('Remove Steam').click();
  await page.waitForURL('**/store?genre=Action');
  await page.getByRole('button', { name: 'Clear all' }).click();
  await page.waitForURL(BASE + '/store');
  check(true, 'chip removal and Clear all update the address');

  // 7. Layout at desktop and phone width.
  if (process.env.SHOTS)
    await page.screenshot({ path: `${process.env.SHOTS}/store-desktop.png`, fullPage: false });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  check(overflow <= 0, `no horizontal overflow at 1280 (${overflow}px)`);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(BASE + '/store?platform=steam&genre=Action');
  await settled();
  check((await page.locator('aside').count()) === 0, 'phone: no docked sidebar');
  const phoneOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  check(phoneOverflow <= 0, `no horizontal overflow at 375 (${phoneOverflow}px)`);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/store-phone.png` });
  await page.getByRole('button', { name: /Filters/ }).click();
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(500); // the drawer slides in
  if (process.env.SHOTS)
    await page.screenshot({ path: `${process.env.SHOTS}/store-phone-drawer.png` });
  await page.getByRole('dialog').getByRole('checkbox', { name: /^Xbox/ }).click();
  await page.waitForURL(/platform=steam&platform=xbox|platform=xbox&platform=steam/);
  check(true, 'phone: the drawer changes the address too');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Show \d+ games$/ })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  // 401 from /api/auth/me is the normal answer for a visitor who is not signed in
  const real = problems.filter((p) => !p.includes('401'));
  check(real.length === 0, `no page or console errors ${real.join(' | ')}`);

  await browser.close();
  console.log(failed === 0 ? '\nall checks passed' : `\n${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
