/**
 * Streaming Indexer — error-context tests
 *
 * Regression coverage for surfacing specific, actionable failure reasons
 * (instead of a generic "Internal error") without leaking secrets/tokens
 * into the message.
 */

import { parseStreamEvent, applyStreamEvent, processStreamEvent, sanitizeDetails } from '../services/streamingIndexer.js';

describe('streamingIndexer', () => {
  describe('parseStreamEvent', () => {
    it('throws a context-rich error for a null payload', () => {
      expect(() => parseStreamEvent(null)).toThrow(/null\/undefined event payload/);
    });

    it('throws with the ledger context when required fields are missing', () => {
      expect(() => parseStreamEvent({ ledger: 42 })).toThrow(/ledger 42/);
    });

    it('parses a well-formed event', () => {
      const event = parseStreamEvent({ id: 'evt_1', ledger: 10, type: 'escrow_created' });
      expect(event).toEqual({
        id: 'evt_1',
        ledger: 10,
        type: 'escrow_created',
        contractId: undefined,
        topic: undefined,
        value: undefined,
      });
    });
  });

  describe('applyStreamEvent', () => {
    it('includes the event id, ledger, and underlying reason on failure', async () => {
      const failingApply = async () => {
        throw new Error('unique constraint violation on escrow_id');
      };
      await expect(
        applyStreamEvent(failingApply, { id: 'evt_2', ledger: 99, type: 'escrow_completed' }),
      ).rejects.toThrow(/evt_2.*99.*unique constraint violation/s);
    });
  });

  describe('processStreamEvent', () => {
    it('propagates a parse failure before ever calling apply', async () => {
      const applyFn = jest.fn();
      await expect(processStreamEvent({}, applyFn)).rejects.toThrow(/missing required fields/);
      expect(applyFn).not.toHaveBeenCalled();
    });
  });

  describe('sanitizeDetails', () => {
    it('strips keys that look like secrets/tokens', () => {
      const safe = sanitizeDetails({ eventId: 'evt_3', apiKey: 'sk_live_123', authToken: 'abc' });
      expect(safe).toEqual({ eventId: 'evt_3' });
    });
  });
});
