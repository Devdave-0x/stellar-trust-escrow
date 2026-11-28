import { Worker } from 'bullmq';

import prisma from '../lib/prisma.js';
import { connection } from '../queues/index.js';
import {
  calculateRetryDelayMs,
  emitWebhookDeadEvent,
  MAX_DELIVERY_ATTEMPTS,
} from '../services/webhookService.js';

const DEFAULT_BASE_BACKOFF_MS = parseInt(process.env.WEBHOOK_BACKOFF_BASE_MS || '1000', 10);
const DEFAULT_MAX_BACKOFF_MS = parseInt(process.env.WEBHOOK_BACKOFF_MAX_MS || String(60 * 60 * 1000), 10);
const DEFAULT_DELIVERY_WINDOW_MS = parseInt(
  process.env.WEBHOOK_DELIVERY_WINDOW_MS || String(24 * 60 * 60 * 1000),
  10,
);

export function computeWebhookBackoffMs(attempt, opts = {}) {
  const baseMs = opts.baseMs ?? DEFAULT_BASE_BACKOFF_MS;
  const maxMs = opts.maxMs ?? DEFAULT_MAX_BACKOFF_MS;
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
}

export function isWebhookDeliveryTerminal(attempt, firstAttemptAt, opts = {}) {
  const windowMs = opts.deliveryWindowMs ?? DEFAULT_DELIVERY_WINDOW_MS;
  const maxAttempts = opts.maxAttempts ?? 8;
  if (attempt >= maxAttempts) return true;
  if (firstAttemptAt && Date.now() - Date.parse(firstAttemptAt) > windowMs) return true;
  return false;
}

export async function redriveDeadLetterDelivery(deliveryId) {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { subscription: true },
  });
  if (!delivery || !delivery.subscription) {
    throw new Error('Delivery not found');
  }
  if (delivery.status !== 'failed') {
    throw new Error('Only failed deliveries can be redriven');
  }
  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: { status: 'pending', attempts: 0, errorMessage: null },
  });
  return { deliveryId, status: 'pending' };
}

export async function processWebhookJob(job) {
  const { url, payload, headers = {}, deliveryId, backoffPolicy = {} } = job.data;
  const attempts = job.attemptsMade + 1;
  const body =
    typeof payload === 'string' ? payload : JSON.stringify(payload);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body,
    });

    const responseBody = await response.text();

    if (!response.ok) {
      throw Object.assign(new Error(`Webhook failed: ${response.status}`), {
        responseCode: response.status,
        responseBody,
      });
    }

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'delivered',
        responseCode: response.status,
        responseBody,
        attempts,
        nextRetryAt: null,
      },
    });
  } catch (err) {
    const responseCode = err.responseCode ?? null;
    const responseBody = err.responseBody ?? err.message;
    const isTerminal = attempts >= MAX_DELIVERY_ATTEMPTS;
    const nextRetryAt = isTerminal
      ? null
      : new Date(Date.now() + calculateRetryDelayMs(attempts));

    const updated = await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: isTerminal ? 'dead' : 'failed',
        responseCode,
        responseBody,
        attempts,
        nextRetryAt,
      },
    });

    if (isTerminal) {
      emitWebhookDeadEvent(updated);
      return;
    }

    throw err;
  }
}

const webhookWorker =
  process.env.NODE_ENV === 'test'
    ? null
    : new Worker('webhook-delivery', processWebhookJob, {
        connection,
      });

export default webhookWorker;
