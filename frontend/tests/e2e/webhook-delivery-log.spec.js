import { expect, test } from '@playwright/test';

test('views seeded webhook deliveries, filters failures, and never exposes secrets', async ({ page }) => {
  await page.route('**/api/webhooks', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [{ id: 'wh_1', url: 'https://example.com/hooks', eventTypes: ['escrow.updated'] }],
      }),
    });
  });

  await page.route('**/api/webhooks/wh_1/deliveries', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        page: 1,
        limit: 30,
        total: 2,
        deliveries: [
          {
            id: 'del_1',
            eventType: 'escrow.updated',
            status: 'delivered',
            attempts: 1,
            responseCode: 200,
            errorMessage: null,
            secret: 'SHOULD_NOT_RENDER',
          },
          {
            id: 'del_2',
            eventType: 'escrow.updated',
            status: 'failed',
            attempts: 3,
            responseCode: 500,
            errorMessage: 'Destination returned 500',
            signingSecret: 'TOP_SECRET',
          },
        ],
      }),
    });
  });

  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('ste-app-store', JSON.stringify({ admin: { apiKey: 'e2e-admin-key' } }));
  });

  await page.goto('/admin/webhooks');
  await expect(page.getByRole('heading', { name: 'Webhook Delivery Log' })).toBeVisible();
  await expect(page.getByText('Destination returned 500')).toBeVisible();

  await page.getByLabel('Delivery status').selectOption('failed');
  await expect(page.getByText('failed')).toBeVisible();
  await expect(page.getByText('delivered')).toHaveCount(0);

  await expect(page.getByText('SHOULD_NOT_RENDER')).toHaveCount(0);
  await expect(page.getByText('TOP_SECRET')).toHaveCount(0);
});
