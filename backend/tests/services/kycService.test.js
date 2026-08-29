import { jest } from '@jest/globals';
import kycService from '../../services/kycService.js';

describe('kycService - Null/Undefined handling regression tests (#447)', () => {
  describe('verifyWebhookSignature', () => {
    it('returns false safely when rawBody is null', () => {
      expect(kycService.verifyWebhookSignature(null, 'some-sig')).toBe(false);
    });

    it('returns false safely when signature is null', () => {
      expect(kycService.verifyWebhookSignature('{"type":"applicantCreated"}', null)).toBe(false);
    });

    it('returns false safely when both rawBody and signature are undefined', () => {
      expect(kycService.verifyWebhookSignature(undefined, undefined)).toBe(false);
    });
  });

  describe('handleWebhook', () => {
    it('returns null safely when payload is null', async () => {
      const result = await kycService.handleWebhook(null);
      expect(result).toBeNull();
    });

    it('returns null safely when payload is undefined', async () => {
      const result = await kycService.handleWebhook(undefined);
      expect(result).toBeNull();
    });

    it('returns null when payload type is unhandled/unknown', async () => {
      const result = await kycService.handleWebhook({ type: 'unknownEventType' });
      expect(result).toBeNull();
    });
  });

  describe('getStatus & generateSdkToken', () => {
    it('returns null when address is null in getStatus', async () => {
      const result = await kycService.getStatus(null);
      expect(result).toBeNull();
    });

    it('returns null when address is undefined in generateSdkToken', async () => {
      const result = await kycService.generateSdkToken(undefined);
      expect(result).toBeNull();
    });
  });
});
