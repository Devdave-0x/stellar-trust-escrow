const { test, expect } = require('@playwright/test');

test.describe('Skip to main content link', () => {
  test('Tab from page start focuses the skip link, Enter jumps to #main-content', async ({
    page,
  }) => {
    await page.goto('/');

    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: /skip to main content/i });
    await expect(skipLink).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main-content$/);
  });
});
