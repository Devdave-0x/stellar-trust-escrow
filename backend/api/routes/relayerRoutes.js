/**
 * Relayer Routes
 *
 * API endpoints for meta-transaction relaying.
 */

import express from 'express';
import authMiddleware from '../middleware/auth.js';
import { createRelayer } from '../../services/relayerService.js';
import { errorsTotal } from '../../lib/metrics.js';

const router = express.Router();

function getRelayer() {
  if (!process.env.RELAYER_SECRET_KEY) return null;
  return createRelayer({
    network:
      process.env.STELLAR_NETWORK === 'mainnet'
        ? 'Public Global Stellar Network ; September 2015'
        : 'Test SDF Network ; September 2015',
    contractId: process.env.ESCROW_CONTRACT_ID,
    relayerSecret: process.env.RELAYER_SECRET_KEY,
  });
}

/**
 * POST /api/relayer/execute
 * Execute a meta-transaction
 */
router.post('/execute', authMiddleware, async (req, res) => {
  try {
    const relayer = getRelayer();
    if (!relayer) {
      return res.status(503).json({ error: 'Relayer is not configured' });
    }

    const { metaTx, feeDelegation } = req.body;

    if (!metaTx) {
      return res.status(400).json({
        error: 'Meta-transaction data is required',
      });
    }

    const result = await relayer.executeMetaTransaction(metaTx, feeDelegation);

    if (result.success) {
      res.json({
        success: true,
        transactionHash: result.transactionHash,
        ledger: result.ledger,
        nonce: result.metaTxNonce,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        nonce: result.metaTxNonce,
      });
    }
  } catch (error) {
    console.error('Relayer execution error:', error);
    errorsTotal.inc({ type: 'relayer_error', route: '/api/relayer/execute' });

    res.status(500).json({
      error: 'Failed to execute meta-transaction',
      details: error.message,
    });
  }
});

/**
 * GET /api/relayer/fee-estimate
 * Estimate fee for a meta-transaction
 */
router.post('/fee-estimate', authMiddleware, async (req, res) => {
  try {
    const relayer = getRelayer();
    if (!relayer) {
      return res.status(503).json({ error: 'Relayer is not configured' });
    }

    const { metaTx } = req.body;

    if (!metaTx) {
      return res.status(400).json({
        error: 'Meta-transaction data is required',
      });
    }

    const estimatedFee = await relayer.estimateFee(metaTx);

    res.json({
      estimatedFee,
      feeToken: 'XLM',
      unit: 'stroops',
    });
  } catch (error) {
    console.error('Fee estimation error:', error);
    errorsTotal.inc({ type: 'fee_estimation_error', route: '/api/relayer/fee-estimate' });

    res.status(500).json({
      error: 'Failed to estimate fee',
      details: error.message,
    });
  }
});

/**
 * GET /api/relayer/status
 * Get relayer service status
 */
router.get('/status', async (req, res) => {
  const relayer = getRelayer();
  const lastCheckedAt = new Date().toISOString();
  const warningThreshold = Number(process.env.RELAYER_BALANCE_WARNING_XLM || 10);
  const criticalThreshold = Number(process.env.RELAYER_BALANCE_CRITICAL_XLM || 2);
  let balanceXlm = null;
  let balanceError = null;

  if (relayer) {
    const horizonUrl =
      process.env.STELLAR_HORIZON_URL ||
      (process.env.STELLAR_NETWORK === 'mainnet'
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const accountResponse = await fetch(
        `${horizonUrl.replace(/\/$/, '')}/accounts/${relayer.relayerKeypair.publicKey()}`,
        { signal: controller.signal },
      );
      if (!accountResponse.ok) throw new Error(`Horizon returned ${accountResponse.status}`);
      const account = await accountResponse.json();
      const nativeBalance = account.balances?.find((entry) => entry.asset_type === 'native');
      balanceXlm = nativeBalance ? Number(nativeBalance.balance) : 0;
    } catch (error) {
      balanceError = error.name === 'AbortError' ? 'Balance check timed out' : 'Balance unavailable';
    } finally {
      clearTimeout(timeout);
    }
  }

  res.json({
    status: relayer ? 'active' : 'unconfigured',
    network: process.env.STELLAR_NETWORK,
    contractId: process.env.ESCROW_CONTRACT_ID,
    relayerAddress: relayer ? relayer.relayerKeypair.publicKey() : null,
    balanceXlm,
    balanceError,
    thresholds: { warningXlm: warningThreshold, criticalXlm: criticalThreshold },
    lastCheckedAt,
  });
});

export default router;
