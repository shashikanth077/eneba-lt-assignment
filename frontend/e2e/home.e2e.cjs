/**
 * End-to-end check of the homepage against the REAL backend and database: the script edits the home_blocks / banners rows with SQL
 * and the page must follow, with no frontend change and no rebuild. It restores everything it changed.
 *
 *   NODE_PATH=$(npm root -g) SQL_CMD="mariadb --socket=/run/mysqld/mysqld.sock keymart" node e2e/home.e2e.cjs
 *
 * SQL_CMD is any command that runs a statement with `-e`. XAMPP on Windows, e.g.:
 *   SQL_CMD="C:\xampp\mysql\bin\mysql.exe -uroot keymart"
 * Needs: the API and the dev server running, the database seeded, CACHE_DRIVER=none in backend/.env (otherwise block DATA is cached for a few
 * minutes; the layout itself is never cached). Env: BASE_URL (default http://localhost:5173), SHOTS (screenshot directory, optional).
 */
const { chromium } = require('playwright');
const { execSync } = require('node:child_process');

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const SQL_CMD = process.env.SQL_CMD;
const SHOTS = process.env.SHOTS;
if (!SQL_CMD) {
  console.error('Set SQL_CMD, e.g. SQL_CMD="mysql -uroot keymart" (see the header of this file)');
  process.exit(2);
}
let passed = 0;

const sql = (statement) =>
  execSync(`${SQL_CMD} -N -B -e "${statement}"`, { encoding: 'utf8' }).trim();
const rows = (statement) =>
  sql(statement)
    ? sql(statement)
        .split('\n')
        .map((line) => line.split('\t'))
    : [];

function check(condition, label) {
  if (!condition) {
    console.error(`FAIL  ${label}`);
    process.exitCode = 1;
    throw new Error(label);
  }
  passed += 1;
  console.log(`ok    ${label}`);
}

/** Section names in the order they are on the page: the hero carousel is labelled with its block title, a rail by its heading. */
async function sectionNames(page) {
  return page
    .locator('main section')
    .evaluateAll((sections) =>
      sections.map(
        (section) =>
          section.getAttribute('aria-label') ??
          document.getElementById(section.getAttribute('aria-labelledby') ?? '')?.textContent ??
          '?',
      ),
    );
}

/** What the database says the page should show: enabled blocks, in order, by title. */
const expectedFromDatabase = () =>
  rows('SELECT title FROM home_blocks WHERE enabled = 1 ORDER BY position, id').map((r) => r[0]);

async function openHome(page) {
  await page.goto(BASE + '/');
  await page.getByRole('region', { name: /./ }).first().waitFor({ timeout: 10000 });
  await page.waitForLoadState('networkidle');
}

