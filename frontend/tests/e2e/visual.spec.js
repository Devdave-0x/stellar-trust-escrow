import { expect, test } from '@playwright/test';

const MOCK_ADDRESS = 'GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTGG';

function escrowFixture(overrides = {}) {
  return {
    id: 361,
    title: 'Payment token availability',
    status: 'Active',
    clientAddress: MOCK_ADDRESS,
    freelancerAddress: 'GBRPYHIL2CI3HWOCIBQJRL5G7YVBN4K3LA3E6I4D2CIXSKK6VTJRN6WZ',
    totalAmount: '250 USDC',
    remainingBalance: '250 USDC',
    paymentToken: 'USDC',
    paymentTokenAvailable: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    deadline: '2026-02-01T00:00:00.000Z',
    milestones: [],
    ...overrides,
  };
}

async function mockEscrow(page, escrow) {
  await page.route('**/api/escrows/361', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(escrow) }),
  );
  await page.route('**/api/escrows/361/events', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) }),
  );
}

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

  test('payment-token availability: active client desktop state matches the baseline', async ({ page }) => {
    await seedWalletAuth(page);
    await mockEscrow(page, escrowFixture());
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto('/escrow/361', { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('payment-token-availability')).toContainText('Available for escrow actions');
    await expect(page.getByRole('button', { name: /Raise Dispute/ })).toBeEnabled();
    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot('escrow-payment-token-available-desktop.png');
  });

  test('payment-token availability: unavailable token is gated on a compact viewport', async ({ page }) => {
    await seedWalletAuth(page);
    await mockEscrow(page, escrowFixture({ paymentTokenAvailable: false }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/escrow/361', { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('payment-token-availability')).toContainText('Temporarily unavailable');
    await expect(page.getByRole('button', { name: /Raise Dispute/ })).toBeDisabled();
    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot('escrow-payment-token-unavailable-mobile.png');
  });

  test('payment-token availability: observer actions remain disabled', async ({ page }) => {
    await seedWalletAuth(page);
    await mockEscrow(page, escrowFixture({ clientAddress: 'GBRPYHIL2CI3HWOCIBQJRL5G7YVBN4K3LA3E6I4D2CIXSKK6VTJRN6WZ' }));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/escrow/361', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: /Raise Dispute/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Cancel Escrow/ })).toBeDisabled();
    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot('escrow-payment-token-observer-desktop.png');
  });
});
