/**
 * Audit Middleware
 *
 * Automatically logs authentication events and HTTP state-change requests
 * (POST / PATCH / PUT / DELETE) after the response is sent.
 * Also writes escrow-specific state transitions to the EscrowAuditLog table
 * for routes that match known escrow state-change patterns.
 *
 * Usage:
 *   import auditMiddleware from '../middleware/audit.js';
 *   app.use(auditMiddleware);
 *
 * @module middleware/audit
 */

import auditService, { AuditCategory, AuditAction } from '../../services/auditService.js';
import { logTransition, EscrowAuditAction } from '../../services/escrowAuditService.js';

// Map route patterns to audit metadata so we can enrich log entries.
const ROUTE_MAP = [
    category: AuditCategory.AUTH,
    action: AuditAction.LOGOUT,
  },
  // Escrow
  {
    method: 'POST',
    pattern: /\/api\/escrows$/,
    category: AuditCategory.ESCROW,
    action: AuditAction.CREATE_ESCROW,
  },
  {
    method: 'PATCH',
    pattern: /\/api\/escrows\/[^/]+\/cancel/,
    category: AuditCategory.ESCROW,
    action: AuditAction.CANCEL_ESCROW,
  },
  // Milestones
  {
    method: 'POST',
    pattern: /\/api\/escrows\/[^/]+\/milestones$/,
    category: AuditCategory.MILESTONE,
    action: AuditAction.ADD_MILESTONE,
  },
  {
    method: 'POST',
    pattern: /\/milestones\/[^/]+\/submit/,
    category: AuditCategory.MILESTONE,
    action: AuditAction.SUBMIT_MILESTONE,
  },
  {
    method: 'POST',
    pattern: /\/milestones\/[^/]+\/approve/,
    category: AuditCategory.MILESTONE,
    action: AuditAction.APPROVE_MILESTONE,
  },
  {
    method: 'POST',
    pattern: /\/milestones\/[^/]+\/reject/,
    category: AuditCategory.MILESTONE,
    action: AuditAction.REJECT_MILESTONE,
  },
  // Disputes
  {
    method: 'POST',
    pattern: /\/api\/disputes$/,
    category: AuditCategory.DISPUTE,
    action: AuditAction.RAISE_DISPUTE,
  },
  {
    method: 'POST',
    pattern: /\/api\/disputes\/[^/]+\/resolve/,
    category: AuditCategory.DISPUTE,
    action: AuditAction.RESOLVE_DISPUTE,
  },
  // Admin
  {
    method: 'POST',
    pattern: /\/api\/admin\/users\/[^/]+\/suspend/,
    category: AuditCategory.ADMIN,
    action: AuditAction.SUSPEND_USER,
  },
  {
    method: 'POST',
    pattern: /\/api\/admin\/users\/[^/]+\/ban/,
    category: AuditCategory.ADMIN,
    action: AuditAction.BAN_USER,
  },
  {
    method: 'PATCH',
    pattern: /\/api\/admin\/settings/,
    category: AuditCategory.ADMIN,
    action: AuditAction.UPDATE_SETTINGS,
  },
  // Payments
  {
    method: 'POST',
    pattern: /\/api\/payments\/checkout/,
    category: AuditCategory.PAYMENT,
    action: AuditAction.PAYMENT_INITIATED,
  },
  {
    method: 'POST',
    pattern: /\/api\/payments\/[^/]+\/refund/,
    category: AuditCategory.PAYMENT,
    action: AuditAction.PAYMENT_REFUNDED,
  },
  // KYC
  {
    method: 'POST',
    pattern: /\/api\/kyc\/init/,
    category: AuditCategory.KYC,
    action: AuditAction.KYC_SUBMITTED,
  },
];