(async () => {
  const original = rows('SELECT slug, position, enabled FROM home_blocks');
  const originalBanner = rows('SELECT id, title FROM banners ORDER BY position, id LIMIT 1')[0];
  const restore = () => {
    for (const [slug, position, enabled] of original)
      sql(
        `UPDATE home_blocks SET position = ${position}, enabled = ${enabled}, endpoint = CONCAT('/api/home/', CASE slug WHEN 'banner' THEN 'banners' WHEN 'best_sellers' THEN 'best-sellers' WHEN 'deals' THEN 'deals' ELSE 'new-releases' END) WHERE slug = '${slug}'`,
      );
    sql(
      `UPDATE banners SET title = '${originalBanner[1].replace(/'/g, "''")}' WHERE id = ${originalBanner[0]}`,
    );
  };

  const browser = await chromium.launch();
  const problems = [];
  try {
    const page = await (
      await browser.newContext({ viewport: { width: 1280, height: 900 } })
    ).newPage();
    const requested = [];
    page.on('request', (r) => requested.push(new URL(r.url()).pathname));
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (
        m.type() === 'error' &&
        !m.text().includes('401') &&
        !m.text().includes('500') &&
        !m.text().includes('fonts.g')
      )
        problems.push(`console: ${m.text()}`);
    });

    // ---- the page is the database -------------------------------------------------------------
    await openHome(page);
    let names = await sectionNames(page);
    check(
      names.length === 4 && JSON.stringify(names) === JSON.stringify(expectedFromDatabase()),
      `sections follow home_blocks: ${names.join(' | ')}`,
    );
    check(
      (await page.getByRole('heading', { level: 2 }).first().innerText()) === originalBanner[1],
      'the banner text comes from the banners table',
    );
    check(
      (await page.getByRole('main').getByRole('link').count()) > 20,
      'the rails are full of linked games from the API',
    );
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/home-e2e-desktop.png`, fullPage: true });

    // ---- REORDER in the database, reload, see it -----------------------------------------------------
    sql("UPDATE home_blocks SET position = 0 WHERE slug = 'new_releases'");
    sql("UPDATE home_blocks SET position = 9 WHERE slug = 'banner'");
    await openHome(page);
    names = await sectionNames(page);
    check(
      names[0] === 'New releases' && names[names.length - 1] === 'Featured',
      `reordered in the database: ${names.join(' | ')}`,
    );
    check(
      JSON.stringify(names) === JSON.stringify(expectedFromDatabase()),
      'and exactly what the database says',
    );

    // ---- DISABLE in the database, reload, gone -------------------------------------------------------
    sql("UPDATE home_blocks SET enabled = 0 WHERE slug = 'deals'");
    requested.length = 0;
    await openHome(page);
    names = await sectionNames(page);
    check(
      !names.includes('Hot deals') && names.length === 3,
      `disabled in the database: ${names.join(' | ')}`,
    );
    check(!requested.includes('/api/home/deals'), 'a disabled block is not even requested');
    const gone = (await page.request.get(BASE + '/api/home/deals')).status(); // via the request API: a probe inside the page would log a console error
    check(gone === 404, 'and its endpoint answers 404');

    // ---- re-enable and restore ---------------------------------------------------------------------
    restore();
    await openHome(page);
    names = await sectionNames(page);
    check(
      names.length === 4 && names[0] === 'Featured' && names.includes('Hot deals'),
      'restoring the rows restores the page',
    );

    // ---- editing content shows too (block data is not cached in dev) ----------------------------------
    sql("UPDATE banners SET title = 'Edited in the database' WHERE id = " + originalBanner[0]);
    await openHome(page);
    check(
      (await page.getByRole('heading', { level: 2 }).first().innerText()) ===
        'Edited in the database',
      'an edited banner title shows up on reload',
    );
    restore();

    // ---- a failing block does not break the page ----------------------------------------------------
    await page.route('**/api/home/best-sellers', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{"error":{"code":"internal_error","message":"boom","details":null}}',
      }),
    );
    await openHome(page);
    await page.getByText('We could not load best sellers').waitFor();
    names = await sectionNames(page);
    check(
      names.includes('Hot deals') && names.includes('New releases') && names.includes('Featured'),
      'best sellers failed, the other blocks are fine',
    );
    check(await page.getByRole('banner').isVisible(), 'and so is the header');
    await page.unroute('**/api/home/best-sellers');
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.getByRole('heading', { name: 'Best sellers' }).waitFor();
    check(
      !(await page
        .getByText('We could not load best sellers')
        .isVisible()
        .catch(() => false)),
      'Try again brings it back',
    );

    // ---- each block has its own skeleton -------------------------------------------------------------
    await page.route('**/api/home/deals', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.goto(BASE + '/');
    await page.getByRole('heading', { name: 'Best sellers' }).waitFor();
    const skeleton = page.getByRole('status', { name: 'Loading games' });
    check(
      await skeleton.isVisible(),
      'a slow block shows its own skeleton while the others are already drawn',
    );
    await page.getByRole('heading', { name: 'Hot deals' }).waitFor({ timeout: 8000 });
    check(
      !(await skeleton.isVisible().catch(() => false)),
      'and the skeleton is replaced by the content',
    );
    await page.unroute('**/api/home/deals');

    // ---- links ---------------------------------------------------------------------------------------
    await openHome(page);
    const cta = page.getByRole('region', { name: 'Featured' }).getByRole('link').first();
    const target = await cta.getAttribute('href');
    await cta.click();
    await page.waitForURL(`${BASE}${target}`);
    check(true, `the banner button goes to ${target}`);
    await openHome(page);
    const card = page.getByRole('main').getByRole('link').filter({ hasText: '€' }).first();
    const slug = (await card.getAttribute('href')).replace('/product/', '');
    await card.click();
    await page.waitForURL(`${BASE}/product/${slug}`);
    check(true, `a game card opens /product/${slug}`);

    // ---- layout -----------------------------------------------------------------------------------
    for (const [label, size] of [
      ['1280px', { width: 1280, height: 900 }],
      ['375px', { width: 375, height: 800 }],
    ]) {
      const view = await (
        await browser.newContext({ viewport: size, isMobile: size.width < 500 })
      ).newPage();
      await openHome(view);
      const overflow = await view.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      check(
        overflow <= 0,
        `${label}: the homepage has no horizontal overflow (with all blocks loaded)`,
      );
      if (SHOTS && size.width < 500)
        await view.screenshot({ path: `${SHOTS}/home-e2e-mobile.png`, fullPage: true });
    }

    check(
      problems.length === 0,
      `no page errors or console errors${problems.length ? ': ' + problems.join(' | ') : ''}`,
    );
  } finally {
    restore();
    await browser.close();
  }
  console.log(`\n${passed} checks passed (database rows restored)`);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
