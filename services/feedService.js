// ── services/feedService.js ──────────────────────────────────────────────────
import { api } from './api';

// ── Feed ─────────────────────────────────────────────────────────────────────
export const fetchFeed        = (before)  => api.get(`/social/feed${before ? `?before=${before}` : ''}`);
export const fetchExploreFeed = (cityId)  => api.get(`/social/explore/${cityId}`);
export const fetchCityFeed    = (cityId)  => api.get(`/social/explore/${cityId}`);
export const fetchUserPosts   = (userId)  => api.get(`/social/users/${userId}/posts`);
export const fetchEventPosts  = (eventId) => api.get(`/social/events/${eventId}/posts`);

// ── Post ─────────────────────────────────────────────────────────────────────
export const createPost = (data)        => api.post('/social/posts', data);
export const getPost    = (id)          => api.get(`/social/posts/${id}`);
export const updatePost = (id, data)    => api.patch(`/social/posts/${id}`, data);
export const deletePost = (id)          => api.delete(`/social/posts/${id}`);

export const addAttachment = (postId, storageUrl, mediaType = 'image', meta = {}) => {
  const params = new URLSearchParams({
    storage_path: storageUrl,
    media_type: mediaType,
    ...(meta.width  ? { width:  String(meta.width)  } : {}),
    ...(meta.height ? { height: String(meta.height) } : {}),
  });
  return api.post(`/social/posts/${postId}/attachments?${params.toString()}`);
};

export const shareAttachmentToPOI = (attachId, poiId) =>
  api.patch(`/social/attachments/${attachId}/share-to-poi?poi_id=${poiId}`);

// ── Beğeni ────────────────────────────────────────────────────────────────────
export const likeContent   = (type, id) =>
  api.post(`/social/likes?target_type=${type}&target_id=${id}`);

export const unlikeContent = (type, id) =>
  api.delete(`/social/likes?target_type=${type}&target_id=${id}`);

export const getLikers     = (type, id) =>
  api.get(`/social/likes/${type}/${id}`);

// ── Yorum ─────────────────────────────────────────────────────────────────────
export const addComment = (type, id, body, parentId) =>
  api.post(`/social/comments?target_type=${type}&target_id=${id}`, {
    body,
    parent_id: parentId || null,
  });

export const getComments   = (type, id) => api.get(`/social/comments/${type}/${id}`);
export const updateComment = (id, body) => api.patch(`/social/comments/${id}?body=${encodeURIComponent(body)}`);
export const deleteComment = (id)       => api.delete(`/social/comments/${id}`);
export const likeComment   = (id)       => api.post(`/social/comments/${id}/like`);
export const unlikeComment = (id)       => api.delete(`/social/comments/${id}/like`);

// ── Kaydet ────────────────────────────────────────────────────────────────────
export const saveContent = (type, id) =>
  api.post(`/social/saves?target_type=${type}&target_id=${id}`);

export const unsaveContent = (type, id) =>
  api.delete(`/social/saves?target_type=${type}&target_id=${id}`);

export const getSavedContent = (type) =>
  api.get(`/social/saves${type ? `?target_type=${type}` : ''}`);

// ── Paylaş ────────────────────────────────────────────────────────────────────
export const shareContent = (type, id, shareType, platform) =>
  api.post('/social/shares', { target_type: type, target_id: id, share_type: shareType, platform });

// ── Şikayet ───────────────────────────────────────────────────────────────────
export const reportContent = (type, id, reason, note) =>
  api.post('/social/reports', { target_type: type, target_id: id, reason, note });

// ── Diğer ─────────────────────────────────────────────────────────────────────
export const hideEventPost = (eventId, postId) =>
  api.patch(`/events/${eventId}/posts/${postId}/hide`);