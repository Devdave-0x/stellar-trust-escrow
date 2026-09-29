import axios from 'axios';
import { getOnlineStatus } from '../network';
import { retryRequest } from './retry';
import { getToken, clearToken } from '../auth/token';
import { parseError } from './errorParser';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  if (!getOnlineStatus()) {
    return Promise.reject({
      message: 'You are offline. Please check your internet connection.',
      isOffline: true,
    });
  }

  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError = parseError(error);

    if (error?.response?.status === 401) {
      clearToken();
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    }

    if (error && typeof error === 'object') {
      error.apiError = apiError;
    }

    return Promise.reject(error);
  },
);

export const requestWithRetry = async (axiosConfig, retries = 3) => {
  return retryRequest(() => api(axiosConfig), retries);
};

export default api;
