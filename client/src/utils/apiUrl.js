export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV ? '' : 'https://arbordex.onrender.com');

export const apiUrl = (path) => `${API_BASE_URL}${path}`;
