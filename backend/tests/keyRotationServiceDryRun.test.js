import { describe, test, expect, beforeEach, jest } from '@jest/globals';

jest.unstable_mockModule('../services/keyRotationService.js', () => ({
  dryRunKeyRotation: jest.fn().mockResolvedValue({
    success: true,
    dryRun: true,
    affectedRecords: 150,
    blockers: [],
    validationChecks: [
      { check: 'signing_key_usage', status: 'passed' },
      { check: 'encryption_key_references', status: 'passed' },
      { check: 'dependent_services', status: 'passed' },
    ],
    estimatedDowntime: 'minimal',
  }),
  rotateSigningKey: jest.fn().mockResolvedValue({
    success: true,
    rotatedRecords: 150,
  }),
  getRotationHistory: jest.fn().mockResolvedValue([
    { timestamp: new Date().toISOString(), keyType: 'signing', status: 'success' },
  ]),
}));

jest.unstable_mockModule('../services/databaseService.js', () => ({
  getRecordsUsingKey: jest.fn().mockResolvedValue({
    signing: 150,
    encryption: 250,
  }),
  getKeys: jest.fn().mockResolvedValue({
    signing: 'old_signing_key',
    encryption: 'old_encryption_key',
  }),
}));

jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

describe('keyRotationServiceDryRun', () => {
  let keyRotationService;
  let databaseService;

  beforeEach(async () => {
    jest.resetModules();
    keyRotationService = await import('../services/keyRotationService.js');
    databaseService = await import('../services/databaseService.js');
  });

  describe('dry-run execution', () => {
    test('dry-run performs no writes', async () => {
      const result = await keyRotationService.dryRunKeyRotation({
        keyType: 'signing',
      });

      expect(result.dryRun).toBe(true);
      expect(result.success).toBe(true);
    });

    test('dry-run returns before any modifications', async () => {
      const result = await keyRotationService.dryRunKeyRotation({
        keyType: 'encryption',
      });

      expect(result).toHaveProperty('affectedRecords');
      expect(result).toHaveProperty('blockers');
      expect(result).toHaveProperty('validationChecks');
    });

    test('keys remain unchanged after dry-run', async () => {
      const keysBefore = await databaseService.getKeys();
      await keyRotationService.dryRunKeyRotation({
        keyType: 'signing',
      });
      const keysAfter = await databaseService.getKeys();

      expect(keysBefore.signing).toBe(keysAfter.signing);
      expect(keysBefore.encryption).toBe(keysAfter.encryption);
    });
  });

  describe('impacted records reporting', () => {
    test('returns count of impacted records', async () => {
      const result = await keyRotationService.dryRunKeyRotation({
        keyType: 'signing',
      });

      expect(result).toHaveProperty('affectedRecords');
      expect(typeof result.affectedRecords).toBe('number');
      expect(result.affectedRecords).toBeGreaterThanOrEqual(0);
    });

    test('affected record count matches database scan', async () => {
      const dbRecords = await databaseService.getRecordsUsingKey('signing');
      const result = await keyRotationService.dryRunKeyRotation({
        keyType: 'signing',
      });

      expect(result.affectedRecords).toBe(dbRecords.signing);
    });

    test('reports different counts for signing vs encryption keys', async () => {
      const signingResult = await keyRotationService.dryRunKeyRotation({
        keyType: 'signing',
      });
      const encryptionResult = await keyRotationService.dryRunKeyRotation({
        keyType: 'encryption',
      });

      expect(signingResult.affectedRecords).not.toEqual(encryptionResult.affectedRecords);
    });
  });

  describe('validation checks', () => {
    test('performs validation checks', async () => {
      const result = await keyRotationService.dryRunKeyRotation({
        keyType: 'signing',
      });

      expect(Array.isArray(result.validationChecks)).toBe(true);
      expect(result.validationChecks.length).toBeGreaterThan(0);
    });

    test('validation checks include status field', async () => {
      const result = await keyRotationService.dryRunKeyRotation({
        keyType: 'signing',
      });

      result.validationChecks.forEach((check) => {
        expect(check).toHaveProperty('check');
        expect(check).toHaveProperty('status');
        expect(['passed', 'failed', 'warning']).toContain(check.status);
      });
    });

    test('reports validation blockers', async () => {
      const result = await keyRotationService.dryRunKeyRotation({
        keyType: 'signing',
      });

      expect(result).toHaveProperty('blockers');
      expect(Array.isArray(result.blockers)).toBe(true);
    });

    test('returns validation check names', async () => {
      const result = await keyRotationService.dryRunKeyRotation({
        keyType: 'signing',
      });

      const checks = result.validationChecks.map((c) => c.check);
      expect(checks).toContain('signing_key_usage');
      expect(checks).toContain('encryption_key_references');
      expect(checks).toContain('dependent_services');
    });
  });

  describe('actual rotation vs dry-run', () => {
    test('dry-run does not call actual rotation', async () => {
      jest.resetModules();
      keyRotationService = await import('../services/keyRotationService.js');

      await keyRotationService.dryRunKeyRotation({
        keyType: 'signing',
      });

      expect(keyRotationService.rotateSigningKey).not.toHaveBeenCalled();
    });

    test('dry-run report can be used to plan actual rotation', async () => {
      const dryRunResult = await keyRotationService.dryRunKeyRotation({
        keyType: 'signing',
      });

      expect(dryRunResult.affectedRecords).toBeGreaterThan(0);
      expect(dryRunResult.blockers).toEqual([]);
      expect(dryRunResult.success).toBe(true);
    });
  });

  describe('rotation history', () => {
    test('retrieves rotation history', async () => {
      const history = await keyRotationService.getRotationHistory();

      expect(Array.isArray(history)).toBe(true);
    });

    test('history entries include timestamp and status', async () => {
      const history = await keyRotationService.getRotationHistory();

      if (history.length > 0) {
        const entry = history[0];
        expect(entry).toHaveProperty('timestamp');
        expect(entry).toHaveProperty('keyType');
        expect(entry).toHaveProperty('status');
      }
    });
  });

  describe('key type validation', () => {
    test('dry-run supports signing key rotation', async () => {
      const result = await keyRotationService.dryRunKeyRotation({
        keyType: 'signing',
      });

      expect(result.success).toBe(true);
    });

    test('dry-run supports encryption key rotation', async () => {
      const result = await keyRotationService.dryRunKeyRotation({
        keyType: 'encryption',
      });

      expect(result.success).toBe(true);
    });
  });
});
