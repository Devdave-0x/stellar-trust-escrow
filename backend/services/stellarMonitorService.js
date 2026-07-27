/**
 * StellarMonitorService
 *
 * Subscribes to Horizon's SSE transaction stream for all monitored accounts,
 * reconciles each on-chain transaction against the database, and alerts via
 * Slack / email when a divergence is not resolved within ALERT_WINDOW_MS.
 *
 * ## How it works
 * 1. On startup: reconcile() fetches the last 200 transactions per account
 *    from Horizon and reconciles each one against the DB (catches missed events
 *    during downtime).
 * 2. Streaming: one EventSource per account subscribes from the last-seen cursor
 *    stored in StellarMonitorCursor.  Each transaction is reconciled immediately.
 * 3. Alert timer: every ALERT_CHECK_INTERVAL_MS the service checks
 *    StellarMonitorDivergence rows that are still unresolved and older than
 *    ALERT_WINDOW_MS, then fires a Slack/email notification.
 */

import { Horizon } from '@stellar/stellar-sdk';
import prisma from '../lib/prisma.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('service.stellarMonitor');

// ── Config ────────────────────────────────────────────────────────────────────

const HORIZON_URL =
  process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';

/** Comma-separated Stellar addresses to monitor */
const MONITOR_ACCOUNTS = (process.env.MONITOR_ACCOUNTS || '')
  .split(',')
  .map((a) => a.trim())
  .filter(Boolean);

/** How long (ms) before an unresolved divergence triggers an alert */
const ALERT_WINDOW_MS = parseInt(process.env.MONITOR_ALERT_WINDOW_MS || '300000', 10); // 5 min

/** How often to scan for pending divergences */
const ALERT_CHECK_INTERVAL_MS = parseInt(process.env.MONITOR_ALERT_CHECK_MS || '60000', 10);

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';
const ALERT_EMAIL = process.env.MONITOR_ALERT_EMAIL || '';

// ── Horizon server ────────────────────────────────────────────────────────────

const getServer = () => new Horizon.Server(HORIZON_URL);

// ── Reconciliation helpers ────────────────────────────────────────────────────

/**
 * Derive the "memo" field from a Horizon transaction.
 * Returns null when the memo cannot be parsed.
 */
function parseMemo(tx) {
  if (!tx.memo_type || tx.memo_type === 'none') return null;
  return tx.memo ?? null;
}

/**
 * Decide whether a transaction is relevant to the escrow platform.
 * We look for:
 *  - memo matching our contract ID prefix
 *  - operations that interact with monitored accounts
 *
 * Returns a { relevant, escrowId, eventType } descriptor.
 */
function classify(tx) {
  const memo = parseMemo(tx);
  // Contract operations embed the escrow_id in the memo as "escrow:<id>"
  const escrowMatch = memo?.match(/^escrow:(\d+)(?::(\w+))?$/);
  if (escrowMatch) {
    return {
      relevant: true,
      escrowId: BigInt(escrowMatch[1]),
      eventType: escrowMatch[2] ?? 'unknown',
    };
  }
  return { relevant: false };
}

/**
 * Upsert a divergence row for an on-chain tx that has no matching DB record.
 * If the row already exists (same txHash), this is a no-op to avoid duplicate alerts.
 */
async function recordDivergence(tx, account, eventType) {
  try {
    await prisma.stellarMonitorDivergence.upsert({
      where: { txHash: tx.hash },
      create: {
        txHash: tx.hash,
        account,
        eventType: eventType ?? 'unknown',
        detectedAt: new Date(),
        resolved: false,
      },
      update: {}, // already recorded — don't overwrite detectedAt
    });
    logger.warn({ message: 'divergence_recorded', txHash: tx.hash, account, eventType });
  } catch (err) {
    logger.error({ message: 'divergence_record_error', error: err.message, txHash: tx.hash });
  }
}

