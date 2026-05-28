import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// Envia token JWT em todas as requisições
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wa_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('wa_token');
      localStorage.removeItem('wa_username');
      localStorage.removeItem('wa_user_id');
      localStorage.removeItem('wa_is_admin');
      window.location.href = '/login';
    }
    const message = error.response?.data?.error || error.message || 'Erro desconhecido';
    return Promise.reject(new Error(message));
  }
);

export default api;
