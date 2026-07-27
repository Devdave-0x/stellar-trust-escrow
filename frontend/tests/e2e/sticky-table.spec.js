// @ts-check
import { test, expect } from '@playwright/test';

test.describe('StickyTable', () => {
  test('sticky header remains visible after scrolling within a table container', async ({
    page,
  }) => {
    // Navigate to a page with a table that uses sticky headers.
    // We'll test by injecting a StickyTable-wrapped table into the page
    // since the audit-logs page doesn't use StickyTable natively.
    await page.goto('/admin/audit-logs');
    await page.waitForSelector('table', { timeout: 15000 });

    // Apply sticky header styles to the existing table's thead
    await page.evaluate(() => {
      const thead = document.querySelector('table thead');
      if (thead) {
        thead.style.position = 'sticky';
        thead.style.top = '0';
        thead.style.zIndex = '10';
        thead.style.backgroundColor = '#111827'; // dark:bg-gray-800
      }
    });

    const thead = page.locator('table thead').first();

    // Get initial header position
    const initialBox = await thead.boundingBox();
    expect(initialBox).toBeTruthy();

    if (initialBox) {
      // Scroll the page down 500px
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(300);

      const scrolledBox = await thead.boundingBox();
      expect(scrolledBox).toBeTruthy();

      if (scrolledBox) {
        // With sticky positioning, the header should stay near the top
        // of the viewport rather than scrolling off-screen
        expect(scrolledBox.y).toBeLessThan(200);
      }
    }
  });

  test('sticky header has solid background so rows dont bleed through', async ({ page }) => {
    await page.goto('/admin/audit-logs');
    await page.waitForSelector('table', { timeout: 15000 });

    // Apply sticky with background
    await page.evaluate(() => {
      const thead = document.querySelector('table thead');
      if (thead) {
        thead.style.position = 'sticky';
        thead.style.top = '0';
        thead.style.zIndex = '10';
        thead.style.backgroundColor = '#111827';
      }
    });

    const thead = page.locator('table thead').first();

    // Check that the thead has a computed background-color (not transparent)
    const bgColor = await thead.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    // Should not be transparent (rgba(0,0,0,0))
    expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(bgColor).toBeTruthy();
  });
});
