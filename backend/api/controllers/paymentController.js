import { getLogger, logControllerError } from '../../config/logger.js';
import { createHash } from 'node:crypto';
import paymentService from '../../services/paymentService.js';
import kycService from '../../services/kycService.js';
import { getAuthenticatedWalletAddress } from '../middleware/authorization.js';
import { paymentCheckoutReplayTotal } from '../../lib/metrics.js';

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const MAX_IDEMPOTENCY_ENTRIES = 1_000;

/** @type {Map<string, { fingerprint: string, promise: Promise<object>, result?: object, expiresAt: number }>} */
const checkoutIdempotency = new Map();

function digest(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function getIdempotencyKey(req) {
  const value = req.get?.('Idempotency-Key') ?? req.headers?.['idempotency-key'];
  return Array.isArray(value) ? undefined : value?.trim();
}

function cleanupExpiredIdempotencyEntries(now = Date.now()) {
  for (const [key, entry] of checkoutIdempotency) {
    // Never expire an in-flight operation: doing so would allow a concurrent
    // retry to create a second Stripe checkout while the first is unresolved.
    if (entry.result && entry.expiresAt <= now) checkoutIdempotency.delete(key);
  }
  // A bounded map prevents arbitrary clients from growing process memory.
  while (checkoutIdempotency.size >= MAX_IDEMPOTENCY_ENTRIES) {
    const completedKey = [...checkoutIdempotency.entries()].find(([, entry]) => entry.result)?.[0];
    if (!completedKey) return false;
    checkoutIdempotency.delete(completedKey);
  }
  return true;
}

function observeCheckoutReplay(outcome, req, correlationId) {
  paymentCheckoutReplayTotal.inc({ outcome });
  getLogger().info({
    message: 'payment.checkout_replay_protection',
    outcome,
    correlationId,
    requestId: req.id,
  });
}

function sendCheckoutResult(res, result, replayed) {
  if (replayed && typeof res.setHeader === 'function') {
    res.setHeader('Idempotent-Replayed', 'true');
  }
  res.json(result);
}

function checkoutError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/** Test-only reset for deterministic concurrent-request coverage. */
export function __resetCheckoutIdempotencyForTest() {
  checkoutIdempotency.clear();
}

function requireOwnedWallet(req, res) {
  const walletAddress = getAuthenticatedWalletAddress(req);
  if (!walletAddress) {
    res.status(403).json({ error: 'Authenticated user is not linked to a wallet address.' });
    return null;
  }

  return walletAddress;
}

/** POST /api/payments/checkout — create a Stripe checkout session. */
const createCheckout = async (req, res) => {
  try {
    const { address, amountUsd, escrowId } = req.body;
    const walletAddress = requireOwnedWallet(req, res);
    if (!walletAddress) return;

    if (!address || !STELLAR_ADDRESS_RE.test(address)) {
      return res.status(400).json({ error: 'Valid Stellar address required' });
    }
    if (address !== walletAddress) {
      return res
        .status(403)
        .json({ error: 'Forbidden: cannot create checkout for another wallet.' });
    }
    if (!amountUsd || typeof amountUsd !== 'number' || amountUsd <= 0) {
      return res.status(400).json({ error: 'amountUsd must be a positive number' });
    }

    const idempotencyKey = getIdempotencyKey(req);
    if (!idempotencyKey || !IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
      observeCheckoutReplay('rejected', req, 'invalid');
      return res.status(400).json({
        error: 'A valid Idempotency-Key header (8-128 URL-safe characters) is required.',
      });
    }

    const fingerprint = digest(`${address}|${amountUsd}|${escrowId ?? ''}`);
    const correlationId = digest(`${walletAddress}|${idempotencyKey}`);
    const entryKey = `${walletAddress}:${idempotencyKey}`;
    const hasCapacity = cleanupExpiredIdempotencyEntries();
    const existing = checkoutIdempotency.get(entryKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        observeCheckoutReplay('conflict', req, correlationId);
        return res.status(409).json({
          error: 'Idempotency-Key was already used for a different checkout request.',
        });
      }
      observeCheckoutReplay(existing.result ? 'replayed' : 'in_flight', req, correlationId);
      const result = existing.result ?? (await existing.promise);
      return sendCheckoutResult(res, result, true);
    }
    if (!hasCapacity) {
      observeCheckoutReplay('rejected', req, correlationId);
      return res.status(503).json({ error: 'Checkout replay protection is at capacity; retry shortly.' });
    }

    // Scope the Stripe key to the authenticated wallet and request fingerprint.
    // The raw caller key is never logged or sent to metrics.
    const stripeIdempotencyKey = `checkout:${digest(`${walletAddress}|${idempotencyKey}|${fingerprint}`)}`;
    const promise = (async () => {
      // KYC is inside the coalesced work so overlapping requests receive the
      // same deterministic result and do not reach payment creation twice.
      const kyc = await kycService.getStatus(address);
      if (kyc?.status !== 'Approved') {
        throw checkoutError(403, 'KYC verification required before funding via fiat');
      }
      return paymentService.createCheckoutSession({
        address,
        amountUsd,
        escrowId,
        idempotencyKey: stripeIdempotencyKey,
      });
    })();
    const entry = { fingerprint, promise, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS };
    checkoutIdempotency.set(entryKey, entry);

    try {
      const result = await promise;
      entry.result = result;
      observeCheckoutReplay('created', req, correlationId);
      return sendCheckoutResult(res, result, false);
    } catch (err) {
      checkoutIdempotency.delete(entryKey);
      observeCheckoutReplay(err.statusCode ? 'rejected' : 'failed', req, correlationId);
      throw err;
    }
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) logControllerError('payment.createCheckout', err, req);
    res.status(status).json({ error: err.message });
  }
};

