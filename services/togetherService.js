// ── services/togetherService.js ──────────────────────────────────────────────
// DB tabloları: together_sessions, together_requests, together_session_members,
//               active_explorers, waiting_room
// WebSocket: /together/sessions/{id}/ws → konum paylaşımı

import { api } from './api';
import { WS_BASE } from '../constants/api';
import { auth } from '../src/firebase/config';

// Active explorers — TTL: expires_at=NOW()+5dk (cleanup_expired_explorers cron)
export const updateExplorerStatus = (lat, lng, isOpen, cityId) =>
  api.put(`/together/explorer-status?lat=${lat}&lng=${lng}&is_open=${isOpen}${cityId?`&city_id=${cityId}`:''}`);
export const removeExplorerStatus = () => api.delete('/together/explorer-status');
export const getNearbyExplorers   = (lat,lng,r=100) =>
  api.get(`/together/nearby-explorers?lat=${lat}&lng=${lng}&radius=${r}`);

// Beraber gez isteği — together_requests INSERT
// target_user_id varsa direkt istek, yoksa broadcast (nearby_explorers'a)
export const sendTogetherRequest  = (data)       => api.post('/together/requests', data);
export const respondRequest       = (id, action) => api.patch(`/together/requests/${id}?action=${action}`);

// Oturum — together_sessions + together_session_members
export const getSessionDetail     = (id) => api.get(`/together/sessions/${id}`);
export const updateSessionLocation = (id, lat, lng) =>
  api.patch(`/together/sessions/${id}/location?lat=${lat}&lng=${lng}`);
export const leaveSession         = (id) => api.patch(`/together/sessions/${id}/leave`);
export const endSession           = (id) => api.patch(`/together/sessions/${id}/end`);

// WebSocket bağlantısı — konum + mesaj anlık
export async function connectToSession(sessionId, onMessage) {
  const token = await auth.currentUser?.getIdToken();
  const ws = new WebSocket(`${WS_BASE}/together/sessions/${sessionId}/ws?token=${token}`);
  ws.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)); } catch {}
  };
  return ws;
}
