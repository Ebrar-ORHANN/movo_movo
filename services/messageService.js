// ── services/messageService.js ────────────────────────────────────────────────
import { api } from './api';

/**
 * Verilen kullanıcıyla sohbet odası oluşturur veya mevcut odayı getirir.
 * Backend izin kontrolü yapar:
 *   - Herkese açık profil → direkt
 *   - Gizli/takipçi profil → karşılıklı takip gerekli
 */
export async function getOrCreateRoom(otherUserId) {
  const room = await api.post(`/chat/rooms?other_user_id=${otherUserId}`);
  // API bazen { id } bazen { room: { id } } döndürebilir
  const id = room?.id || room?.room?.id || room;
  if (!id || id === 'undefined') throw new Error('Oda ID alınamadı');
  return { ...room, id };
}

/**
 * Kullanıcının tüm sohbet odalarını getirir.
 */
export async function getRooms() {
  return api.get('/chat/rooms');
}

/**
 * Belirli bir odanın mesajlarını getirir.
 */
export async function getMessages(roomId, limit = 30, before = null) {
  let url = `/chat/rooms/${roomId}/messages?limit=${limit}`;
  if (before) url += `&before=${before}`;
  return api.get(url);
}

/**
 * Mesaj gönderir.
 */
export async function sendMessage(roomId, content, mType = 'text') {
  return api.post(`/chat/rooms/${roomId}/messages?content=${encodeURIComponent(content)}&m_type=${mType}`);
}

/**
 * Odadaki mesajları okundu olarak işaretler.
 */
export async function markRoomRead(roomId) {
  return api.patch(`/chat/rooms/${roomId}/read`);
}