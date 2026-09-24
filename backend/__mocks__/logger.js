export const createModuleLogger = () => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
});

export const logControllerError = () => {};

export default {
  createModuleLogger,
  logControllerError,
};
