// ── services/messageService.js ───────────────────────────────────────────────
// DB tabloları: chat_rooms, messages
// WebSocket: /chat/rooms/{id}/ws → anlık mesaj, yazıyor...

import { api } from './api';
import { WS_BASE } from '../constants/api';
import { auth } from '../src/firebase/config';

// DM odası — UNIQUE(user_one_id < user_two_id)
export const getOrCreateRoom   = (userId)    => api.post('/chat/rooms', { other_user_id: userId });
export const getRooms          = ()          => api.get('/chat/rooms');
export const getMessages       = (id, before) =>
  api.get(`/chat/rooms/${id}/messages${before?`?before=${before}`:''}`);
export const sendMessage       = (id, content, mType='text') =>
  api.post(`/chat/rooms/${id}/messages?content=${encodeURIComponent(content)}&m_type=${mType}`);
export const deleteMessage     = (mid)       => api.delete(`/chat/messages/${mid}`);
export const markMessagesRead  = (id)        => api.patch(`/chat/rooms/${id}/read`);
export const getUnreadCount    = ()          => api.get('/chat/unread-count');

export async function connectToRoom(roomId, onMessage) {
  const token = await auth.currentUser?.getIdToken();
  const ws = new WebSocket(`${WS_BASE}/chat/rooms/${roomId}/ws`);
  ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch {} };
  return ws;
}
