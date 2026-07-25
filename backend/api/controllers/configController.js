/**
 * System Config Controller (admin)
 *
 * @module controllers/configController
 */

import configService from '../../services/configService.js';

/**
 * GET /api/v1/admin/config
 */
const getAllConfig = async (_req, res) => {
  try {
    const config = await configService.getAll();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * PATCH /api/v1/admin/config/:key
 * Body: { value }
 */
const updateConfig = async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: 'value is required.' });
    }

    const updated = await configService.set(key, value, 'admin');
    res.json(updated);
  } catch (err) {
    if (err.message.startsWith('Unknown config key')) {
      return res.status(404).json({ error: err.message });
    }
    if (err.message.includes('must be a')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
};

export default { getAllConfig, updateConfig };
