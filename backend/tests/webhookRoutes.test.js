/**
 * HTTP-level integration tests for the webhook subscription API.
 *
 * Covers:
 *  - authentication is required on every route (mounted under /api/v1)
 *  - happy path: subscribe, list, rotate secret, delete, deliveries
 *  - failure modes: invalid url, invalid eventTypes, not-found, internal errors
 *  - responses use the standard { error: { code, message } } envelope
 */

import { jest } from '@jest/globals';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-webhook-routes-secret';

const webhookServiceMock = {
  createSubscription: jest.fn(),
  listSubscriptions: jest.fn(),
  deleteSubscription: jest.fn(),
  getDeliveryHistory: jest.fn(),
  rotateSecret: jest.fn(),
};

jest.unstable_mockModule('../services/webhookService.js', () => ({
  default: webhookServiceMock,
}));

const { default: webhookRoutes } = await import('../api/routes/webhookRoutes.js');

function bearerToken(address = 'GADDRESSA') {
  return `Bearer ${jwt.sign({ address }, process.env.JWT_SECRET, { algorithm: 'HS256' })}`;
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/webhooks', webhookRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Webhook routes — auth', () => {
  it('rejects every route without a bearer token', async () => {
    const app = createApp();

    await request(app).get('/api/v1/webhooks').expect(401);
    await request(app).post('/api/v1/webhooks/subscribe').send({}).expect(401);
    await request(app).delete('/api/v1/webhooks/sub_1').expect(401);
    await request(app).get('/api/v1/webhooks/sub_1/deliveries').expect(401);
    await request(app).post('/api/v1/webhooks/sub_1/rotate-secret').expect(401);

    expect(webhookServiceMock.createSubscription).not.toHaveBeenCalled();
  });

  it('rejects an invalid bearer token', async () => {
    const app = createApp();

    await request(app)
      .get('/api/v1/webhooks')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });
});

describe('Webhook routes — subscribe (happy path + failure modes)', () => {
  it('creates a subscription for a valid HTTPS url and eventTypes', async () => {
    const app = createApp();
    webhookServiceMock.createSubscription.mockResolvedValue({
      id: 'sub_1',
      url: 'https://example.com/hook',
      eventTypes: ['esc_crt'],
      secret: 'plain-secret',
      createdAt: '2026-07-27T00:00:00.000Z',
      updatedAt: '2026-07-27T00:00:00.000Z',
    });

    const res = await request(app)
      .post('/api/v1/webhooks/subscribe')
      .set('Authorization', bearerToken('GADDRESSA'))
      .send({ url: 'https://example.com/hook', eventTypes: ['esc_crt'] })
      .expect(201);

    expect(res.body.data).toMatchObject({ id: 'sub_1', url: 'https://example.com/hook' });
    expect(webhookServiceMock.createSubscription).toHaveBeenCalledWith({
      url: 'https://example.com/hook',
      eventTypes: ['esc_crt'],
      createdBy: 'GADDRESSA',
    });
  });

  it('rejects a non-HTTPS url with a standard error envelope', async () => {
    const app = createApp();

    const res = await request(app)
      .post('/api/v1/webhooks/subscribe')
      .set('Authorization', bearerToken())
      .send({ url: 'http://example.com/hook', eventTypes: ['esc_crt'] })
      .expect(400);

    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: expect.stringContaining('HTTPS') },
    });
    expect(webhookServiceMock.createSubscription).not.toHaveBeenCalled();
  });

  it('rejects a missing url', async () => {
    const app = createApp();

    const res = await request(app)
      .post('/api/v1/webhooks/subscribe')
      .set('Authorization', bearerToken())
      .send({ eventTypes: ['esc_crt'] })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an empty eventTypes array', async () => {
    const app = createApp();

    const res = await request(app)
      .post('/api/v1/webhooks/subscribe')
      .set('Authorization', bearerToken())
      .send({ url: 'https://example.com/hook', eventTypes: [] })
      .expect(400);

    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: expect.stringContaining('eventTypes') },
    });
  });

  it('rejects more than 20 eventTypes', async () => {
    const app = createApp();
    const eventTypes = Array.from({ length: 21 }, (_, i) => `evt_${i}`);

    const res = await request(app)
      .post('/api/v1/webhooks/subscribe')
      .set('Authorization', bearerToken())
      .send({ url: 'https://example.com/hook', eventTypes })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns a 500 envelope when the service layer throws', async () => {
    const app = createApp();
    webhookServiceMock.createSubscription.mockRejectedValue(new Error('db unavailable'));

    const res = await request(app)
      .post('/api/v1/webhooks/subscribe')
      .set('Authorization', bearerToken())
      .send({ url: 'https://example.com/hook', eventTypes: ['esc_crt'] })
      .expect(500);

    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'db unavailable' },
    });
  });
});

