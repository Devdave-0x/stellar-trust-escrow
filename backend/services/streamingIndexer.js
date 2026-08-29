/**
 * Streaming Indexer
 *
 * Consumes a live stream of Stellar contract events and applies them to
 * the local read model. Unlike the batch/poll-based indexers, failures
 * here happen mid-stream, so the caller needs enough context in the
 * thrown error to know which event/ledger caused the failure without
 * re-deriving it from logs alone.
 *
 * @module streamingIndexer
 */

class StreamingIndexerError extends Error {
  /**
   * @param {string} message - human-readable, context-rich failure reason
   * @param {object} [context]
   * @param {string} [context.stage] - which pipeline stage failed (e.g. "parse", "apply", "connect")
   * @param {number} [context.ledger] - ledger sequence being processed, if known
   * @param {string} [context.eventId] - the specific event id being processed, if known
   * @param {Error} [context.cause] - underlying error, if any
   */
  constructor(message, context = {}) {
    super(message);
    this.name = 'StreamingIndexerError';
    this.stage = context.stage;
    this.ledger = context.ledger;
    this.eventId = context.eventId;
    if (context.cause) this.cause = context.cause;
  }
}

// Fields that must never be echoed back into a surfaced error message,
// even if they appear on the raw event/response object.
const SENSITIVE_KEYS = new Set(['secret', 'token', 'apiKey', 'authorization', 'signature', 'privateKey']);

/**
 * Strips anything that looks like a secret/token out of an object before
 * it is interpolated into an error message, so a failure never leaks
 * credentials into logs or API responses.
 *
 * @param {object} details
 * @returns {object}
 */
const sanitizeDetails = (details) => {
  const safe = {};
  for (const [key, value] of Object.entries(details ?? {})) {
    if (SENSITIVE_KEYS.has(key)) continue;
    if (/secret|token|key|authorization|password/i.test(key)) continue;
    safe[key] = value;
  }
  return safe;
};

/**
 * Parses a raw streamed event payload into the shape the indexer applies.
 * Throws a StreamingIndexerError with the ledger/event context instead of
 * a bare "Internal error" so the caller can diagnose what failed.
 *
 * @param {object} rawEvent
 * @returns {object} parsed event
 */
const parseStreamEvent = (rawEvent) => {
  if (rawEvent == null) {
    throw new StreamingIndexerError('Streaming indexer received a null/undefined event payload', {
      stage: 'parse',
    });
  }

  try {
    const { id, ledger, type, contractId, topic, value } = rawEvent;
    if (!id || ledger == null) {
      throw new Error(
        `event is missing required fields (id=${id ?? 'undefined'}, ledger=${ledger ?? 'undefined'})`,
      );
    }
    return { id, ledger, type, contractId, topic, value };
  } catch (error) {
    throw new StreamingIndexerError(
      `Failed to parse streamed event at ledger ${rawEvent.ledger ?? 'unknown'}: ${error.message}`,
      { stage: 'parse', ledger: rawEvent.ledger, eventId: rawEvent.id, cause: error },
    );
  }
};

/**
 * Applies a parsed event to the read model. On failure, surfaces the
 * specific event id, ledger, and underlying reason instead of a generic
 * failure so operators/callers can trace the exact cause.
 *
 * @param {object} applyFn - async (event) => void, the actual mutation
 * @param {object} event - parsed event from parseStreamEvent
 */
const applyStreamEvent = async (applyFn, event) => {
  try {
    await applyFn(event);
  } catch (error) {
    const details = sanitizeDetails({ eventId: event.id, ledger: event.ledger, type: event.type });
    throw new StreamingIndexerError(
      `Failed to apply streamed event ${details.eventId} at ledger ${details.ledger} (type=${details.type ?? 'unknown'}): ${error.message}`,
      { stage: 'apply', ledger: event.ledger, eventId: event.id, cause: error },
    );
  }
};

/**
 * Processes a single raw event end-to-end: parse then apply.
 *
 * @param {object} rawEvent
 * @param {(event: object) => Promise<void>} applyFn
 */
const processStreamEvent = async (rawEvent, applyFn) => {
  const event = parseStreamEvent(rawEvent);
  await applyStreamEvent(applyFn, event);
  return event;
};

export { StreamingIndexerError, parseStreamEvent, applyStreamEvent, processStreamEvent, sanitizeDetails };

export default { StreamingIndexerError, parseStreamEvent, applyStreamEvent, processStreamEvent, sanitizeDetails };
