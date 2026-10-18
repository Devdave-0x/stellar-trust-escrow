import crypto from 'crypto';

import prisma from '../lib/prisma.js';
import { withTenantScopeBypassed } from '../lib/tenantContext.js';
import { enqueueWebhookDelivery } from '../queues/webhookQueue.js';

const SIGNATURE_HEADER = 'X-Webhook-Signature';
const TIMESTAMP_HEADER = 'X-Webhook-Timestamp';
const DELIVERY_ID_HEADER = 'X-Webhook-Delivery-Id';
const EVENT_TYPE_HEADER = 'X-Webhook-Event-Type';
const DEFAULT_RETRY_ATTEMPTS = 5;
const DEFAULT_BACKOFF_DELAY_MS = 5000;

const DEDUP_OUTCOMES = Object.freeze({
  DELIVERED: 'delivered',
  DEDUPLICATED: 'deduplicated',
  FAILED: 'failed',
});

const dedupMetrics = {
  delivered: 0,
  deduplicated: 0,
  failed: 0,
};

function recordDedupMetric(outcome) {
  if (Object.prototype.hasOwnProperty.call(dedupMetrics, outcome)) {
    dedupMetrics[outcome] += 1;
  }
}

function getDedupMetrics() {
  return { ...dedupMetrics };
}

function resetDedupMetrics() {
  dedupMetrics.delivered = 0;
  dedupMetrics.deduplicated = 0;
  dedupMetrics.failed = 0;
}

/**
 * Emit a bounded, deterministic telemetry log for a deduplication outcome.
 *
 * Only non-sensitive identifiers (delivery id, subscription id, event type)
 * and the outcome are logged. Payloads, URLs, signatures, and secrets are
 * never included.
 */
function logDedupOutcome(outcome, { deliveryId, subscriptionId, eventType, reason } = {}) {
  recordDedupMetric(outcome);
  const entry = {
    scope: 'webhook.dedup',
    outcome,
    deliveryId: deliveryId ?? null,
    subscriptionId: subscriptionId ?? null,
    eventType: eventType ?? null,
    ...(reason ? { reason } : {}),
  };
  if (outcome === DEDUP_OUTCOMES.FAILED) {
    console.warn(JSON.stringify(entry));
  } else {
    console.info(JSON.stringify(entry));
  }
}

/**
 * Derive a deterministic idempotency key for a webhook delivery.
 *
 * The key is scoped to a subscription + event type + payload so that retries
 * and concurrent requests carrying the same logical event collapse onto a
 * single delivery. The payload is hashed (never logged) so the key is stable
 * and free of secrets.
 */
function buildIdempotencyKey(subscriptionId, eventType, payload) {
  const normalizedPayload = typeof payload === 'string' ? payload : JSON.stringify(payload ?? null);
  const digest = crypto
    .createHash('sha256')
    .update(`${subscriptionId}\u0000${eventType}\u0000${normalizedPayload}`)
    .digest('hex');
  return `${subscriptionId}:${eventType}:${digest}`;
}

function selectSubscriptionFields(includeActive = false) {
  return {
    id: true,
    url: true,
    eventTypes: true,
    ...(includeActive ? { isActive: true } : {}),
    createdAt: true,
    updatedAt: true,
  };
}

function buildWebhookPayload(eventType, payload, deliveryId, timestamp = new Date().toISOString()) {
  return {
    eventType,
    deliveryId,
    timestamp,
    data: payload,
  };
}

function generateSecret() {
  return crypto.randomBytes(32).toString('hex');
}

function isNil(value) {
  return value === null || value === undefined;
}

function signPayload(secret, timestamp, body) {
  const normalizedBody = typeof body === 'string' ? body : JSON.stringify(body);
  const signingInput = `${timestamp}.${normalizedBody}`;
  return `sha256=${crypto.createHmac('sha256', secret).update(signingInput).digest('hex')}`;
}

/**
 * Verify an HMAC-SHA256 signature in a timing-safe manner.
 *
 * Mirrors the `sha256=` prefixed, timestamp-bound scheme documented in
 * docs/webhook-delivery.md and produced by signPayload/queueSubscriptionWebhook.
 *
 * @param {string} secret - The shared webhook secret.
 * @param {string} timestamp - The value from the X-Webhook-Timestamp header.
 * @param {object|string} payload - The parsed JSON payload (or raw body) to verify.
 * @param {string} receivedSignature - The signature received in X-Webhook-Signature.
 * @returns {boolean} true if the signature is valid, false otherwise.
 */
