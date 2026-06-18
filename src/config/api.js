import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Use the local IP that works for physical devices
export const API_BASE_URL = 'http://192.168.1.11:5245';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  async (config) => {
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error fetching token for request', error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// We can also add a response interceptor for token refresh logic later
api.interceptors.response.use(
  (response) => {
    // Unwrap the generic WITT response wrapper
    if (response.data && response.data.isSuccess) {
      return response.data.data;
    }
    return response.data;
  },
  async (error) => {
    const isLogRequest = error.config && error.config.url && error.config.url.includes('system-logs');
    if (!isLogRequest) {
      try {
        const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message || 'Unknown network error';
        const targetUrl = error.config ? `${error.config.baseURL || ''}${error.config.url || ''}` : 'Unknown URL';
        
        // Asynchronously report the error to SystemLogs API
        axios.post(`${API_BASE_URL}/api/system-logs`, {
          logLevel: 'Error',
          source: 'Mobile',
          target: targetUrl,
          description: `Mobile API request failed: ${errorMsg}`,
          errorMessage: errorMsg
        }).catch(() => {});
      } catch (err) { }
    }
    return Promise.reject(error);
  }
);

export default api;
