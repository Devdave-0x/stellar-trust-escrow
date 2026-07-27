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
};

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
    const { event, email, data } = job.data;
    const templateFactory = TEMPLATES[event];
    if (!templateFactory) throw new Error(`No template for event: ${event}`);

    const recipient = { email: email.toLowerCase().trim(), name: data.recipientName };
    const dashboardUrl = data.dashboardUrl || `${config.baseUrl}/escrows/${data.escrowId || ''}`;

    const content = templateFactory({ ...data, dashboardUrl })({
      recipient,
      unsubscribeUrl: unsubscribeUrl(recipient.email),
      fromName: config.fromName,
    });

    const result = await deliver(recipient.email, content.subject, content.text, content.html);
    console.log(`[NotificationWorker] Sent ${event} to ${recipient.email}: ${result.messageId}`);
    return result;
  },
  { connection },
);

export default notificationWorker;
