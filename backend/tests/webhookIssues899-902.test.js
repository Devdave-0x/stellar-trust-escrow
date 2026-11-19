import { describe, expect, it } from '@jest/globals';
import { serializeTransmittedBody, signTransmittedBytes } from '../services/webhookService.js';
import { mapSubmissionLifecycle } from '../api/controllers/paymentController.js';

describe('webhook + payment issues 899-902', () => {
  it('signs the exact transmitted payload bytes', () => {
    const payload = { eventType: 'esc_crt', data: { id: 1 } };
    const body = serializeTransmittedBody(payload);
    const sig = signTransmittedBytes('secret', '1700000000', body);
    expect(sig.startsWith('sha256=')).toBe(true);
  });

  it('maps transaction lifecycle states', () => {
    expect(mapSubmissionLifecycle({ status: 'SUCCESS' })).toBe('confirmed');
    expect(mapSubmissionLifecycle({ status: 'FAILED' })).toBe('failed');
    expect(mapSubmissionLifecycle({ status: 'TIMEOUT' })).toBe('pending');
  });
});