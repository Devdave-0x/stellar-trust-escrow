/**
 * Onboarding Controller (#216)
 *
 * Handles:
 *   GET /api/v1/users/me/onboarding          → getChecklist
 *   GET /api/v1/users/me/onboarding/progress → getProgress
 */

import onboardingService from '../../services/onboardingService.js';

/**
 * GET /api/v1/users/me/onboarding
 * Returns each onboarding step with completion state and action URL.
 */
const getChecklist = async (req, res) => {
  try {
    const userAddress = req.user?.address;
    const tenantId    = req.tenant?.id ?? req.tenantId;

    if (!userAddress) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }

    const steps = await onboardingService.getChecklist(userAddress, tenantId);
    res.json({ steps });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/v1/users/me/onboarding/progress
 * Returns { total, completed, percentage }.
 */
const getProgress = async (req, res) => {
  try {
    const userAddress = req.user?.address;
    const tenantId    = req.tenant?.id ?? req.tenantId;

    if (!userAddress) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required' });
    }

    const progress = await onboardingService.getProgress(userAddress, tenantId);
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default { getChecklist, getProgress };
