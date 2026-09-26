import { expect, test } from '@playwright/test';

test.describe('Escrow share-link access', () => {
  test('opens an anonymous share link and handles revoke/expired responses', async ({ page }) => {
    await page.route('**/api/share-links/demo-token', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          escrowId: '42',
          title: 'Shared escrow',
          status: 'Active',
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      }),
    );

    await page.goto('/share/demo-token', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/shared escrow/i)).toBeVisible();

    await page.route('**/api/share-links/revoked-token', (route) =>
      route.fulfill({
        status: 410,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Share link has expired or was revoked.' }),
      }),
    );

    await page.goto('/share/revoked-token', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/expired|revoked/i)).toBeVisible();
  });
});
