import crypto from 'crypto';
import { Worker } from 'bullmq';
import { connection } from '../queues/index.js';

import disputeRaisedTemplate from '../templates/emails/disputeRaised.js';
import disputeResolvedTemplate from '../templates/emails/disputeResolved.js';
import escrowExpiringTemplate from '../templates/emails/escrowExpiring.js';
import escrowFundedTemplate from '../templates/emails/escrowFunded.js';
import escrowStatusChangedTemplate from '../templates/emails/escrowStatusChanged.js';
import milestoneCompletedTemplate from '../templates/emails/milestoneCompleted.js';
import releaseRequestedTemplate from '../templates/emails/releaseRequested.js';

const TEMPLATES = {
  escrow_funded: escrowFundedTemplate,
  release_requested: releaseRequestedTemplate,
  dispute_raised: disputeRaisedTemplate,
  dispute_resolved: disputeResolvedTemplate,
  escrow_expiring: escrowExpiringTemplate,
  milestone_completed: milestoneCompletedTemplate,
  escrow_status_changed: escrowStatusChangedTemplate,
};

const config = {
  provider: process.env.EMAIL_PROVIDER || 'console',
  fromEmail: process.env.EMAIL_FROM || 'no-reply@stellartrustescrow.local',
  fromName: process.env.EMAIL_FROM_NAME || 'Stellar Trust Escrow',
  resendApiKey: process.env.RESEND_API_KEY || '',
  baseUrl: process.env.EMAIL_BASE_URL || 'http://localhost:4000',
  tenantConcurrencyLimit: parseInt(process.env.NOTIFICATION_TENANT_CONCURRENCY || '5', 10),
  maxRetries: parseInt(process.env.NOTIFICATION_MAX_RETRIES || '3', 10),
};

const tenantConcurrencyTracking = new Map();
const metrics = {
  notifications_queued: 0,
  notifications_delivered: 0,
  notifications_failed: 0,
  notifications_delayed: 0,
  tenant_throttle_count: {},
};

function getTenantConcurrentCount(tenantId) {
  if (!tenantConcurrencyTracking.has(tenantId)) {
    tenantConcurrencyTracking.set(tenantId, 0);
  }
  return tenantConcurrencyTracking.get(tenantId);
}

function incrementTenantConcurrency(tenantId) {
  const current = getTenantConcurrentCount(tenantId);
  tenantConcurrencyTracking.set(tenantId, current + 1);
}

function decrementTenantConcurrency(tenantId) {
  const current = getTenantConcurrentCount(tenantId);
  tenantConcurrencyTracking.set(tenantId, Math.max(0, current - 1));
}

function unsubscribeUrl(email) {
  const token = crypto.createHmac('sha256', process.env.EMAIL_UNSUBSCRIBE_SECRET || 'stellar-trust-escrow-email-secret').update(email).digest('hex');
  return `${config.baseUrl}/api/notifications/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

async function deliver(to, subject, text, html) {
  if (config.provider === 'resend' && config.resendApiKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${config.fromName} <${config.fromEmail}>`, to, subject, text, html }),
    });
    if (!res.ok) throw new Error(`Resend error: ${res.status} ${await res.text()}`);
    const body = await res.json();
    return { provider: 'resend', messageId: body.id };
  }

  // Console fallback (also used when EMAIL_PROVIDER=console)
  console.log('[NotificationWorker] Email delivered (console)', { to, subject });
  return { provider: 'console', messageId: `console-${crypto.randomUUID()}` };
}

const notificationWorker = new Worker(
  'notifications',
  async (job) => {
    const { event, email, data, tenantId } = job.data;
    const templateFactory = TEMPLATES[event];
    if (!templateFactory) throw new Error(`No template for event: ${event}`);

    // Backpressure handling: tenant-level throttling
    const effectiveTenantId = tenantId || 'default';
    const concurrentCount = getTenantConcurrentCount(effectiveTenantId);

    if (concurrentCount >= config.tenantConcurrencyLimit) {
      metrics.tenant_throttle_count[effectiveTenantId] =
        (metrics.tenant_throttle_count[effectiveTenantId] || 0) + 1;
      metrics.notifications_delayed += 1;

      const delayMs = (job.attempt || 1) * 1000;
      throw new Error(`Tenant ${effectiveTenantId} throttled, delaying ${delayMs}ms`);
    }

    incrementTenantConcurrency(effectiveTenantId);

    try {
      const recipient = { email: email.toLowerCase().trim(), name: data.recipientName };
      const dashboardUrl = data.dashboardUrl || `${config.baseUrl}/escrows/${data.escrowId || ''}`;

      const content = templateFactory({ ...data, dashboardUrl })({
        recipient,
        unsubscribeUrl: unsubscribeUrl(recipient.email),
        fromName: config.fromName,
      });

      const result = await deliver(recipient.email, content.subject, content.text, content.html);
      console.log(`[NotificationWorker] Sent ${event} to ${recipient.email}: ${result.messageId}`);

      metrics.notifications_delivered += 1;
      return result;
    } catch (err) {
      const isTransient = err.message.includes('timeout') || err.message.includes('ECONNREFUSED') || err.message.includes('throttled');

      if (isTransient && (job.attempt || 1) < config.maxRetries) {
        metrics.notifications_failed += 1;
        console.warn(`[NotificationWorker] Transient failure for ${email}, will retry:`, err.message);
        throw err;
      }

      metrics.notifications_failed += 1;
      console.error(`[NotificationWorker] Failed to send ${event} to ${email}:`, err.message);
      throw err;
    } finally {
      decrementTenantConcurrency(effectiveTenantId);
    }
  },
  {
    connection,
    defaultJobOptions: {
      attempts: config.maxRetries,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
  },
);

export { notificationWorker, metrics };
export default notificationWorker;
