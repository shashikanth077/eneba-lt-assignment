import { expect, test } from '@playwright/test';

// The visitor journey of the new requirements, in a real browser: fill a cart without an account, keep it across a refresh,
// be asked to sign in at checkout, find the cart merged afterwards, and see the demo account's history and profile pages.

test('a guest fills a cart, keeps it over a refresh, registers at checkout and finds it merged', async ({
  page,
}) => {
  const banner = page.getByRole('banner');

  await test.step('add two offers without an account', async () => {
    await page.goto('/product/cobalt-wilds-steam-global');
    await expect(page.getByRole('table')).toBeVisible();
    const sellers = await page
      .locator('tbody tr th')
      .evaluateAll((cells) => cells.map((cell) => cell.childNodes[0].textContent?.trim() ?? ''));
    await page.getByRole('button', { name: `Add to cart, offer from ${sellers[0]}` }).click();
    await expect(banner.getByRole('link', { name: 'Cart, 1 items' })).toBeVisible();
    await page.getByRole('button', { name: `Add to cart, offer from ${sellers[1]}` }).click();
    await expect(banner.getByRole('link', { name: 'Cart, 2 items' })).toBeVisible();
  });

  await test.step('the cart survives a refresh and can be edited', async () => {
    await page.goto('/cart');
    await expect(page.getByRole('list', { name: 'Cart items' }).locator('li')).toHaveCount(2);
    await page.reload();
    await expect(page.getByRole('list', { name: 'Cart items' }).locator('li')).toHaveCount(2);
    await page
      .getByRole('button', { name: /Increase quantity of/ })
      .first()
      .click();
    await expect(
      page.getByRole('region', { name: 'Order summary' }).getByText('3 items'),
    ).toBeVisible();
    await page
      .getByRole('button', { name: /Remove .* from the cart/ })
      .last()
      .click();
    await expect(
      page.getByRole('region', { name: 'Order summary' }).getByText('2 items'),
    ).toBeVisible();
  });

  await test.step('checkout asks to sign in or register, then the cart is merged into the account', async () => {
    await page.getByRole('link', { name: 'Sign in to check out' }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fcheckout/);
    await page.getByRole('link', { name: 'Create an account' }).click(); // keeps ?next=/checkout
    await page.getByLabel(/display name/i).fill('Guest Buyer');
    await page.getByLabel(/email/i).fill(`guest-${Date.now()}@example.com`);
    await page.getByLabel(/password/i).fill('correct-horse-battery');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/checkout$/);
    // the guest cart (one line, quantity 2 after the edits) is now the account's cart, as the server holds it
    await expect(
      page.getByRole('region', { name: 'Order summary' }).getByText('2 × Cobalt Wilds'),
    ).toBeVisible();
    const guestLeft = await page.evaluate(() => localStorage.getItem('keymart:guest-cart:v1'));
    expect(guestLeft).toBeNull();
  });
});

test('the demo buyer has order history and an account page that protects the demo password', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill('demo.buyer@keymart.test');
  await page.getByLabel(/password/i).fill('Demo-Buyer-2027');
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await expect(page).toHaveURL('/');

  await page.goto('/orders');
  const orders = page.getByRole('list', { name: 'Orders' }).getByRole('link');
  await expect(orders).toHaveCount(2);
  await expect(orders.first()).toContainText('Paid');

  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Edit profile' })).toBeVisible();
  await page.getByLabel('Current password').fill('Demo-Buyer-2027');
  await page.getByLabel('New password', { exact: true }).fill('Vandalised-1234');
  await page.getByLabel('Repeat the new password').fill('Vandalised-1234');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText(/Demo accounts keep their password/)).toBeVisible();
});
