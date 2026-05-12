import { api } from './api';

export const getMyPermissions = () => api.get('/admin/my-permissions');
export const grantAdminRole = (data) => api.post('/admin/roles', data);
export const revokeAdminRole = (uid, s) => api.delete(`/admin/roles/${uid}?scope_type=${s}`);
export const listPendingPOIs = (cityId) => api.get(`/admin/pois/pending${cityId ? `?city_id=${cityId}` : ''}`);
export const approvePOI = (id) => api.patch(`/admin/pois/${id}/approve`);
export const rejectPOI = (id, reason) => api.patch(`/admin/pois/${id}/reject`, { reason });
export const listReports = (status = 'pending') => api.get(`/admin/reports/v2?status=${status}`);
export const resolveReport = (id, note) => api.patch(`/admin/reports/v2/${id}/resolve${note ? `?note=${encodeURIComponent(note)}` : ''}`);
export const dismissReport = (id) => api.patch(`/admin/reports/v2/${id}/dismiss`);
export const approveEvent = (id) => api.patch(`/admin/events/${id}/approve`);
export const suspendUser = (id, reason) => api.patch(`/admin/users/${id}/suspend`, { reason });
export const unsuspendUser = (id) => api.patch(`/admin/users/${id}/unsuspend`);
export const setSponsor = (id, data) => api.patch(`/admin/pois/${id}/sponsor`, data);
export const manageTags = (id, tags) => api.patch(`/admin/pois/${id}/tags`, tags);
export const messageUser = (data) => api.post('/admin/message-user', data);