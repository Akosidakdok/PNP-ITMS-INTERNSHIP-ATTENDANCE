import axios from 'axios';

const backendApi = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000',
});

backendApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('pnp_token');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default backendApi;
