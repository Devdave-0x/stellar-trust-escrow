/**
 * System Controller
 *
 * Admin-facing operational endpoints (shutdown/drain state, etc.).
 */

import respond from '../../lib/respond.js';
import { getShutdownState } from '../../lib/gracefulShutdown.js';
import prisma from '../../lib/prisma.js';
import cache from '../../lib/cache.js';

async function checkDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

async function checkCacheReadiness() {
  try {
    const stats = cache.analytics?.() ?? { backend: 'memory' };
    return { status: 'ok', backend: stats.backend ?? 'unknown' };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

async function checkIndexerReadiness() {
  try {
    await prisma.indexerState.findFirst({ select: { id: true, lastProcessedLedger: true } });
    return { status: 'ok' };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

async function getDependencyReadiness() {
  const [api, db, cacheStatus, indexer] = await Promise.all([
    Promise.resolve({ status: getShutdownState().status === 'running' ? 'ok' : 'draining' }),
    checkDatabase(),
    checkCacheReadiness(),
    checkIndexerReadiness(),
  ]);
  const components = { api, database: db, cache: cacheStatus, indexer };
  const ready = Object.values(components).every((c) => c.status === 'ok');
  return { ready, components };
}

function getShutdownStatus(req, res) {
  return respond.success(res, getShutdownState());
}

async function getReadiness(req, res) {
  const report = await getDependencyReadiness();
  const status = report.ready ? 200 : 503;
  return res.status(status).json({ status: report.ready ? 'ready' : 'not_ready', components: report.components });
}

export default { getShutdownStatus, getReadiness, getDependencyReadiness };
