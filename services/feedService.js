// ── services/feedService.js ──────────────────────────────────────────────────
// DB tabloları: posts, post_attachments, likes, saves, shares, comments, reports

import { api } from './api';

// ── Feed ─────────────────────────────────────────────────────────────────────
// GET /social/feed → follows tablosundan takip edilenlerin postları
export const fetchFeed        = (before)  => api.get(`/social/feed${before ? `?before=${before}` : ''}`);
export const fetchExploreFeed = (cityId)  => api.get(`/social/explore/${cityId}`);
export const fetchCityFeed    = (cityId)  => api.get(`/social/explore/${cityId}`);
export const fetchUserPosts   = (userId)  => api.get(`/social/users/${userId}/posts`);
export const fetchEventPosts  = (eventId) => api.get(`/social/events/${eventId}/posts`); // events JOIN posts

// ── Post ─────────────────────────────────────────────────────────────────────
// POST /social/posts → posts tablosuna INSERT
export const createPost = (data) => api.post('/social/posts', data);
export const getPost    = (id)   => api.get(`/social/posts/${id}`);
export const updatePost = (id, data) => api.patch(`/social/posts/${id}`, data);
export const deletePost = (id)   => api.delete(`/social/posts/${id}`);

// Medya ekle — post_attachments tablosuna INSERT
// shared_to_poi=true → POI sayfasında görünür
export const addAttachment = (postId, data) =>
  api.post(`/social/posts/${postId}/attachments`, data);
export const shareAttachmentToPOI = (attachId, poiId) =>
  api.patch(`/social/attachments/${attachId}/share-to-poi?poi_id=${poiId}`);

// ── Beğeni — likes tablosu (trigger ile like_cnt artar) ─────────────────────
export const likeContent   = (type, id) => api.post('/social/likes', { target_type: type, target_id: id });
export const unlikeContent = (type, id) => api.delete(`/social/likes?target_type=${type}&target_id=${id}`);
export const getLikers     = (type, id) => api.get(`/social/likes/${type}/${id}`);

// ── Yorum — comments tablosu (trigger ile comment_cnt artar) ─────────────────
export const addComment    = (type, id, body, parentId) =>
  api.post(`/social/comments?target_type=${type}&target_id=${id}`, { body, parent_id: parentId });
export const getComments   = (type, id) => api.get(`/social/comments/${type}/${id}`);
export const updateComment = (id, body) => api.patch(`/social/comments/${id}?body=${encodeURIComponent(body)}`);
export const deleteComment = (id)       => api.delete(`/social/comments/${id}`);
export const likeComment   = (id)       => api.post(`/social/comments/${id}/like`);
export const unlikeComment = (id)       => api.delete(`/social/comments/${id}/like`);

// ── Kaydet — saves tablosu ───────────────────────────────────────────────────
export const saveContent   = (type, id) => api.post('/social/saves', { target_type: type, target_id: id });
export const unsaveContent = (type, id) => api.delete(`/social/saves?target_type=${type}&target_id=${id}`);
export const getSavedContent = (type)   => api.get(`/social/saves${type ? `?target_type=${type}` : ''}`);

// ── Paylaş — shares tablosu ──────────────────────────────────────────────────
export const shareContent = (type, id, shareType, platform) =>
  api.post('/social/shares', { target_type: type, target_id: id, share_type: shareType, platform });

// ── Şikayet — reports tablosu ────────────────────────────────────────────────
export const reportContent = (type, id, reason, note) =>
  api.post('/social/reports', { target_type: type, target_id: id, reason, note });

// Etkinlik postu gizle (event owner)
export const hideEventPost = (eventId, postId) =>
  api.patch(`/events/${eventId}/posts/${postId}/hide`);
