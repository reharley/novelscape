import axios from 'axios';

export function setupAxios() {
  axios.interceptors.request.use(
    (config) => {
      const accessToken = localStorage.getItem('accessToken');
      const token = `Bearer ${accessToken}`;
      console.log(token);
      if (token) {
        config.headers['Authorization'] = token;
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );
}
