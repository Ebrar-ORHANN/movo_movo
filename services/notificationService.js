import { api } from './api';
import { WS_BASE } from '../constants/api';

export const getNotifications = () => api.get('/notifications');
export const markNotifRead = (id) => api.patch(`/notifications/${id}/read`);
export const markAllNotifRead = () => api.patch('/notifications/read-all');
export const deleteNotif = (id) => api.delete(`/notifications/${id}`);
export const getUnreadNotifCount = () => api.get('/notifications/unread-count');

export async function subscribeNotifications(userId, onMessage) {
  const ws = new WebSocket(`${WS_BASE}/notifications/ws/${userId}`);
  ws.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch {}
  };
  return ws;
}