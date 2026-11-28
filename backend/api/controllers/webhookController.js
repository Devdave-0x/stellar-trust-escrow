import webhookService from '../../services/webhookService.js';
import respond from '../../lib/respond.js';
import { validateWebhookDestination } from '../../lib/webhookUrl.js';

const MAX_EVENTS = 20;
const ALLOWED_SCHEMES = ['https:'];

function isValidWebhookUrl(raw) {
  try {
    const parsed = new URL(raw);
    return ALLOWED_SCHEMES.includes(parsed.protocol);
  } catch {
    return false;
  }
}

function normalizeEvents(body) {
  if (Array.isArray(body.events) && body.events.length > 0) {
    return body.events;
  }
  if (Array.isArray(body.eventTypes) && body.eventTypes.length > 0) {
    return body.eventTypes;
  }
  return null;
}

const createEndpoint = async (req, res) => {
  try {
    const { url } = req.body;
    const events = normalizeEvents(req.body);

    if (!url || !isValidWebhookUrl(url)) {
      return respond.error(res, 400, 'VALIDATION_ERROR', 'url must be a valid HTTPS URL');
    }

    const destination = await validateWebhookDestination(url);
    if (!destination.valid) {
      return respond.error(res, 400, 'VALIDATION_ERROR', `url rejected: ${destination.reason}`);
    }

    if (!events) {
      return res.status(400).json({ error: 'events must be a non-empty array' });
    }

    if (events.length > MAX_EVENTS) {
      return res.status(400).json({ error: `events may not exceed ${MAX_EVENTS} entries` });
    }

    const result = await webhookService.createEndpoint({
      url,
      events: events.slice(0, MAX_EVENTS),
      createdBy: req.user?.address || null,
    });

    return respond.success(res, result, { created: true });
  } catch (err) {
    return respond.error(res, 500, 'INTERNAL_ERROR', err.message);
  }
};

const listEndpoints = async (req, res) => {
  try {
    const endpoints = await webhookService.listEndpoints({
      createdBy: req.user?.address || null,
    });
    res.json({ data: endpoints });
  } catch (err) {
    return respond.error(res, 500, 'INTERNAL_ERROR', err.message);
  }
};

const deleteEndpoint = async (req, res) => {
  try {
    const deleted = await webhookService.deleteEndpoint({
      id: req.params.id,
      createdBy: req.user?.address || null,
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Webhook endpoint not found' });
    }

    return res.status(204).send();
  } catch (err) {
    return respond.error(res, 500, 'INTERNAL_ERROR', err.message);
  }
};

const getDeliveries = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Math.min(Number(req.query.limit || 30), 100);

    const result = await webhookService.getDeliveryHistory({
      endpointId: req.params.id,
      createdBy: req.user?.address || null,
      page,
      limit,
    });

    return res.json(result);
  } catch (err) {
    return respond.error(res, 500, 'INTERNAL_ERROR', err.message);
  }
};

const rotateSecret = async (req, res) => {
  try {
    const subscriptionId = req.params.id || req.body?.id || req.body?.subscriptionId;
    const updated = await webhookService.rotateSecret({
      id: subscriptionId,
      createdBy: req.user?.address || null,
    });

    if (!updated) {
      return respond.error(res, 404, 'NOT_FOUND', 'Webhook subscription not found');
    }

    return respond.success(res, updated);
  } catch (err) {
    // Prisma throws (rather than returning null) when the id/createdBy pair
    // doesn't match an existing row — treat that as a 404, not a 500.
    if (err.code === 'P2025') {
      return respond.error(res, 404, 'NOT_FOUND', 'Webhook subscription not found');
    }
    return respond.error(res, 500, 'INTERNAL_ERROR', err.message);
  }
};

const redeliver = async (req, res) => {
  try {
    const delivery = await webhookService.redeliverDelivery({
      endpointId: req.params.id,
      deliveryId: req.params.deliveryId,
    });

    if (!delivery) {
      return res.status(404).json({ error: 'Dead delivery not found for this endpoint' });
    }

    res.status(202).json({
      data: {
        deliveryId: delivery.id,
        endpointId: delivery.endpointId,
        status: 'pending',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** @deprecated Use createEndpoint — kept for legacy /api/webhooks/subscribe */
const subscribe = createEndpoint;

export default {
  createEndpoint,
  subscribe,
  listEndpoints,
  deleteEndpoint,
  getDeliveries,
  redeliver,
};
