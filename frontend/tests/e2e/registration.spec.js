import { expect, test } from '@playwright/test';

// Targets the sign-up route/contract described in issue #294 (name/email/password
// registration with an email-confirmation step). Selectors are data-testid based,
// matching this repo's convention (see components/auth/LoginForm.jsx's
// data-testid="login-form").

test.describe('Registration flow', () => {
  test('registers a new user and shows the email confirmation screen', async ({ page }) => {
    await page.route('**/api/auth/register', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Confirmation email sent.' }),
      }),
    );

    await page.goto('/signup', { waitUntil: 'domcontentloaded' });

    await page.getByTestId('signup-name').fill('Ada Lovelace');
    await page.getByTestId('signup-email').fill('ada@example.com');
    await page.getByTestId('signup-password').fill('Sup3rSecurePassword!');
    await page.getByTestId('signup-submit').click();

    await expect(page.getByTestId('signup-confirmation')).toBeVisible();
    await expect(page.getByText(/check your email/i)).toBeVisible();
  });

  test('shows an inline error when the email is missing', async ({ page }) => {
    await page.goto('/signup', { waitUntil: 'domcontentloaded' });

    await page.getByTestId('signup-name').fill('Ada Lovelace');
    await page.getByTestId('signup-password').fill('Sup3rSecurePassword!');
    await page.getByTestId('signup-submit').click();

    await expect(page.getByTestId('signup-email-error')).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test('shows a duplicate-email error for an already-registered address', async ({ page }) => {
    await page.route('**/api/auth/register', (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'An account with this email already exists.' }),
      }),
    );

    await page.goto('/signup', { waitUntil: 'domcontentloaded' });

    await page.getByTestId('signup-name').fill('Ada Lovelace');
    await page.getByTestId('signup-email').fill('taken@example.com');
    await page.getByTestId('signup-password').fill('Sup3rSecurePassword!');
    await page.getByTestId('signup-submit').click();

    await expect(page.getByTestId('signup-duplicate-error')).toBeVisible();
    await expect(page.getByText(/already exists/i)).toBeVisible();
  });
});
