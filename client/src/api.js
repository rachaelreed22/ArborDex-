import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

export const getTrees = () => api.get('/trees').then(r => r.data);
export const getTree = (id) => api.get(`/trees/${id}`).then(r => r.data);
export const createTree = (data) => api.post('/trees', data).then(r => r.data);
export const updateTree = (id, data) => api.put(`/trees/${id}`, data).then(r => r.data);
export const deleteTree = (id) => api.delete(`/trees/${id}`).then(r => r.data);
export const getQRCode = (id) => api.get(`/trees/${id}/qrcode`).then(r => r.data);

export const getPhotos = (treeId) => api.get(`/trees/${treeId}/photos`).then(r => r.data);
export const uploadPhoto = (treeId, formData) =>
  api.post(`/trees/${treeId}/photos`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
export const deletePhoto = (photoId) => api.delete(`/photos/${photoId}`).then(r => r.data);
