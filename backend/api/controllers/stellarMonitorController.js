/**
 * Stellar Monitor Controller
 *
 * API endpoints for the Stellar transaction monitoring service.
 * All endpoints require authentication and live under /api/v1/stellar-monitor.
 */

import { logControllerError } from '../../config/logger.js';
import {
  recordTransaction,
  getMonitorStatus,
  getRecentTransactions,
} from '../../services/stellarMonitorService.js';

/**
 * GET /api/v1/stellar-monitor/status
 * Returns the current monitoring service status and transaction counts.
 */
const getStatus = async (req, res) => {
  try {
    const status = await getMonitorStatus();
    res.json({ data: status });
  } catch (err) {
    logControllerError('stellarMonitor.getStatus', err, req);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
};

/**
 * POST /api/v1/stellar-monitor/transactions
 * Register a new transaction for monitoring.
 */
const trackTransaction = async (req, res) => {
  try {
    const { txHash, fromAddress, toAddress, amount, memo, escrowId } = req.body;

    if (!txHash || typeof txHash !== 'string') {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'txHash is required' },
      });
    }
    if (!fromAddress || typeof fromAddress !== 'string') {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'fromAddress is required' },
      });
    }

    const record = await recordTransaction({ txHash, fromAddress, toAddress, amount, memo, escrowId });
    res.status(201).json({ data: record });
  } catch (err) {
    logControllerError('stellarMonitor.trackTransaction', err, req);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
};

/**
 * GET /api/v1/stellar-monitor/transactions
 * List recent monitored transactions with optional status filter.
 */
const listTransactions = async (req, res) => {
  try {
    const { status, page, limit } = req.query;
    const result = await getRecentTransactions({ status, page, limit });
    res.json(result);
  } catch (err) {
    logControllerError('stellarMonitor.listTransactions', err, req);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
};

export default {
  getStatus,
  trackTransaction,
  listTransactions,
};
