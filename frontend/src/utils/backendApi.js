import axios from 'axios';

// Determine the base URL for the API.
// During development, it will use the VITE_API_BASE_URL from your .env file.
// In a production build, it defaults to the same origin, which is common for deployments.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || window.location.origin;

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