/**
 * Check whether the database already has a record matching this transaction.
 * We look in ContractEvent (indexed by txHash) and in the Escrow table when
 * the memo carries a direct escrow reference.
 */
async function isReconciled(tx, escrowId) {
  // Check ContractEvent table first (most events are indexed here)
  const event = await prisma.contractEvent.findFirst({
    where: { txHash: tx.hash },
    select: { id: true },
  });
  if (event) return true;

  // If the tx references a specific escrow, verify the escrow exists
  if (escrowId != null) {
    const escrow = await prisma.escrow.findUnique({
      where: { id: escrowId },
      select: { id: true },
    });
    if (escrow) return true;
  }

  return false;
}

/**
 * Process a single Horizon transaction record:
 * 1. Classify it
 * 2. Check DB
 * 3. Record divergence if missing
 * Returns 'reconciled' | 'divergence' | 'irrelevant'
 */
async function processTransaction(tx, account) {
  const { relevant, escrowId, eventType } = classify(tx);

  if (!relevant) return 'irrelevant';

  const reconciled = await isReconciled(tx, escrowId);

  logger.info({
    message: 'tx_processed',
    txHash: tx.hash,
    account,
    eventType,
    escrowId: escrowId?.toString(),
    outcome: reconciled ? 'reconciled' : 'divergence',
  });

  if (!reconciled) {
    await recordDivergence(tx, account, eventType);
    return 'divergence';
  }
  return 'reconciled';
}

// ── Cursor persistence ────────────────────────────────────────────────────────

async function getCursor(account) {
  const row = await prisma.stellarMonitorCursor.findUnique({ where: { account } });
  return row?.cursor ?? 'now';
}

async function saveCursor(account, cursor) {
  await prisma.stellarMonitorCursor.upsert({
    where: { account },
    create: { account, cursor },
    update: { cursor },
  });
}

// ── Startup reconciliation ────────────────────────────────────────────────────

/**
 * Fetch up to `limit` recent transactions from Horizon for each monitored
 * account and reconcile them against the DB.  Designed to catch events that
 * were missed while the server was offline.
 *
 * @param {string[]} accounts  - Stellar addresses to reconcile
 * @param {number}   limit     - transactions per account (default 200)
 * @returns {Promise<{ processed: number, divergences: number }>}
 */
export async function reconcile(accounts = MONITOR_ACCOUNTS, limit = 200) {
  const server = getServer();
  let processed = 0;
  let divergences = 0;

  for (const account of accounts) {
    try {
      const page = await server
        .transactions()
        .forAccount(account)
        .limit(limit)
        .order('desc')
        .call();

      for (const tx of page.records) {
        const outcome = await processTransaction(tx, account);
        processed++;
        if (outcome === 'divergence') divergences++;
      }

      logger.info({ message: 'startup_reconcile_done', account, processed: page.records.length });
    } catch (err) {
      logger.error({ message: 'startup_reconcile_error', account, error: err.message });
    }
  }

  return { processed, divergences };
}

// ── SSE stream subscriptions ──────────────────────────────────────────────────

/** Active stream handles keyed by account address */
const streams = new Map();

function subscribeAccount(account) {
  if (streams.has(account)) return; // already subscribed

  const server = getServer();

  const startStream = async () => {
    const cursor = await getCursor(account);

    const close = server
      .transactions()
      .forAccount(account)
      .cursor(cursor)
      .stream({
        onmessage: async (tx) => {
          try {
            await processTransaction(tx, account);
            await saveCursor(account, tx.paging_token);
          } catch (err) {
            logger.error({ message: 'stream_processing_error', account, error: err.message });
          }
        },
        onerror: (err) => {
          logger.warn({ message: 'stream_error', account, error: err?.message ?? String(err) });
          // Close and reconnect after a short backoff
          streams.delete(account);
          setTimeout(() => subscribeAccount(account), 5000);
        },
      });

    streams.set(account, close);
    logger.info({ message: 'stream_subscribed', account, cursor });
  };

  startStream().catch((err) => {
    logger.error({ message: 'stream_start_error', account, error: err.message });
    setTimeout(() => subscribeAccount(account), 5000);
  });
}

