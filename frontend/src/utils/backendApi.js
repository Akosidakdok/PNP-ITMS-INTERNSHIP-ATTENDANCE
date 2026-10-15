import axios from 'axios';

const configuredBackendUrl = import.meta.env.VITE_BACKEND_URL;
const networkBackendUrl = import.meta.env.VITE_API_BASE_URL;
const isLoopbackUrl = value => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(String(value || '').trim());

// Keep the Vite proxy for local development. For a phone or deployed webview,
// never send API calls to its own localhost when a reachable backend URL was
// provided separately.
const DEFAULT_PRODUCTION_BACKEND = 'https://pnp-itms-backend.onrender.com';
const productionBackendUrl = isLoopbackUrl(configuredBackendUrl) && networkBackendUrl
  ? networkBackendUrl
  : (configuredBackendUrl || networkBackendUrl || DEFAULT_PRODUCTION_BACKEND);
const rawBaseUrl = import.meta.env.DEV ? '/api' : productionBackendUrl;
const API_BASE_URL = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
const ACCESS_KEY = 'pnp_token';
const REFRESH_KEY = 'pnp_refresh_token';

const backendApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

export function hasSavedSession() {
  return Boolean(localStorage.getItem(ACCESS_KEY) || localStorage.getItem(REFRESH_KEY));
}

export function saveSession({ token, refresh_token }) {
  if (refresh_token) localStorage.setItem(REFRESH_KEY, refresh_token);
  if (token) localStorage.setItem(ACCESS_KEY, token);
}

export function clearSession() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  window.dispatchEvent(new Event('pnp-session-ended'));
}

function expiresSoon(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return !payload.exp || payload.exp * 1000 <= Date.now() + 60_000;
  } catch {
    return true;
  }
}

let refreshPromise;

export function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return Promise.reject(new Error('No saved session'));

  refreshPromise = axios.post(`${API_BASE_URL}/auth/refresh`, {
    refresh_token: refreshToken,
  }, { timeout: 15000 })
    .then(({ data }) => {
      if (!data?.token) throw new Error('Refresh response was missing a token');
      if (localStorage.getItem(REFRESH_KEY) !== refreshToken) {
        throw new Error('Session changed during refresh');
      }
      saveSession(data);
      return data.token;
    })
    .catch(error => {
      if ([401, 403].includes(error.response?.status)
        && localStorage.getItem(REFRESH_KEY) === refreshToken) {
        clearSession();
      }
      throw error;
    })
    .finally(() => { refreshPromise = null; });
  return refreshPromise;
}

const isAuthRequest = url => /^\/auth\/(login|refresh|logout)(?:\?|$)/.test(String(url || ''));

backendApi.interceptors.request.use(async config => {
  if (isAuthRequest(config.url)) return config;
  let token = localStorage.getItem(ACCESS_KEY);
  if ((!token || expiresSoon(token)) && localStorage.getItem(REFRESH_KEY)) {
    token = await refreshAccessToken();
  }
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

backendApi.interceptors.response.use(undefined, async error => {
  const config = error.config;
  if (error.response?.status !== 401 || !config || isAuthRequest(config.url)) {
    return Promise.reject(error);
  }
  if (config._sessionRetry) {
    clearSession();
    return Promise.reject(error);
  }
  config._sessionRetry = true;
  if (!localStorage.getItem(REFRESH_KEY)) {
    clearSession();
    return Promise.reject(error);
  }
  try {
    const token = await refreshAccessToken();
    config.headers.Authorization = `Bearer ${token}`;
    return backendApi(config);
  } catch (refreshError) {
    return Promise.reject(refreshError);
  }
});

export async function revokeSavedSession() {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  clearSession();
  if (!refreshToken) return;
  try {
    await axios.post(`${API_BASE_URL}/auth/logout`, { refresh_token: refreshToken }, { timeout: 5000 });
  } catch {
    // Local sign-out still succeeds when the device is offline.
  }
}

export default backendApi;
