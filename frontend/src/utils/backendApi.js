import axios from 'axios';

const configuredBackendUrl = import.meta.env.VITE_BACKEND_URL;
const networkBackendUrl = import.meta.env.VITE_API_BASE_URL;
const isLoopbackUrl = value => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(String(value || '').trim());

// Keep the Vite proxy for local development. For a phone or deployed webview,
// never send API calls to its own localhost when a reachable backend URL was
// provided separately.
const productionBackendUrl = isLoopbackUrl(configuredBackendUrl) && networkBackendUrl
  ? networkBackendUrl
  : (configuredBackendUrl || networkBackendUrl || window.location.origin);
const rawBaseUrl = import.meta.env.DEV ? '/api' : productionBackendUrl;
const API_BASE_URL = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl;

const backendApi = axios.create({
  baseURL: API_BASE_URL,
});

// Add a request interceptor to include the auth token if it exists
backendApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('pnp_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default backendApi;
