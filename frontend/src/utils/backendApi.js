import axios from 'axios';

// Use a relative path to leverage the Vite proxy configured in vite.config.js
const API_BASE_URL = '/api';

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