function verifySignature(secret, timestamp, payload, receivedSignature) {
  if (isNil(secret) || isNil(timestamp) || isNil(payload) || isNil(receivedSignature)) {
    return false;
  }

  if (typeof receivedSignature !== 'string') {
    return false;
  }

  const expectedHex = signPayload(secret, timestamp, payload).slice('sha256='.length);
  const receivedHex = receivedSignature.startsWith('sha256=')
    ? receivedSignature.slice('sha256='.length)
    : receivedSignature;

  if (!/^[0-9a-f]+$/i.test(receivedHex) || receivedHex.length !== expectedHex.length) {
    return false;
  }

  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const receivedBuf = Buffer.from(receivedHex, 'hex');
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

async function createSubscription({ url, eventTypes, createdBy }) {
  const subscriptionSecret = generateSecret();
  const subscription = await prisma.webhookSubscription.create({
    data: {
      url: String(url).trim(),
      eventTypes,
      secret: subscriptionSecret,
      createdBy: createdBy ?? null,
      isActive: true,
    },
    select: {
      ...selectSubscriptionFields(),
    },
  });

  return { ...subscription, secret: subscriptionSecret };
}

async function listSubscriptions({ createdBy }) {
  return prisma.webhookSubscription.findMany({
    where: { createdBy },
    orderBy: { createdAt: 'desc' },
    select: selectSubscriptionFields(true),
  });
}

async function deleteSubscription({ id, createdBy }) {
  const deleted = await prisma.webhookSubscription.deleteMany({
    where: { id, createdBy },
  });
  return deleted.count > 0;
}

async function rotateSecret({ id, createdBy }) {
  const newSecret = generateSecret();
  return prisma.webhookSubscription.update({
    where: { id, createdBy },
    data: { secret: newSecret },
    select: {
      id: true,
      secret: true,
    },
  });
}

async function getDeliveryHistory({ subscriptionId, createdBy, page = 1, limit = 30 }) {
  const skip = (page - 1) * limit;
  const [deliveries, total] = await Promise.all([
    prisma.webhookDelivery.findMany({
      where: { subscription: { id: subscriptionId, createdBy } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        eventType: true,
        status: true,
        attempts: true,
        responseCode: true,
        errorMessage: true,
        lastAttemptAt: true,
        createdAt: true,
      },
    }),
    prisma.webhookDelivery.count({
      where: { subscription: { id: subscriptionId, createdBy } },
    }),
  ]);

  return {
    page,
    limit,
    total,
    deliveries,
  };
}

async function queueSubscriptionWebhook(subscription, payload, eventType) {
  const idempotencyKey = buildIdempotencyKey(subscription.id, eventType, payload);

  // Idempotency guard: if a delivery for this logical event already exists,
  // reuse it instead of creating a duplicate effect. This makes retries and
  // concurrent requests collapse onto a single delivery.
  const existing = await prisma.webhookDelivery.findFirst({
    where: {
      subscription: { id: subscription.id },
      eventType,
      idempotencyKey,
    },
    select: { id: true, status: true },
  });

  if (existing) {
    logDedupOutcome(DEDUP_OUTCOMES.DEDUPLICATED, {
      deliveryId: existing.id,
      subscriptionId: subscription.id,
      eventType,
      reason: 'duplicate_delivery',
    });
    return { id: existing.id, status: existing.status, deduplicated: true };
  }

  let delivery;
  try {
    delivery = await prisma.webhookDelivery.create({
      data: {
        subscription: { connect: { id: subscription.id } },
        eventType,
        payload: payload,
        idempotencyKey,
        status: 'pending',
      },
    });
  } catch (error) {
    // Concurrent request won the race and created the delivery first. Treat
    // the unique-constraint violation as a deduplicated outcome.
    if (error && error.code === 'P2002') {
      const winner = await prisma.webhookDelivery.findFirst({
        where: {
          subscription: { id: subscription.id },
          eventType,
          idempotencyKey,
        },
        select: { id: true, status: true },
      });
      logDedupOutcome(DEDUP_OUTCOMES.DEDUPLICATED, {
        deliveryId: winner?.id ?? null,
        subscriptionId: subscription.id,
        eventType,
        reason: 'concurrent_duplicate',
      });
      return { id: winner?.id ?? null, status: winner?.status ?? 'pending', deduplicated: true };
    }
    throw error;
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signedPayload = buildWebhookPayload(
    eventType,
    payload,
    delivery.id,
    new Date().toISOString(),
  );
  const signature = signPayload(subscription.secret, timestamp, signedPayload);
  const headers = {
    'Content-Type': 'application/json',
    [SIGNATURE_HEADER]: signature,
    [TIMESTAMP_HEADER]: timestamp,
    [DELIVERY_ID_HEADER]: delivery.id,
    [EVENT_TYPE_HEADER]: eventType,
  };

  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: { payload: signedPayload },
  });

  try {
    await enqueueWebhookDelivery(delivery.id, subscription.url, signedPayload, headers, {
      attempts: DEFAULT_RETRY_ATTEMPTS,
      backoff: { type: 'exponential', delay: DEFAULT_BACKOFF_DELAY_MS },
    });
  } catch (error) {
    logDedupOutcome(DEDUP_OUTCOMES.FAILED, {
      deliveryId: delivery.id,
      subscriptionId: subscription.id,
      eventType,
      reason: 'enqueue_failed',
    });
    throw error;
  }

  logDedupOutcome(DEDUP_OUTCOMES.DELIVERED, {
    deliveryId: delivery.id,
    subscriptionId: subscription.id,
    eventType,
  });

  return delivery;
}

async function queueEventWebhooks(eventType, payload) {
  const subscriptions = await withTenantScopeBypassed(() =>
    prisma.webhookSubscription.findMany({
      where: { eventTypes: { has: eventType }, isActive: true },
    }),
  );

  if (subscriptions.length === 0) {
    logDedupOutcome(DEDUP_OUTCOMES.DEDUPLICATED, {
      eventType,
      reason: 'no_subscriptions',
    });
    return { queued: 0 };
  }

  const queued = [];
  for (const subscription of subscriptions) {
    const delivery = await queueSubscriptionWebhook(subscription, payload, eventType);
    queued.push({ subscriptionId: subscription.id, deliveryId: delivery.id });
  }

  return { queued: queued.length, deliveries: queued };
}

export {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  DELIVERY_ID_HEADER,
  EVENT_TYPE_HEADER,
  DEDUP_OUTCOMES,
  buildIdempotencyKey,
  buildWebhookPayload,
  createSubscription,
  deleteSubscription,
  getDedupMetrics,
  getDeliveryHistory,
  listSubscriptions,
  queueEventWebhooks,
  queueSubscriptionWebhook,
  resetDedupMetrics,
  rotateSecret,
  signPayload,
  verifySignature,
};