// ── Divergence alerting ───────────────────────────────────────────────────────

async function sendSlackAlert(message) {
  if (!SLACK_WEBHOOK_URL) return;
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
  } catch (err) {
    logger.error({ message: 'slack_alert_error', error: err.message });
  }
}

async function sendEmailAlert(subject, body) {
  if (!ALERT_EMAIL) return;
  try {
    // Delegate to the email queue if available; otherwise log only.
    const { default: emailService } = await import('./emailService.js');
    await emailService.sendEmail({
      to: ALERT_EMAIL,
      subject,
      text: body,
    });
  } catch (err) {
    logger.error({ message: 'email_alert_error', error: err.message });
  }
}

/**
 * Scan for unresolved divergences older than ALERT_WINDOW_MS and fire alerts.
 */
async function checkDivergences() {
  const threshold = new Date(Date.now() - ALERT_WINDOW_MS);

  const pending = await prisma.stellarMonitorDivergence.findMany({
    where: { resolved: false, detectedAt: { lte: threshold }, alertedAt: null },
  });

  if (pending.length === 0) return;

  const summary = pending
    .map((d) => `• ${d.txHash} (account: ${d.account}, type: ${d.eventType})`)
    .join('\n');

  const message =
    `🚨 *Stellar DB Divergence Alert* — ${pending.length} on-chain transaction(s) ` +
    `have no matching DB record after ${ALERT_WINDOW_MS / 60000} minutes:\n${summary}`;

  logger.warn({ message: 'divergence_alert_fired', count: pending.length });
  await Promise.all([
    sendSlackAlert(message),
    sendEmailAlert(
      `[Stellar Monitor] ${pending.length} unreconciled transaction(s)`,
      message.replace(/[*•]/g, ''),
    ),
  ]);

  // Mark as alerted so we don't re-fire on the next check cycle
  const ids = pending.map((d) => d.id);
  await prisma.stellarMonitorDivergence.updateMany({
    where: { id: { in: ids } },
    data: { alertedAt: new Date() },
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

let alertTimer = null;

/**
 * Start the monitor:
 * 1. Runs startup reconciliation
 * 2. Opens SSE streams for all monitored accounts
 * 3. Starts periodic divergence alert checks
 */
export async function start() {
  if (MONITOR_ACCOUNTS.length === 0) {
    logger.warn({ message: 'monitor_no_accounts', hint: 'Set MONITOR_ACCOUNTS env var' });
    return;
  }

  logger.info({ message: 'monitor_starting', accounts: MONITOR_ACCOUNTS });

  // Startup reconciliation (non-fatal)
  try {
    const result = await reconcile();
    logger.info({ message: 'monitor_startup_reconcile', ...result });
  } catch (err) {
    logger.error({ message: 'monitor_startup_reconcile_error', error: err.message });
  }

  // Subscribe to live streams
  for (const account of MONITOR_ACCOUNTS) {
    subscribeAccount(account);
  }

  // Periodic divergence checks
  alertTimer = setInterval(checkDivergences, ALERT_CHECK_INTERVAL_MS);
  alertTimer.unref?.();

  logger.info({ message: 'monitor_started', accounts: MONITOR_ACCOUNTS.length });
}

/**
 * Stop all streams and timers (for graceful shutdown / testing).
 */
export function stop() {
  for (const [account, close] of streams) {
    try {
      close();
    } catch {
      // ignore
    }
    logger.info({ message: 'stream_closed', account });
  }
  streams.clear();

  if (alertTimer) {
    clearInterval(alertTimer);
    alertTimer = null;
  }
}

export default { start, stop, reconcile };
