import { expect, test } from '@playwright/test';

const MOCK_ADDRESS = 'GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTGG';

async function seedWalletAuth(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((addr) => {
    localStorage.setItem(
      'ste-app-store',
      JSON.stringify({
        wallet: { address: addr, isConnected: true, network: 'testnet' },
        admin: { apiKey: null },
      }),
    );
  }, MOCK_ADDRESS);
}

test.describe('visual regression', () => {
  test('landing page matches the approved baseline', async ({ page }) => {
    test.skip(
      test.info().project.name !== 'chromium',
      'Visual baselines are maintained for Chromium.',
    );

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot('home-page.png');
  });

  test('create escrow page matches the approved baseline', async ({ page }) => {
    test.skip(
      test.info().project.name !== 'chromium',
      'Visual baselines are maintained for Chromium.',
    );

    await seedWalletAuth(page);
    await page.goto('/escrow/create', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Create New Escrow' })).toBeVisible();
    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot('create-escrow-page.png');
  });

  test('explorer cursor pagination matches responsive baselines', async ({ page }) => {
    test.skip(
      test.info().project.name !== 'chromium',
      'Visual baselines are maintained for Chromium.',
    );
    await page.route('**/api/escrows?**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 1, status: 'Active', totalAmount: '100', clientAddress: 'GDEMO' }],
          next_cursor: 'next-page',
          has_more: true,
        }),
      }),
    );
    for (const viewport of [
      { width: 390, height: 844, name: 'mobile' },
      { width: 1280, height: 800, name: 'desktop' },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/explorer', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('button', { name: 'Load more escrows' })).toBeVisible();
      expect(await page.screenshot({ fullPage: true })).toMatchSnapshot(
        `explorer-pagination-${viewport.name}.png`,
      );
    }
  });
});
