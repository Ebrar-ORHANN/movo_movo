// ── services/liveService.js ──────────────────────────────────────────────────
// DB tabloları: live_sessions, live_viewers, live_comments, live_reactions,
//               live_location_history
// RTMP/HLS: MediaMTX sunucusu üzerinden
// WebSocket: /live/{id}/ws → yorum, reaksiyon, konum, ilerleme

import { api } from './api';
import { WS_BASE } from '../constants/api';
import { auth } from '../src/firebase/config';

// Yayın oluştur — stream_key + rtmp_ingest_url + hls_playback_url üretilir
export const createLiveSession    = (data) => api.post('/live', data);
export const scheduleLiveSession  = (data) => api.post('/live', { ...data });
export const getLiveSessionDetail = (id)   => api.get(`/live/${id}`);
export const getActiveSessions    = (cityId) => api.get(`/live/active/${cityId}`);
export const getScheduledSessions = (cityId) => api.get(`/live/scheduled/${cityId}`);

// Yayın kontrol
export const startLive   = (id) => api.patch(`/live/${id}/start`);
export const pauseLive   = (id) => api.patch(`/live/${id}/pause`);
export const resumeLive  = (id) => api.patch(`/live/${id}/resume`);
export const endLive     = (id, recordingUrl) =>
  api.patch(`/live/${id}/end${recordingUrl?`?recording_url=${encodeURIComponent(recordingUrl)}`:''}` );

// İzleme — live_viewers INSERT, viewer_cnt trigger ile artar
export const joinLive    = (id) => api.post(`/live/${id}/join`);
export const leaveLive   = (id) => api.patch(`/live/${id}/leave`);
export const getLiveViewers = (id) => api.get(`/live/${id}/viewers`);

// Konum ve ilerleme — live_location_history INSERT
export const updateLiveLocation = (id, lat, lng) =>
  api.patch(`/live/${id}/location?lat=${lat}&lng=${lng}`);
export const updateLiveProgress = (id, stopId, pct) =>
  api.patch(`/live/${id}/progress?last_stop_id=${stopId}&progress_pct=${pct}`);

// Yorum — live_comments tablosu
export const sendLiveComment  = (id, body) => api.post(`/live/${id}/comments?body=${encodeURIComponent(body)}`);
export const deleteLiveComment = (id, cid) => api.delete(`/live/${id}/comments/${cid}`);
export const pinLiveComment   = (id, cid)  => api.patch(`/live/${id}/comments/${cid}/pin`);
export const getLiveComments  = (id)       => api.get(`/live/${id}/comments`);

// Reaksiyon — live_reactions INSERT + WebSocket'e broadcast
export const sendLiveReaction = (id, emoji) =>
  api.post(`/live/${id}/reactions?emoji=${encodeURIComponent(emoji)}`);

// WebSocket: yorum + reaksiyon + konum + rota ilerlemesi
export async function connectToLive(sessionId, onMessage) {
  const token = await auth.currentUser?.getIdToken();
  const ws = new WebSocket(`${WS_BASE}/live/${sessionId}/ws`);
  ws.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)); } catch {}
  };
  return ws;
}