// Map route patterns to escrow audit transition context.
// These supplement the general ROUTE_MAP for escrow-specific state changes.
const ESCROW_TRANSITION_MAP = [
  {
    method: 'POST',
    pattern: /\/api\/escrows\/broadcast/,
    action: EscrowAuditAction.CREATE,
    fromState: null,
    toState: 'Active',
  },
  {
    method: 'PATCH',
    pattern: /\/api\/escrows\/([^/]+)\/cancel/,
    action: EscrowAuditAction.CANCEL,
    fromState: 'Active',
    toState: 'Cancelled',
    escrowIdGroup: 1,
  },
  {
    method: 'POST',
    pattern: /\/api\/disputes$/,
    action: EscrowAuditAction.RAISE_DISPUTE,
    fromState: 'Active',
    toState: 'Disputed',
  },
  {
    method: 'POST',
    pattern: /\/api\/disputes\/([^/]+)\/resolve/,
    action: EscrowAuditAction.RESOLVE_DISPUTE,
    fromState: 'Disputed',
    toState: 'Completed',
    escrowIdGroup: 1,
  },
  {
    method: 'POST',
    pattern: /\/milestones\/([^/]+)\/approve/,
    action: EscrowAuditAction.MILESTONE_APPROVED,
    fromState: null,
    toState: 'Active',
  },
];
/**
 * Derive the actor from the request.
 * Prefers JWT-populated req.user.address, falls back to body/param or "anonymous".
 */
function resolveActor(req) {
  // JWT auth populates req.user.address
  if (req.user?.address) return req.user.address;
  // Admin routes use the API key header
  if (req.headers['x-admin-api-key']) return 'admin';
  // Stellar address passed as a body or param field
  return req.body?.address || req.params?.address || 'anonymous';
}

/**
 * Extract a resource identifier from the request.
 */
function resolveResourceId(req) {
  return (
    req.params?.id || req.params?.address || req.params?.escrowId || req.body?.escrowId || null
  );
}

/**
 * Extract the escrow ID from a request, consulting body fields and the matched
 * escrowIdGroup capture if the route pattern captures it.
 */
function resolveEscrowId(req, transitionMatch) {
  if (transitionMatch?.escrowIdGroup) {
    const m = req.path.match(transitionMatch.pattern);
    if (m?.[transitionMatch.escrowIdGroup]) return m[transitionMatch.escrowIdGroup];
  }
  return (
    req.params?.escrowId ||
    req.params?.id ||
    req.body?.escrowId ||
    null
  );
}

const auditMiddleware = (req, res, next) => {
  const match = ROUTE_MAP.find((r) => r.method === req.method && r.pattern.test(req.path));
  const transitionMatch = ESCROW_TRANSITION_MAP.find(
    (r) => r.method === req.method && r.pattern.test(req.path),
  );

  if (!match && !transitionMatch) return next();

  // Intercept res.json to capture response status after it's sent
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    originalJson(body);

    const actor = resolveActor(req);
    const statusCode = res.statusCode;
    const successResponse = statusCode >= 200 && statusCode < 300;

    // General audit log entry
    if (match) {
      auditService.log({
        category: match.category,
        action: match.action,
        actor,
        resourceId: resolveResourceId(req),
        metadata: statusCode >= 400 ? { error: body?.error } : undefined,
        statusCode,
        ipAddress: req.ip,
      });
    }

    // Escrow state transition entry (append-only audit trail)
    if (transitionMatch && successResponse) {
      const escrowId = resolveEscrowId(req, transitionMatch);
      if (escrowId) {
        logTransition({
          escrowId,
          tenantId: req.tenant?.id ?? 'unknown',
          actorId: actor,
          actorIp: req.ip || null,
          action: transitionMatch.action,
          fromState: transitionMatch.fromState,
          toState: transitionMatch.toState,
          metadata: {
            path: req.path,
            method: req.method,
            statusCode,
          },
        }).catch(() => {/* fire-and-forget, logTransition never throws */});
      }
    }

    return res;
  };

  next();
};

export default auditMiddleware;
