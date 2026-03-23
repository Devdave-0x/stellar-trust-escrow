/**
 * StellarTrustEscrow — Backend Server
 *
 * Express.js REST API server. Serves escrow data indexed from the Stellar
 * blockchain and provides endpoints for the Next.js frontend.
 *
 * @module server
 */

/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-unused-vars */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import responseTime from './middleware/responseTime.js';

import escrowRoutes from './api/routes/escrowRoutes.js';
import userRoutes from './api/routes/userRoutes.js';
import reputationRoutes from './api/routes/reputationRoutes.js';
import disputeRoutes from './api/routes/disputeRoutes.js';
import cache from './lib/cache.js';

// TODO (contributor — easy, Issue #17): Import and start the escrow indexer
// const { startIndexer } = require('./services/escrowIndexer');

const app = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(helmet());
app.use(compression()); // gzip responses
app.use(responseTime);  // X-Response-Time header + slow-request logging
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
    credentials: true,
  }),
);
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting — tuned per route type
const defaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'Too many requests from this IP, please try again later.',
});
// Leaderboard is expensive — tighter limit
const leaderboardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many leaderboard requests, please slow down.',
});
app.use('/api/', defaultLimiter);
app.use('/api/reputation/leaderboard', leaderboardLimiter);

// ── Health Check ──────────────────────────────────────────────────────────────

/**
 * @route GET /health
 * @desc  Basic health check — useful for deployment monitoring
 * @returns {{ status: string, timestamp: string, cache: { size: number } }}
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), cache: { size: cache.size() } });
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/api/escrows', escrowRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reputation', reputationRoutes);
app.use('/api/disputes', disputeRoutes);

// ── 404 Handler ───────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Error Handler ─────────────────────────────────────────────────────────────

/**
 * Global error handler.
 * TODO (contributor — easy, Issue #18): Improve error responses with
 * structured error codes matching the Soroban contract's EscrowError enum.
 */
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    error: err.message || 'Internal server error',
    // TODO: add error code field
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log(`🚀 StellarTrustEscrow API running on port ${PORT}`);
  console.log(`🌐 Network: ${process.env.STELLAR_NETWORK}`);

  // TODO (contributor — Issue #17): Start the indexer
  // try {
  //   await startIndexer();
  //   console.log('📡 Escrow indexer started');
  // } catch (err) {
  //   console.error('Failed to start indexer:', err);
  // }
});

export default app; // for testing
