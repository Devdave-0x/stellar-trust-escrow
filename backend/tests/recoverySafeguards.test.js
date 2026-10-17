import { describe, expect, it, jest } from '@jest/globals';
import { validateCheckpointRecoveryConfig } from '../services/eventWorker.js';
import { queueSubscriptionWebhook } from '../services/webhookService.js';

describe('checkpoint recovery configuration', () => {
  it('accepts bounded recovery settings', () => {
    expect(
      validateCheckpointRecoveryConfig({
        INDEXER_CHECKPOINT_RETRY_LIMIT: '4',
        INDEXER_CHECKPOINT_RETRY_DELAY_MS: '500',
      }),
    ).toEqual({ retryLimit: 4, retryDelayMs: 500 });
  });

  it('rejects malformed limits', () => {
    expect(() =>
      validateCheckpointRecoveryConfig({ INDEXER_CHECKPOINT_RETRY_LIMIT: 'many' }),
    ).toThrow('INDEXER_CHECKPOINT_RETRY_LIMIT');
  });

  it('rejects contradictory disabled retry settings', () => {
    expect(() =>
      validateCheckpointRecoveryConfig({
        INDEXER_CHECKPOINT_RETRY_LIMIT: '0',
        INDEXER_CHECKPOINT_RETRY_DELAY_MS: '1000',
      }),
    ).toThrow('must be 0');
  });
});

describe('webhook delivery failure injection', () => {
  const subscription = { id: 'sub-1', url: 'https://example.com/hook', secret: 'secret' };
  const database = {
    webhookDelivery: {
      create: jest.fn().mockResolvedValue({ id: 'delivery-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
  };

  it('queues a prepared webhook delivery', async () => {
    const enqueue = jest.fn().mockResolvedValue(undefined);
    await expect(
      queueSubscriptionWebhook(subscription, { escrowId: 1 }, 'escrow.created', {
        database,
        enqueue,
      }),
    ).resolves.toEqual({ id: 'delivery-1' });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('propagates queue timeouts for retry handling', async () => {
    const enqueue = jest.fn().mockRejectedValue(new Error('queue timeout'));
    await expect(
      queueSubscriptionWebhook(subscription, {}, 'escrow.created', { database, enqueue }),
    ).rejects.toThrow('queue timeout');
  });

  it('rejects malformed persistence responses', async () => {
    const malformedDatabase = {
      webhookDelivery: {
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    await expect(
      queueSubscriptionWebhook(subscription, {}, 'escrow.created', {
        database: malformedDatabase,
        enqueue: jest.fn(),
      }),
    ).rejects.toThrow();
  });
});