describe('Webhook routes — list, deliveries, rotate, delete', () => {
  it('lists subscriptions scoped to the authenticated address', async () => {
    const app = createApp();
    webhookServiceMock.listSubscriptions.mockResolvedValue([{ id: 'sub_1' }]);

    const res = await request(app)
      .get('/api/v1/webhooks')
      .set('Authorization', bearerToken('GADDRESSA'))
      .expect(200);

    expect(res.body.data).toEqual([{ id: 'sub_1' }]);
    expect(webhookServiceMock.listSubscriptions).toHaveBeenCalledWith({ createdBy: 'GADDRESSA' });
  });

  it('returns delivery history for a subscription', async () => {
    const app = createApp();
    webhookServiceMock.getDeliveryHistory.mockResolvedValue({
      page: 1,
      limit: 30,
      total: 1,
      deliveries: [{ id: 'delivery_1', status: 'success' }],
    });

    const res = await request(app)
      .get('/api/v1/webhooks/sub_1/deliveries')
      .set('Authorization', bearerToken('GADDRESSA'))
      .expect(200);

    expect(res.body).toEqual({
      page: 1,
      limit: 30,
      total: 1,
      deliveries: [{ id: 'delivery_1', status: 'success' }],
    });
    expect(webhookServiceMock.getDeliveryHistory).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: 'sub_1', createdBy: 'GADDRESSA' }),
    );
  });

  it('rotates a subscription secret', async () => {
    const app = createApp();
    webhookServiceMock.rotateSecret.mockResolvedValue({ id: 'sub_1', secret: 'new-secret' });

    const res = await request(app)
      .post('/api/v1/webhooks/sub_1/rotate-secret')
      .set('Authorization', bearerToken('GADDRESSA'))
      .expect(200);

    expect(res.body.data).toEqual({ id: 'sub_1', secret: 'new-secret' });
  });

  it('returns 404 when rotating a secret for a subscription owned by someone else', async () => {
    const app = createApp();
    const notFound = Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
    webhookServiceMock.rotateSecret.mockRejectedValue(notFound);

    const res = await request(app)
      .post('/api/v1/webhooks/sub_1/rotate-secret')
      .set('Authorization', bearerToken('GADDRESSA'))
      .expect(404);

    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Webhook subscription not found' },
    });
  });

  it('deletes a subscription', async () => {
    const app = createApp();
    webhookServiceMock.deleteSubscription.mockResolvedValue(true);

    await request(app)
      .delete('/api/v1/webhooks/sub_1')
      .set('Authorization', bearerToken('GADDRESSA'))
      .expect(204);
  });

  it('returns 404 with a standard envelope when deleting a subscription that does not exist', async () => {
    const app = createApp();
    webhookServiceMock.deleteSubscription.mockResolvedValue(false);

    const res = await request(app)
      .delete('/api/v1/webhooks/sub_missing')
      .set('Authorization', bearerToken('GADDRESSA'))
      .expect(404);

    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Webhook subscription not found' },
    });
  });
});
