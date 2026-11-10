import { expect, test } from '@playwright/test';

test('the homepage has the category strip, recently viewed, recommended and upcoming sections, and a currency switch', async ({
  page,
}) => {
  await page.goto('/');
  const strip = page.getByRole('navigation', { name: 'Categories', exact: true });
  await expect(strip.getByRole('link', { name: 'Games', exact: true })).toBeVisible();
  await expect(strip.getByRole('link', { name: 'Steam', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recommended for you' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Upcoming games' })).toBeVisible();
  await expect(page.getByText(/^Releases /).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recently viewed' })).toHaveCount(0); // nothing viewed yet

  await strip.getByRole('link', { name: 'Steam', exact: true }).click();
  await expect(page).toHaveURL(/platform=steam/);

  await page.goto('/product/cobalt-wilds-steam-global');
  await expect(page.getByRole('heading', { name: 'Cobalt Wilds', level: 1 })).toBeVisible();
  await page.goto('/');
  const recent = page.getByRole('heading', { name: 'Recently viewed' });
  await expect(recent).toBeVisible();
  await expect(recent.locator('xpath=ancestor::section').getByText('Cobalt Wilds')).toBeVisible();

  const eurPrice = await page
    .locator('article')
    .first()
    .locator('strong, span')
    .filter({ hasText: /€/ })
    .first()
    .innerText();
  expect(eurPrice).toContain('€');
  await page.getByRole('button', { name: /Language and currency/ }).click();
  await page.getByLabel('Currency', { exact: true }).selectOption('USD');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('article').first()).toContainText('$');
  await page.reload();
  await expect(page.getByRole('button', { name: /English, USD/ })).toBeVisible();
});
