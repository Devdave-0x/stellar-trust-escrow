import webhookService from '../../services/webhookService.js';
import respond from '../../lib/respond.js';

const MAX_EVENT_TYPES = 20;
const ALLOWED_SCHEMES = ['https:'];

function isValidWebhookUrl(raw) {
  try {
    const parsed = new URL(raw);
    return ALLOWED_SCHEMES.includes(parsed.protocol);
  } catch {
    return false;
  }
}

const subscribe = async (req, res) => {
  try {
    const { url, eventTypes } = req.body;

    if (!url || !isValidWebhookUrl(url)) {
      return respond.error(res, 400, 'VALIDATION_ERROR', 'url must be a valid HTTPS URL');
    }

    if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
      return respond.error(res, 400, 'VALIDATION_ERROR', 'eventTypes must be a non-empty array');
    }

    if (eventTypes.length > MAX_EVENT_TYPES) {
      return respond.error(
        res,
        400,
        'VALIDATION_ERROR',
        `eventTypes may not exceed ${MAX_EVENT_TYPES} entries`,
      );
    }

    const result = await webhookService.createSubscription({
      url,
      eventTypes: eventTypes.slice(0, MAX_EVENT_TYPES),
      createdBy: req.user?.address || null,
    });

    return respond.success(res, result, { created: true });
  } catch (err) {
    return respond.error(res, 500, 'INTERNAL_ERROR', err.message);
  }
};

const listSubscriptions = async (req, res) => {
  try {
    const subscriptions = await webhookService.listSubscriptions({
      createdBy: req.user?.address || null,
    });
    return respond.success(res, subscriptions);
  } catch (err) {
    return respond.error(res, 500, 'INTERNAL_ERROR', err.message);
  }
};

const deleteSubscription = async (req, res) => {
  try {
    const deleted = await webhookService.deleteSubscription({
      id: req.params.id,
      createdBy: req.user?.address || null,
    });

    if (!deleted) {
      return respond.error(res, 404, 'NOT_FOUND', 'Webhook subscription not found');
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
      subscriptionId: req.params.id,
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

export default {
  subscribe,
  listSubscriptions,
  deleteSubscription,
  getDeliveries,
  rotateSecret,
};
