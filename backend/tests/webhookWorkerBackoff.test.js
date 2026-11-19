import { describe, expect, it } from '@jest/globals';
import {
  computeWebhookBackoffMs,
  isWebhookDeliveryTerminal,
} from '../workers/webhookWorker.js';

describe('webhook worker backoff — issues 903-904', () => {
  it('applies exponential backoff caps', () => {
    expect(computeWebhookBackoffMs(1)).toBe(1000);
    expect(computeWebhookBackoffMs(5)).toBeGreaterThan(1000);
  });

  it('marks deliveries terminal after the delivery window', () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    expect(isWebhookDeliveryTerminal(2, old, { deliveryWindowMs: 1000 })).toBe(true);
  });
});