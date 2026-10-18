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

export const runWithRequestContext = (context, fn) => requestContext.run(context, fn);

export const getRequestContext = () => requestContext.getStore();

export default noOpLogger;
