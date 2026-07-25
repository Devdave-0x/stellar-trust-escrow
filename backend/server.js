import 'dotenv/config';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import adminRoutes from './api/routes/adminRoutes.js';
import attachmentRoutes from './api/routes/attachmentRoutes.js';
import disputeRoutes from './api/routes/disputeRoutes.js';
import escrowRoutes from './api/routes/escrowRoutes.js';
import notificationRoutes from './api/routes/notificationRoutes.js';
import reputationRoutes from './api/routes/reputationRoutes.js';
import tenantRoutes from './api/routes/tenantRoutes.js';
import userRoutes from './api/routes/userRoutes.js';
import apiUsageCounter from './api/middleware/apiUsageCounter.js';
import resolveTenant from './api/middleware/resolveTenant.js';
import cache from './lib/cache.js';
import { scheduleUsageCounterReset } from './lib/jobs/resetUsageCounters.js';
import responseTime from './middleware/responseTime.js';
import emailService from './services/emailService.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(compression());
app.use(responseTime);
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
    credentials: true,
  }),
);
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const defaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'Too many requests from this IP, please try again later.',
});

const leaderboardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many leaderboard requests, please slow down.',
});

app.use('/api/', defaultLimiter);
app.use('/api/reputation/leaderboard', leaderboardLimiter);

// Tenant usage tracking: resolves req.tenant from x-tenant-id (if present)
// and increments its monthly API-call counter. Non-blocking for requests
// with no tenant header.
app.use('/api/', resolveTenant);
app.use('/api/', apiUsageCounter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), cache: { size: cache.size() } });
});

app.use('/api/escrows', escrowRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reputation', reputationRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', attachmentRoutes);
app.use('/api/tenants', tenantRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express requires a 4-arg signature to recognize this as an error handler
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    error: err.message || 'Internal server error',
  });
});

app.listen(PORT, async () => {
  console.log(`API running on port ${PORT}`);
  console.log(`Network: ${process.env.STELLAR_NETWORK}`);
  await emailService.start();
  console.log('[EmailService] Queue processor started');
  scheduleUsageCounterReset();
  console.log('[UsageCounters] Monthly reset job scheduled');
});

export default app;
