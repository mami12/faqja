import axios from 'axios';

/**
 * The app is served by our backend under /app, so its API lives at /app/api
 * (the backend mounts the same router there - see server/ledger/routes.mjs).
 */
export const apiClient = axios.create({
  baseURL: '/app/api',
});

apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  res => res,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      // the whole app lives under /app, so the login route does too
      if (!window.location.pathname.startsWith('/app/login')) {
        window.location.href = '/app/login';
      }
    }
    return Promise.reject(error);
  }
);
