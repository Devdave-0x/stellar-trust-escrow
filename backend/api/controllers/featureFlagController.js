import { listFlags, createFlag, updateFlag, deleteFlag } from '../../services/featureFlags.js';

export async function index(req, res) {
  const tenantId = req.query.tenantId || req.tenant?.id || null;
  const flags = await listFlags(tenantId);
  res.json({ data: flags });
}

export async function create(req, res) {
  try {
    const adminId = req.headers['x-admin-api-key'];
    const tenantId = req.body.tenantId || req.tenant?.id || null;
    const flag = await createFlag({ ...req.body, tenantId }, adminId);
    res.status(201).json({ data: flag });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Flag key already exists.' });
    res.status(400).json({ error: err.message });
  }
}

export async function update(req, res) {
  try {
    const key = req.params.key || req.params.name;
    const adminId = req.headers['x-admin-api-key'];
    const flag = await updateFlag(key, req.body, adminId);
    res.json({ data: flag });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Flag not found.' });
    res.status(400).json({ error: err.message });
  }
}

export async function destroy(req, res) {
  try {
    const key = req.params.key || req.params.name;
    const adminId = req.headers['x-admin-api-key'];
    await deleteFlag(key, adminId);
    res.status(204).end();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Flag not found.' });
    res.status(400).json({ error: err.message });
  }
}
