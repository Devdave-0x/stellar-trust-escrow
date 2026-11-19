import { Worker } from 'bullmq';
import prisma from '../lib/prisma.js';
import { connection } from '../queues/index.js';

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

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Webhook failed: ${response.status} ${errorText}`);
    }

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'success',
        responseCode: response.status,
        attempts,
        lastAttemptAt: new Date(),
      },
    });

    console.log(`[WebhookWorker] Delivered to ${url}: ${response.status}`);
  } catch (err) {
    const existing = await prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      select: { createdAt: true },
    });
    const isTerminal =
      attempts >= (job.opts.attempts ?? 1) ||
      isWebhookDeliveryTerminal(attempts, existing?.createdAt?.toISOString(), backoffPolicy);
    const retryDelayMs = computeWebhookBackoffMs(attempts, backoffPolicy);
    if (!isTerminal) {
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: isTerminal ? 'failed' : 'pending',
        errorMessage: err.message,
        attempts,
        lastAttemptAt: new Date(),
      },
    });
    throw err;
  }
}

const webhookWorker =
  process.env.NODE_ENV === 'test'
    ? null
    : new Worker('webhook', processWebhookJob, {
        connection,
      });

export default webhookWorker;
