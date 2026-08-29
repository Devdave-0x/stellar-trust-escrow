import crypto from 'crypto';

import prisma from '../lib/prisma.js';
import { withTenantScopeBypassed } from '../lib/tenantContext.js';
import { enqueueWebhookDelivery } from '../queues/webhookQueue.js';

const SIGNATURE_HEADER = 'X-Webhook-Signature';
const DELIVERY_ID_HEADER = 'X-Webhook-Delivery-Id';
const EVENT_TYPE_HEADER = 'X-Webhook-Event-Type';

/** Number of retry attempts the delivery queue makes before giving up on a webhook. */
const DEFAULT_RETRY_ATTEMPTS = 5;
/** Base delay (ms) for the exponential backoff between retry attempts. */
const DEFAULT_BACKOFF_DELAY_MS = 5000;
/** Number of random bytes used to generate a subscription's HMAC signing secret. */
const SUBSCRIPTION_SECRET_BYTE_LENGTH = 32;
/** Hash algorithm used to sign outgoing webhook payloads. */
const SIGNATURE_ALGORITHM = 'sha256';
/** Default page number for paginated delivery history queries. */
const DEFAULT_HISTORY_PAGE = 1;
/** Default number of delivery records returned per history page. */
const DEFAULT_HISTORY_PAGE_SIZE = 30;

function buildWebhookPayload(eventType, payload, deliveryId) {
  return {
    eventType,
    deliveryId,
    timestamp: new Date().toISOString(),
    data: payload,
  };
}

function generateSecret() {
  return crypto.randomBytes(SUBSCRIPTION_SECRET_BYTE_LENGTH).toString('hex');
}

function signPayload(secret, payload) {
  return crypto
    .createHmac(SIGNATURE_ALGORITHM, secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

async function createSubscription({ url, eventTypes, createdBy }) {
  const subscriptionSecret = generateSecret();
  const subscription = await prisma.webhookSubscription.create({
    data: {
      url: String(url).trim(),
      eventTypes,
      secret: subscriptionSecret,
      createdBy: createdBy || null,
      isActive: true,
    },
    select: {
      id: true,
      url: true,
      eventTypes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return { ...subscription, secret: subscriptionSecret };
}

async function listSubscriptions({ createdBy }) {
  return prisma.webhookSubscription.findMany({
    where: { createdBy },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      url: true,
      eventTypes: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

async function deleteSubscription({ id, createdBy }) {
  const deleted = await prisma.webhookSubscription.deleteMany({
    where: { id, createdBy },
  });
  return deleted.count > 0;
}

async function getDeliveryHistory({
  subscriptionId,
  createdBy,
  page = DEFAULT_HISTORY_PAGE,
  limit = DEFAULT_HISTORY_PAGE_SIZE,
}) {
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
  const delivery = await prisma.webhookDelivery.create({
    data: {
      subscription: { connect: { id: subscription.id } },
      eventType,
      payload: payload,
      status: 'pending',
    },
  });

  const signedPayload = buildWebhookPayload(eventType, payload, delivery.id);
  const signature = signPayload(subscription.secret, signedPayload);
  const headers = {
    'Content-Type': 'application/json',
    [SIGNATURE_HEADER]: signature,
    [DELIVERY_ID_HEADER]: delivery.id,
    [EVENT_TYPE_HEADER]: eventType,
  };

  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: { payload: signedPayload },
  });

  await enqueueWebhookDelivery(delivery.id, subscription.url, signedPayload, headers, {
    attempts: DEFAULT_RETRY_ATTEMPTS,
    backoff: { type: 'exponential', delay: DEFAULT_BACKOFF_DELAY_MS },
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
  createSubscription,
  listSubscriptions,
  deleteSubscription,
  getDeliveryHistory,
  queueEventWebhooks,
  signPayload,
  buildWebhookPayload,
  SIGNATURE_HEADER,
  DELIVERY_ID_HEADER,
  EVENT_TYPE_HEADER,
  DEFAULT_RETRY_ATTEMPTS,
  DEFAULT_BACKOFF_DELAY_MS,
  SUBSCRIPTION_SECRET_BYTE_LENGTH,
  SIGNATURE_ALGORITHM,
  DEFAULT_HISTORY_PAGE,
  DEFAULT_HISTORY_PAGE_SIZE,
};

export default {
  createSubscription,
  listSubscriptions,
  deleteSubscription,
  getDeliveryHistory,
  queueEventWebhooks,
  signPayload,
};
