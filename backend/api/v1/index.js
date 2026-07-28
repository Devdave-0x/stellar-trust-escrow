import express from 'express';
import { versioning } from '../middleware/version.js';
import { responseEnvelope } from '../middleware/responseEnvelope.js';

import disputeRoutes from '../routes/disputeRoutes.js';
import escrowRoutes from '../routes/escrowRoutes.js';
import eventRoutes from '../routes/eventRoutes.js';
import kycRoutes from '../routes/kycRoutes.js';
import notificationRoutes from '../routes/notificationRoutes.js';
import paymentRoutes from '../routes/paymentRoutes.js';
import reputationRoutes from '../routes/reputationRoutes.js';
import userRoutes from '../routes/userRoutes.js';
import auditRoutes from '../routes/auditRoutes.js';
import complianceRoutes from '../routes/complianceRoutes.js';
import stellarMonitorRoutes from '../routes/stellarMonitorRoutes.js';
import batchRoutes from '../routes/batchRoutes.js';

const router = express.Router();

// Apply v1 versioning to all routes in this router
router.use(versioning('v1'));

// Standardise every JSON response from /api/v1/* into the consistent envelope:
//   success → { data, meta: { requestId, timestamp, version } }
//   error   → { error: { code, message } }
router.use(responseEnvelope);

router.use('/escrows', escrowRoutes);
router.use('/users', userRoutes);
router.use('/reputation', reputationRoutes);
router.use('/disputes', disputeRoutes);
router.use('/notifications', notificationRoutes);
router.use('/events', eventRoutes);
router.use('/kyc', kycRoutes);
router.use('/payments', paymentRoutes);
router.use('/audit', auditRoutes);
router.use('/compliance', complianceRoutes);
router.use('/stellar-monitor', stellarMonitorRoutes);

// Batch operations — execute multiple /api/v1/* requests in a single call.
// Auth is inherited from the parent request and propagated to each sub-request.
router.use('/batch', batchRoutes);

export default router;
