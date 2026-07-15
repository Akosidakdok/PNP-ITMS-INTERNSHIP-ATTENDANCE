import axios from 'axios';

const rawBaseUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
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
