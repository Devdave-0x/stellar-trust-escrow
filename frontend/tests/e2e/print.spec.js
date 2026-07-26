// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Print Styles', () => {
  test('escrow detail page generates PDF with key fields present', async ({ page }) => {
    // Navigate to an escrow detail page. The page loads with placeholder data
    // when the API is not available, which is fine for testing print layout.
    await page.goto('/escrow/1');

    // Wait for the page to fully render (including placeholder escrow data)
    await page.waitForSelector('h1', { timeout: 15000 });

    // Verify title is present
    const title = page.locator('h1');
    await expect(title).toBeVisible();

    // Generate PDF with print media emulation
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: false,
      preferCSSPageSize: true,
    });

    // PDF should not be empty
    expect(pdf.length).toBeGreaterThan(1000);

    // Basic check: title text should be visible on the page
    const titleText = await title.textContent();
    expect(titleText).toBeTruthy();
  });

  test('print stylesheet hides action buttons in print media', async ({ page }) => {
    await page.goto('/escrow/1');
    await page.waitForSelector('h1', { timeout: 15000 });

    // Emulate print media
    await page.emulateMedia({ media: 'print' });

    // Action buttons should be hidden (display: none in print)
    const raiseDisputeBtn = page.locator('button', { hasText: 'Raise Dispute' });
    await expect(raiseDisputeBtn).toBeHidden();
  });

  test('print stylesheet keeps escrow title visible', async ({ page }) => {
    await page.goto('/escrow/1');
    await page.waitForSelector('h1', { timeout: 15000 });

    // Emulate print media
    await page.emulateMedia({ media: 'print' });

    // Title should be visible
    const title = page.locator('h1');
    await expect(title).toBeVisible();
  });
});
