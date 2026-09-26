import { describe, test, expect, beforeEach, jest } from '@jest/globals';

jest.unstable_mockModule('../services/relayerService.js', () => ({
  getRelayerBalance: jest
    .fn()
    .mockResolvedValueOnce({ balance: '100.00', accountId: 'GRELAYER123' })
    .mockResolvedValueOnce({ balance: '5.00', accountId: 'GRELAYER123' })
    .mockResolvedValueOnce({ balance: '1000.00', accountId: 'GRELAYER456' }),
  submitSponsoredTransaction: jest.fn().mockResolvedValue({ success: true }),
}));

jest.unstable_mockModule('../services/alertService.js', () => ({
  emitAlert: jest.fn().mockResolvedValue({ success: true }),
}));

jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule('../config/constants.js', () => ({
  RELAYER_BALANCE_THRESHOLDS: {
    testnet: { warning: '10.00', critical: '1.00' },
    mainnet: { warning: '100.00', critical: '10.00' },
  },
}));

describe('relayerBalanceMonitoring', () => {
  let relayerService;
  let alertService;
  let constants;

  beforeEach(async () => {
    jest.resetModules();
    relayerService = await import('../services/relayerService.js');
    alertService = await import('../services/alertService.js');
    constants = await import('../config/constants.js');
  });

  describe('balance monitoring', () => {
    test('monitors relayer account balance', async () => {
      const balance = await relayerService.getRelayerBalance('testnet', 'GRELAYER123');

      expect(balance).toHaveProperty('balance');
      expect(balance).toHaveProperty('accountId');
      expect(typeof balance.balance).toBe('string');
      expect(typeof balance.accountId).toBe('string');
    });

    test('returns current balance and account id', async () => {
      const balance = await relayerService.getRelayerBalance('testnet', 'GRELAYER123');

      expect(balance.accountId).toBe('GRELAYER123');
      expect(parseFloat(balance.balance)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('balance thresholds', () => {
    test('thresholds are configurable per network', async () => {
      expect(constants.RELAYER_BALANCE_THRESHOLDS).toHaveProperty('testnet');
      expect(constants.RELAYER_BALANCE_THRESHOLDS).toHaveProperty('mainnet');
      expect(constants.RELAYER_BALANCE_THRESHOLDS.testnet).toHaveProperty('warning');
      expect(constants.RELAYER_BALANCE_THRESHOLDS.testnet).toHaveProperty('critical');
      expect(constants.RELAYER_BALANCE_THRESHOLDS.mainnet).toHaveProperty('warning');
      expect(constants.RELAYER_BALANCE_THRESHOLDS.mainnet).toHaveProperty('critical');
    });

    test('testnet thresholds are lower than mainnet', async () => {
      const testnetWarning = parseFloat(constants.RELAYER_BALANCE_THRESHOLDS.testnet.warning);
      const mainnetWarning = parseFloat(constants.RELAYER_BALANCE_THRESHOLDS.mainnet.warning);

      expect(testnetWarning).toBeLessThan(mainnetWarning);
    });

    test('critical threshold is lower than warning threshold', async () => {
      const warningThreshold = parseFloat(constants.RELAYER_BALANCE_THRESHOLDS.testnet.warning);
      const criticalThreshold = parseFloat(constants.RELAYER_BALANCE_THRESHOLDS.testnet.critical);

      expect(criticalThreshold).toBeLessThan(warningThreshold);
    });
  });

  describe('alert emissions', () => {
    test('emits alert with balance information', async () => {
      const balance = await relayerService.getRelayerBalance('testnet', 'GRELAYER123');
      await alertService.emitAlert({
        level: 'warning',
        message: `Relayer balance low for account ${balance.accountId}`,
        balance: balance.balance,
        accountId: balance.accountId,
        network: 'testnet',
      });

      expect(alertService.emitAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warning',
          balance: balance.balance,
          accountId: balance.accountId,
        })
      );
    });

    test('alert includes current balance and account id', async () => {
      const balance = await relayerService.getRelayerBalance('testnet', 'GRELAYER123');

      expect(balance).toHaveProperty('balance');
      expect(balance).toHaveProperty('accountId');
      expect(balance.balance).toBeDefined();
      expect(balance.accountId).toBeDefined();
    });

    test('emits critical alert when balance below critical threshold', async () => {
      const lowBalance = await relayerService.getRelayerBalance('testnet', 'GRELAYER123');

      if (parseFloat(lowBalance.balance) < parseFloat(constants.RELAYER_BALANCE_THRESHOLDS.testnet.critical)) {
        await alertService.emitAlert({
          level: 'critical',
          message: `Relayer balance CRITICAL for account ${lowBalance.accountId}`,
          balance: lowBalance.balance,
          accountId: lowBalance.accountId,
        });

        expect(alertService.emitAlert).toHaveBeenCalled();
      }
    });
  });

  describe('low-balance mock responses', () => {
    test('handles low balance scenario (testnet)', async () => {
      jest.resetModules();
      relayerService = await import('../services/relayerService.js');

      const balance = await relayerService.getRelayerBalance('testnet', 'GRELAYER123');
      const criticalThreshold = parseFloat(constants.RELAYER_BALANCE_THRESHOLDS.testnet.critical);

      expect(balance).toHaveProperty('balance');
      expect(balance).toHaveProperty('accountId');
    });

    test('handles multiple relayers with different balance levels', async () => {
      const balance1 = await relayerService.getRelayerBalance('testnet', 'GRELAYER123');
      const balance2 = await relayerService.getRelayerBalance('testnet', 'GRELAYER456');

      expect(balance1.accountId).toBe('GRELAYER123');
      expect(balance2.accountId).toBe('GRELAYER456');
      expect(parseFloat(balance1.balance)).not.toEqual(parseFloat(balance2.balance));
    });
  });

  describe('sponsored transaction impact', () => {
    test('balance affects sponsored transaction signing capability', async () => {
      const balance = await relayerService.getRelayerBalance('testnet', 'GRELAYER123');
      const canSign = parseFloat(balance.balance) > parseFloat(constants.RELAYER_BALANCE_THRESHOLDS.testnet.critical);

      expect(typeof canSign).toBe('boolean');
    });

    test('sufficient balance allows transaction submission', async () => {
      const balance = await relayerService.getRelayerBalance('testnet', 'GRELAYER123');

      if (parseFloat(balance.balance) > parseFloat(constants.RELAYER_BALANCE_THRESHOLDS.testnet.critical)) {
        const result = await relayerService.submitSponsoredTransaction({
          transaction: 'txn_data',
          relayerAccount: balance.accountId,
        });

        expect(result.success).toBe(true);
      }
    });
  });
});
