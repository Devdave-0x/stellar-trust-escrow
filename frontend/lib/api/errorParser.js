export const ERROR_CODES = Object.freeze({
  OFFLINE: 'OFFLINE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
});

const STATUS_DEFAULTS = {
  400: {
    code: ERROR_CODES.VALIDATION_ERROR,
    message: 'Please check the submitted information and try again.',
  },
  401: {
    code: ERROR_CODES.UNAUTHORIZED,
    message: 'You are not authorized. Please login.',
  },
  403: {
    code: ERROR_CODES.FORBIDDEN,
    message: 'Access forbidden.',
  },
  404: {
    code: ERROR_CODES.NOT_FOUND,
    message: 'Requested resource not found.',
  },
  422: {
    code: ERROR_CODES.VALIDATION_ERROR,
    message: 'Please check the submitted information and try again.',
  },
  429: {
    code: ERROR_CODES.RATE_LIMITED,
    message: 'Too many requests. Please try again later.',
  },
};

function extractEnvelope(data) {
  if (!data || typeof data !== 'object') return {};

  if (data.error && typeof data.error === 'object') {
    return {
      message: data.error.message,
      code: data.error.code,
      details: data.error.details,
    };
  }

  return {
    message:
      typeof data.error === 'string'
        ? data.error
        : typeof data.message === 'string'
          ? data.message
          : undefined,
    code: data.code,
    details: data.details,
  };
}

export const parseError = (error) => {
  if (error?.apiError?.message && error?.apiError?.code) {
    return error.apiError;
  }

  if (error?.isOffline) {
    return {
      message: 'You are offline. Please check your internet connection.',
      code: ERROR_CODES.OFFLINE,
      status: null,
      details: undefined,
    };
  }

  if (error?.response) {
    const { status, data } = error.response;
    const envelope = extractEnvelope(data);
    const fallback =
      STATUS_DEFAULTS[status] ||
      (status >= 500
        ? {
            code: ERROR_CODES.SERVER_ERROR,
            message: 'Server is currently unavailable. Please try again later.',
          }
        : {
            code: ERROR_CODES.UNKNOWN_ERROR,
            message: 'Something went wrong. Please try again.',
          });

    return {
      message: envelope.message || fallback.message,
      code: envelope.code || fallback.code,
      status,
      details: envelope.details,
    };
  }

  if (error?.request) {
    return {
      message: 'No response from server. Please check your connection.',
      code: ERROR_CODES.NETWORK_ERROR,
      status: null,
      details: undefined,
    };
  }

  if (error?.message) {
    return {
      message: error.message,
      code: error.code || ERROR_CODES.UNKNOWN_ERROR,
      status: null,
      details: undefined,
    };
  }

  return {
    message: 'An unknown error occurred.',
    code: ERROR_CODES.UNKNOWN_ERROR,
    status: null,
    details: undefined,
  };
};

export const getErrorMessage = (error) => parseError(error).message;
