/**
 * Stellar Transaction Monitoring Service
 *
 * Monitors pending Stellar transactions in real-time, tracks their lifecycle
 * (pending → success/failed/timeout), and provides observability into the
 * Stellar network transaction pipeline.
 *
 * Features:
 *   - Polls for pending transactions via Stellar SDK
 *   - Tracks transaction status transitions in DB (TransactionStatus model)
 *   - Alerts on failed or stuck transactions
 *   - Provides metrics for dashboard consumption
 *   - Configurable polling interval and batch size
 */

import prisma from '../lib/prisma.js';
import { createModuleLogger } from '../config/logger.js';
import { getLatestLedger } from './stellarService.js';

const log = createModuleLogger('stellarMonitor');

const POLL_INTERVAL_MS = parseInt(process.env.STELLAR_MONITOR_POLL_MS || '10000', 10);
const BATCH_SIZE = parseInt(process.env.STELLAR_MONITOR_BATCH_SIZE || '50', 10);
const STUCK_THRESHOLD_MS = parseInt(process.env.STELLAR_MONITOR_STUCK_MS || '60000', 10);

let monitorTimer = null;
let isRunning = false;

/**
 * Transaction status constants
 */
export const TxStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  FAILED: 'FAILED',
  TIMEOUT: 'TIMEOUT',
};

/**
 * Record a new transaction to monitor.
 *
 * @param {object} opts
 * @param {string} opts.txHash — Stellar transaction hash
 * @param {string} opts.fromAddress — sender address
 * @param {string} [opts.toAddress] — recipient address
 * @param {string} [opts.amount] — amount in stroops or human-readable
 * @param {string} [opts.memo] — transaction memo
 * @param {string} [opts.escrowId] — associated escrow ID
 * @returns {Promise<object>} created monitor record
 */
export async function recordTransaction({ txHash, fromAddress, toAddress, amount, memo, escrowId }) {
  const existing = await prisma.transactionMonitor.findUnique({
    where: { txHash },
  }).catch(() => null);

  if (existing) {
    log.warn({ message: 'tx_already_tracked', txHash });
    return existing;
  }

  const record = await prisma.transactionMonitor.create({
    data: {
      txHash,
      fromAddress,
      toAddress: toAddress ?? null,
      amount: amount ?? null,
      memo: memo ?? null,
      escrowId: escrowId ?? null,
      status: TxStatus.PENDING,
      submittedAt: new Date(),
      lastCheckedAt: new Date(),
    },
  });

  log.info({ message: 'tx_recorded', txHash, fromAddress });
  return record;
}

/**
 * Check the status of a single transaction on the Stellar network.
 *
 * @param {string} txHash
 * @returns {Promise<{ status: string, ledger?: number, resultCode?: string }>}
 */
export async function checkTransactionStatus(txHash) {
  try {
    const { SorobanRpc, Transaction } = await import('@stellar/stellar-sdk');
    const RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
    const NETWORK = process.env.STELLAR_NETWORK || 'testnet';
    const { Networks } = await import('@stellar/stellar-sdk');
    const passphrase = NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

    const server = new SorobanRpc.Server(RPC_URL, { allowHttp: RPC_URL.startsWith('http://') });
    const result = await server.getTransaction(txHash);

    if (result.status === 'NOT_FOUND') {
      return { status: TxStatus.PENDING };
    }

    if (result.status === 'SUCCESS') {
      return {
        status: TxStatus.CONFIRMED,
        ledger: result.ledger,
      };
    }

    return {
      status: TxStatus.FAILED,
      resultCode: result.resultCode || result.existingTransactionHash || 'UNKNOWN',
    };
  } catch (err) {
    log.error({
      message: 'tx_check_error',
      txHash,
      error: err.message,
    });
    return { status: TxStatus.PENDING };
  }
}

/**
 * Poll pending transactions and update their statuses.
 *
 * @param {object} [opts]
 * @param {number} [opts.batchSize]
 * @returns {Promise<{ checked: number, confirmed: number, failed: number, stuck: number }>}
 */