/** GET /api/payments/status/:sessionId — get payment status by Stripe session ID. */
const getStatus = async (req, res) => {
  try {
    const walletAddress = requireOwnedWallet(req, res);
    if (!walletAddress) return;

    const payment = await paymentService.getBySessionId(req.params.sessionId);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (payment.address !== walletAddress) {
      return res.status(403).json({ error: 'Forbidden: cannot access another wallet payment.' });
    }
    res.json(payment);
  } catch (err) {
    logControllerError('payment.getStatus', err, req);
    res.status(500).json({ error: err.message });
  }
};

/** GET /api/payments/:address — list payments for a Stellar address. */
const listByAddress = async (req, res) => {
  try {
    const { address } = req.params;
    const walletAddress = requireOwnedWallet(req, res);
    if (!walletAddress) return;

    if (!STELLAR_ADDRESS_RE.test(address)) {
      return res.status(400).json({ error: 'Invalid Stellar address' });
    }
    if (address !== walletAddress) {
      return res
        .status(403)
        .json({ error: 'Forbidden: cannot access another wallet payment history.' });
    }
    const payments = await paymentService.getByAddress(address);
    res.json(payments);
  } catch (err) {
    logControllerError('payment.listByAddress', err, req);
    res.status(500).json({ error: err.message });
  }
};

/** POST /api/payments/:paymentId/refund — issue a full refund. */
const refund = async (req, res) => {
  try {
    const walletAddress = requireOwnedWallet(req, res);
    if (!walletAddress) return;

    const existingPayment = await paymentService.getById(req.params.paymentId);
    if (!existingPayment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    if (existingPayment.address !== walletAddress) {
      return res.status(403).json({ error: 'Forbidden: cannot refund another wallet payment.' });
    }

    const payment = await paymentService.refund(req.params.paymentId);
    res.json(payment);
  } catch (err) {
    const status = err.message.startsWith('Cannot refund') ? 400 : 500;
    if (status >= 500) logControllerError('payment.refund', err, req);
    res.status(status).json({ error: err.message });
  }
};

/** POST /api/payments/webhook — Stripe webhook receiver. */
const webhook = async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];
    if (!signature) return res.status(400).json({ error: 'Missing stripe-signature header' });
    await paymentService.handleWebhook(req.rawBody, signature);
    res.json({ ok: true });
  } catch (err) {
    getLogger().warn({
      message: 'payment.webhook_rejected',
      error: err.message,
    });
    res.status(400).json({ error: err.message });
  }
};

export default { createCheckout, getStatus, listByAddress, refund, webhook };
