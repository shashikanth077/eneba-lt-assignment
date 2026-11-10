import { expect, test } from '@playwright/test';

// What a visitor does before buying, in a real browser (layout bugs such as a clipped menu cannot show up in jsdom).

test('a visitor browses, opens the Categories panel, filters, opens a game and is sent back after signing in', async ({
  page,
}) => {
  await test.step('the store lists games with prices, none of them wrongly out of stock', async () => {
    await page.goto('/store');
    const cards = page.getByRole('link', { name: /Steam|PlayStation|Xbox|GOG|Epic|Nintendo/ });
    await expect(cards.first()).toBeVisible();
    await expect(page.getByText('Out of stock')).toHaveCount(0);
    await expect(page.getByText(/^From/).first()).toBeVisible();
  });

  await test.step('Categories opens a real side panel, fully visible, with links', async () => {
    await page.getByRole('button', { name: 'Categories' }).click();
    const panel = page.getByRole('dialog', { name: 'Categories' });
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(300); // the old dropdown was cut off to a few pixels
    const links = panel.getByRole('link');
    expect(await links.count()).toBeGreaterThan(3);
    await panel.getByRole('link', { name: 'Action', exact: true }).click();
    await expect(page).toHaveURL(/\/store\?genre=Action/);
    await expect(panel).toBeHidden();
    await expect(page.getByText(/\d+ games?/).first()).toBeVisible();
  });

  await test.step('a game page shows buyable offers and the buy box', async () => {
    await page.goto('/product/cobalt-wilds-steam-global');
    await expect(page.getByRole('heading', { name: 'Cobalt Wilds', level: 1 })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByText('Out of stock')).toHaveCount(0);
  });

  await test.step('a protected page sends a visitor to sign in and back to where they were', async () => {
    await page.goto('/login?next=%2Fproduct%2Fcobalt-wilds-steam-global');
    await page.getByLabel(/email/i).fill('demo.buyer@keymart.test');
    await page.getByLabel(/password/i).fill('Demo-Buyer-2027');
    await page.getByRole('button', { name: 'Sign in' }).last().click();
    await expect(page).toHaveURL(/\/product\/cobalt-wilds-steam-global$/);
    await expect(
      page.getByRole('button', { name: /Add to cart, offer from/ }).first(),
    ).toBeVisible();
  });
});
