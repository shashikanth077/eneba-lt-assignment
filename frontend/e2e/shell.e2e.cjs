/**
 * End-to-end check of the app shell in a real browser, against the real backend and database (not mocks).
 *
 *   docker compose up            (or: php -S 127.0.0.1:8080 in backend/ + `npm run dev` here, with the DB seeded)
 *   NODE_PATH=$(npm root -g) node e2e/shell.e2e.cjs            # needs Playwright installed (not a project dependency)
 *
 * (The API's registration limit is 10/hour per address: start it with RATE_LIMITS_ENABLED=false when you run these repeatedly.)
 * Env: BASE_URL (default http://127.0.0.1:5173), SHOTS (directory for screenshots, optional).
 * Exits 1 on the first failed check.
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const SHOTS = process.env.SHOTS;
let passed = 0;

function check(condition, label) {
  if (!condition) {
    console.error(`FAIL  ${label}`);
    process.exitCode = 1;
    throw new Error(label);
  }
  passed += 1;
  console.log(`ok    ${label}`);
}

const searchBox = (page) => page.getByRole('combobox', { name: 'Search games' });
const header = (page) => page.getByRole('banner');

/** Types into the header search and returns the text of the suggestions once they have loaded. */
async function suggestionsFor(page, text) {
  await searchBox(page).fill('');
  await searchBox(page).fill(text);
  await page.getByRole('listbox').waitFor({ timeout: 8000 });
  await page.waitForFunction(
    () => !document.querySelector('[role="listbox"]')?.textContent?.includes('Searching'),
    null,
    { timeout: 8000 },
  );
  return (
    await page.getByRole('listbox', { name: 'Suggestions' }).getByRole('option').allTextContents()
  ).map((t) => t.trim());
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('401') && !m.text().includes('fonts.g'))
      problems.push(`console: ${m.text()}`);
  });

  // ---- layout ---------------------------------------------------------------------------------
  await page.goto(BASE + '/');
  await searchBox(page).waitFor();
  check(
    await header(page).getByRole('link', { name: 'KEYMART home' }).isVisible(),
    'header shows the wordmark',
  );
  check(await searchBox(page).isVisible(), 'header has the search box');
  check(
    await header(page).getByRole('link', { name: 'Cart' }).isVisible(),
    'header has the cart icon',
  );
  check(
    await header(page).getByRole('link', { name: 'Sign in' }).isVisible(),
    'signed out: Sign in is offered',
  );
  const nav = page.getByRole('navigation', { name: 'Categories and platforms' });
  await nav.getByRole('link', { name: 'Steam' }).waitFor({ timeout: 8000 });
  check((await nav.getByRole('link').count()) >= 5, 'nav bar lists platforms loaded from the API');
  check(await page.getByRole('contentinfo').isVisible(), 'footer is shown');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/desktop-home.png`, fullPage: true });

  // ---- search suggestions from ANY page -----------------------------------------------------------
  for (const path of [
    '/',
    '/store',
    '/product/tides-of-stormhaven-steam-global', // a real game (an unknown slug is a legitimate 404 now)
    '/login',
    '/register',
    '/does-not-exist',
  ]) {
    await page.goto(BASE + path);
    const found = await suggestionsFor(page, 'stormhaven');
    check(
      found.length > 0 && found.every((o) => /stormhaven/i.test(o)),
      `suggestions appear on ${path} (${found.length} shown)`,
    );
  }
  await page.goto(BASE + '/store');
  const typo = await suggestionsFor(page, 'stormhavn');
  check(
    typo.some((o) => /Stormhaven/.test(o)),
    'a typo ("stormhavn") still suggests Stormhaven titles',
  );
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/desktop-suggestions.png` });

  await searchBox(page).fill('zzzzzq');
  await page.getByText('No games match "zzzzzq"').waitFor({ timeout: 8000 });
  check(true, 'nonsense shows the "No games match" state');

  const top = await suggestionsFor(page, 'stormhaven');
  check(top.length <= 6, 'at most 6 suggestions');
  await page.getByRole('listbox', { name: 'Suggestions' }).getByRole('option').first().click();
  await page.waitForURL(/\/product\/.+-stormhaven-/);
  check(
    (await searchBox(page).inputValue()) === '',
    'choosing a suggestion opens the product and clears the box',
  );

  await searchBox(page).fill('wither 3');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/search\?q=wither%203/);
  check(
    (await searchBox(page).inputValue()) === 'wither 3',
    'Enter opens /search?q=... and the box keeps the query',
  );

  // ---- protected routes: login, then back ---------------------------------------------------------
  await page.goto(BASE + '/orders');
  await page.waitForURL(/\/login\?next=%2Forders/);
  await page.getByRole('heading', { name: 'Sign in' }).waitFor();
  check(
    await page.getByRole('heading', { name: 'Sign in' }).isVisible(),
    'signed out: /orders redirects to /login?next=%2Forders',
  );

  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.waitForURL(/\/register\?next=%2Forders/);
  check(true, 'the next target survives the switch to Register');

  const email = `e2e-${Date.now()}@example.com`;
  await page.getByLabel('Display name').fill('Ada Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct horse 9');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(`${BASE}/orders`);
  await page.getByText('No orders yet').waitFor();
  check(true, 'after registering you land back on /orders (empty state shown)');
  check(
    await page.getByRole('button', { name: /Account menu/ }).isVisible(),
    'header now shows the account menu',
  );
  check(
    (await page.getByRole('button', { name: /Account menu/ }).innerText()).includes('Ada Tester'),
    'with the display name',
  );
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/desktop-orders.png` });

  await page.reload();
  await page.getByText('No orders yet').waitFor();
  check(
    page.url() === `${BASE}/orders`,
    'a refresh keeps you on the protected page (no bounce to login)',
  );

  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.waitForURL(`${BASE}/`);
  await header(page).getByRole('link', { name: 'Sign in' }).waitFor();
  check(true, 'signing out returns home and shows Sign in again');

  await page.goto(BASE + '/cart');
  await page.waitForURL(/\/login\?next=%2Fcart/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('wrong password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('alert').waitFor();
  check(
    (await page.getByRole('alert').innerText()).includes('Invalid email or password'),
    'a wrong password shows the server message, no redirect',
  );
  check(
    page.url().includes('/login?next=%2Fcart'),
    'and stays on the login page with the target kept',
  );
  await page.getByLabel('Password').fill('correct horse 9');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`${BASE}/cart`);
  await page.getByText('Your cart is empty').waitFor();
  check(true, 'logging in sends you back to /cart');

  // ---- no open redirect -----------------------------------------------------------------------------
  await page.goto(BASE + '/'); // the cart page uses the reduced checkout header, which has no account menu
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.waitForURL(`${BASE}/`);
  await page.goto(BASE + '/login?next=//evil.example/steal');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct horse 9');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`${BASE}/`);
  check(
    new URL(page.url()).origin === BASE,
    '?next=//evil.example is ignored: you stay on this site',
  );

  // ---- mobile ----------------------------------------------------------------------------------------
  const phone = await browser.newContext({
    viewport: { width: 375, height: 740 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await phone.newPage();
  for (const path of ['/', '/store', '/login', '/register', '/does-not-exist']) {
    await mobile.goto(BASE + path);
    await searchBox(mobile).waitFor();
    const overflow = await mobile.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    check(overflow <= 0, `375px: ${path} has no horizontal overflow`);
  }
  await mobile.goto(BASE + '/');
  const phoneSuggestions = await suggestionsFor(mobile, 'crimson');
  check(phoneSuggestions.length > 0, '375px: suggestions work on a phone');
  const popup = await mobile.getByRole('listbox').boundingBox();
  check(
    popup !== null && popup.x >= 0 && popup.x + popup.width <= 375,
    '375px: the suggestion list fits the screen',
  );
  if (SHOTS) await mobile.screenshot({ path: `${SHOTS}/mobile-suggestions.png` });
  await mobile.keyboard.press('Escape');
  await mobile.goto(BASE + '/');
  await searchBox(mobile).waitFor();
  if (SHOTS) await mobile.screenshot({ path: `${SHOTS}/mobile-home.png`, fullPage: true });

  check(
    problems.length === 0,
    `no page errors or console errors${problems.length ? ': ' + problems.join(' | ') : ''}`,
  );
  await browser.close();
  console.log(`\n${passed} checks passed`);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
