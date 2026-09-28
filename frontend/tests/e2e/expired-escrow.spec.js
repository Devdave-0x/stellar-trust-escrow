import { expect, test } from '@playwright/test';

const MOCK_CLIENT_ADDRESS = 'GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTGG';
const MOCK_FREELANCER_ADDRESS = 'GA4RYZ7QV7G655EJZ5QZ2Y3D23J5M72L7K5Q3Z2Y3D23J5M72L7K5Q3Z2';

const ESCROW_ID = '123456';

function escrowPayload(status) {
  return {
    id: ESCROW_ID,
    title: 'Smart Contract Audit',
    status,
    clientAddress: MOCK_CLIENT_ADDRESS,
    freelancerAddress: MOCK_FREELANCER_ADDRESS,
    totalAmount: '2000',
    remainingBalance: '1500',
    createdAt: '2025-03-01T00:00:00.000Z',
    deadline: '2025-04-01T00:00:00.000Z',
    milestones: [
      {
        id: '1',
        milestoneIndex: 0,
        title: 'Codebase Review',
        amount: '500',
        status: 'Submitted',
        submittedAt: '2025-03-05T00:00:00.000Z',
        resolvedAt: null,
      },
    ],
  };
}

test.describe('Expired Escrow Actions E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Freighter extension (connected as the client)
    await page.addInitScript((address) => {
      window.freighter = {
        isConnected: async () => true,
        getPublicKey: async () => address,
        getNetworkDetails: async () => ({
          network: 'TESTNET_NETWORK',
          passphrase: 'Test SDF Network ; September 2015',
        }),
        requestAccess: async () => true,
        signTransaction: async (xdr) => xdr,
      };
    }, MOCK_CLIENT_ADDRESS);
  });

  test('expired escrow shows Expired status and disables all actions', async ({ page }) => {
    // Intercept the escrow API and return an expired escrow
    await page.route(`**/api/escrows/${ESCROW_ID}`, async (route) => {
      await route.fulfill({ status: 200, json: escrowPayload('Expired') });
    });

    // Pre-connect wallet as the client so RouteGuard allows the page
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((address) => {
      localStorage.setItem(
        'ste-app-store',
        JSON.stringify({
          wallet: { address, isConnected: true, network: 'testnet' },
          admin: { apiKey: null },
        }),
      );
    }, MOCK_CLIENT_ADDRESS);

    await page.goto(`/escrow/${ESCROW_ID}`, { waitUntil: 'domcontentloaded' });

    // Correct messaging: the Expired badge is shown
    await expect(page.getByText('Expired')).toBeVisible();

    // Escrow-level actions are disabled for an expired escrow
    await expect(page.getByRole('button', { name: /raise dispute/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /cancel escrow/i })).not.toBeVisible();

    // Milestone content is still rendered
    await expect(page.getByText('Codebase Review')).toBeVisible();

    // Milestone actions are disabled even though the milestone is Submitted
    // and the connected wallet is the client
    await expect(page.getByRole('button', { name: /approve/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /reject/i })).not.toBeVisible();
  });

  test('active escrow still shows milestone and escrow actions', async ({ page }) => {
    // Contrast case: the same Submitted milestone on an Active escrow
    // must still render its action buttons.
    await page.route(`**/api/escrows/${ESCROW_ID}`, async (route) => {
      await route.fulfill({ status: 200, json: escrowPayload('Active') });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((address) => {
      localStorage.setItem(
        'ste-app-store',
        JSON.stringify({
          wallet: { address, isConnected: true, network: 'testnet' },
          admin: { apiKey: null },
        }),
      );
    }, MOCK_CLIENT_ADDRESS);

    await page.goto(`/escrow/${ESCROW_ID}`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Active')).toBeVisible();

    // Escrow-level actions are available while the escrow is Active
    await expect(page.getByRole('button', { name: /raise dispute/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /cancel escrow/i })).toBeVisible();

    // Milestone actions are available for a Submitted milestone
    await expect(page.getByRole('button', { name: /approve/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /reject/i })).toBeVisible();
  });
});
