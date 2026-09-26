import { expect, test } from '@playwright/test';

test.describe('Passkey enrollment failure', () => {
  test('shows failure copy and keeps retry available', async ({ page }) => {
    await page.addInitScript(() => {
      window.PublicKeyCredential = function PublicKeyCredential() {};
      navigator.credentials = {
        create: async () => {
          throw new DOMException('User cancelled', 'NotAllowedError');
        },
      };
    });

    await page.goto('/profile/settings', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /passkey|enroll/i }).click();

    await expect(page.getByText(/cancelled|failed|try again/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /try again|retry|passkey/i })).toBeVisible();
  });
});