export async function pollPendingTransactions({ batchSize = BATCH_SIZE } = {}) {
  const results = { checked: 0, confirmed: 0, failed: 0, stuck: 0 };

  try {
    const pendingTxs = await prisma.transactionMonitor.findMany({
      where: { status: TxStatus.PENDING },
      orderBy: { submittedAt: 'asc' },
      take: batchSize,
    });

    results.checked = pendingTxs.length;

    if (pendingTxs.length === 0) return results;

    log.info({ message: 'poll_start', count: pendingTxs.length });

    for (const tx of pendingTxs) {
      const txResult = await checkTransactionStatus(tx.txHash);
      const now = new Date();
      const elapsed = now.getTime() - tx.submittedAt.getTime();

      if (txResult.status === TxStatus.CONFIRMED) {
        await prisma.transactionMonitor.update({
          where: { txHash: tx.txHash },
          data: {
            status: TxStatus.CONFIRMED,
            confirmedAt: now,
            ledger: txResult.ledger ? BigInt(txResult.ledger) : null,
            lastCheckedAt: now,
          },
        });
        results.confirmed++;
        log.info({ message: 'tx_confirmed', txHash: tx.txHash, ledger: txResult.ledger });
      } else if (txResult.status === TxStatus.FAILED) {
        await prisma.transactionMonitor.update({
          where: { txHash: tx.txHash },
          data: {
            status: TxStatus.FAILED,
            failedAt: now,
            errorCode: txResult.resultCode,
            lastCheckedAt: now,
          },
        });
        results.failed++;
        log.warn({ message: 'tx_failed', txHash: tx.txHash, resultCode: txResult.resultCode });
      } else if (elapsed > STUCK_THRESHOLD_MS) {
        await prisma.transactionMonitor.update({
          where: { txHash: tx.txHash },
          data: {
            status: TxStatus.TIMEOUT,
            failedAt: now,
            errorCode: 'POLL_TIMEOUT',
            lastCheckedAt: now,
          },
        });
        results.stuck++;
        log.warn({ message: 'tx_stuck_timeout', txHash: tx.txHash, elapsedMs: elapsed });
      } else {
        await prisma.transactionMonitor.update({
          where: { txHash: tx.txHash },
          data: { lastCheckedAt: now },
        });
      }
    }

    log.info({
      message: 'poll_complete',
      ...results,
    });

    return results;
  } catch (err) {
    log.error({
      message: 'poll_error',
      error: err.message,
      stack: err.stack,
    });
    throw err;
  }
}

/**
 * Get monitoring status summary.
 */
export async function getMonitorStatus() {
  const [total, pending, confirmed, failed, timeout] = await Promise.all([
    prisma.transactionMonitor.count(),
    prisma.transactionMonitor.count({ where: { status: TxStatus.PENDING } }),
    prisma.transactionMonitor.count({ where: { status: TxStatus.CONFIRMED } }),
    prisma.transactionMonitor.count({ where: { status: TxStatus.FAILED } }),
    prisma.transactionMonitor.count({ where: { status: TxStatus.TIMEOUT } }),
  ]);

  return {
    active: isRunning,
    pollIntervalMs: POLL_INTERVAL_MS,
    stuckThresholdMs: STUCK_THRESHOLD_MS,
    totals: { total, pending, confirmed, failed, timeout },
  };
}

/**
 * Get recent transactions with optional status filter.
 */
export async function getRecentTransactions({ status, page = 1, limit = 20 } = {}) {
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pg - 1) * lim;

  const where = {};
  if (status) where.status = status;

  const [data, total] = await prisma.$transaction([
    prisma.transactionMonitor.findMany({
      where,
      skip,
      take: lim,
      orderBy: { submittedAt: 'desc' },
    }),
    prisma.transactionMonitor.count({ where }),
  ]);

  return {
    data,
    page: pg,
    limit: lim,
    total,
    totalPages: Math.ceil(total / lim),
    hasNextPage: pg * lim < total,
    hasPreviousPage: pg > 1,
  };
}

/**
 * Start the background monitoring loop.
 */
export function startMonitor({ pollIntervalMs = POLL_INTERVAL_MS } = {}) {
  if (monitorTimer) {
    log.warn({ message: 'monitor_already_running' });
    return;
  }

  isRunning = true;
  log.info({ message: 'monitor_started', pollIntervalMs });

  const tick = async () => {
    try {
      await pollPendingTransactions();
    } catch (err) {
      log.error({
        message: 'monitor_tick_error',
        error: err.message,
      });
    }
  };

  tick();
  monitorTimer = setInterval(tick, pollIntervalMs);
  monitorTimer.unref?.();
}

/**
 * Stop the background monitoring loop.
 */
export function stopMonitor() {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
    isRunning = false;
    log.info({ message: 'monitor_stopped' });
  }
}

export default {
  TxStatus,
  recordTransaction,
  checkTransactionStatus,
  pollPendingTransactions,
  getMonitorStatus,
  getRecentTransactions,
  startMonitor,
  stopMonitor,
};
