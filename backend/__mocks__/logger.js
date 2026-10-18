import { AsyncLocalStorage } from 'node:async_hooks';

const noOpLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export const requestContext = new AsyncLocalStorage();

export const createModuleLogger = () => noOpLogger;

export const getLogger = () => noOpLogger;

export const logger = noOpLogger;

export const logControllerError = () => {};

export const getCorrelationId = () => requestContext.getStore()?.correlationId;

export const withCorrelationId = (correlationId, fn) =>
  requestContext.run({ ...(requestContext.getStore() || {}), correlationId }, fn);

// Deterministic, secret-free log capture for concurrency tests. Each entry
// records the level, message, and any structured metadata so tests can assert
// on ordering and idempotency without depending on real log output.
export const logEntries = [];

const record = (level) => (message, meta) => {
  logEntries.push({
    level,
    message,
    meta: meta && typeof meta === 'object' ? { ...meta } : meta,
    correlationId: requestContext.getStore()?.correlationId,
  });
};

const capturingLogger = {
  debug: record('debug'),
  info: record('info'),
  warn: record('warn'),
  error: record('error'),
};

export const resetLogEntries = () => {
  logEntries.length = 0;
};

export const createCapturingModuleLogger = () => capturingLogger;

export default noOpLogger;
