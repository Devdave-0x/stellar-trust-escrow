/**
 * Onboarding Controller
 *
 * @module controllers/onboardingController
 */

import prisma from '../../lib/prisma.js';
import onboardingService from '../../services/onboardingService.js';

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

/**
 * GET /api/v1/users/me/onboarding
 */
const getOnboarding = async (req, res) => {
  try {
    const checklist = await onboardingService.getChecklist(req.user.userId);
    res.json(checklist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/v1/users/me/onboarding/progress
 */
const getOnboardingProgress = async (req, res) => {
  try {
    const progress = await onboardingService.getProgress(req.user.userId);
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/v1/users/me/wallet
 * Links a Stellar wallet address to the authenticated user and completes
 * the connect_wallet onboarding step.
 * Body: { address }
 */
const connectWallet = async (req, res) => {
  try {
    const { address } = req.body;
    if (!STELLAR_ADDRESS_RE.test(address ?? '')) {
      return res.status(400).json({ error: 'A valid Stellar address is required.' });
    }

    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: { walletAddress: address },
    });

    await onboardingService.completeStep(req.user.userId, 'connect_wallet');

    res.json({ id: user.id, walletAddress: user.walletAddress });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'This wallet address is already linked to another account.' });
    }
    res.status(500).json({ error: err.message });
  }
};

export default { getOnboarding, getOnboardingProgress, connectWallet };
