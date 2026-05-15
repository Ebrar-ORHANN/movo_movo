// ── services/postService.js ──────────────────────────────────────────────────
import { api } from './api';

// ── Feed ─────────────────────────────────────────────────────────────────────
export const getFeed = (cursor = null, limit = 15) => {
  const q = cursor ? `?cursor=${cursor}&limit=${limit}` : `?limit=${limit}`;
  return api.get(`/social/feed${q}`);
};

export const getExploreFeed = (cityId, cursor = null, limit = 15) => {
  const q = cursor ? `?cursor=${cursor}&limit=${limit}` : `?limit=${limit}`;
  return api.get(`/social/explore/${cityId}${q}`);
};

export const getUserPosts = (userId, cursor = null) => {
  const q = cursor ? `?cursor=${cursor}` : '';
  return api.get(`/social/users/${userId}/posts${q}`);
};

// ── Post CRUD ─────────────────────────────────────────────────────────────────
export const createPost = (body) => api.post('/social/posts', body);

export const getPost = (postId) => api.get(`/social/posts/${postId}`);

export const deletePost = (postId) => api.delete(`/social/posts/${postId}`);

export const addAttachment = (postId, storageUrl, mediaType = 'image', meta = {}) => {
  const params = new URLSearchParams({
    storage_path: storageUrl,
    media_type: mediaType,
    ...(meta.width  ? { width:  String(meta.width)  } : {}),
    ...(meta.height ? { height: String(meta.height) } : {}),
  });
  return api.post(`/social/posts/${postId}/attachments?${params.toString()}`);
};

// ── Likes ─────────────────────────────────────────────────────────────────────
export const likeContent = (targetType, targetId) =>
  api.post('/social/likes', { target_type: targetType, target_id: targetId });

export const unlikeContent = (targetType, targetId) =>
  api.delete(`/social/likes?target_type=${targetType}&target_id=${targetId}`);

// ── Comments ──────────────────────────────────────────────────────────────────
export const getComments = (targetType, targetId) =>
  api.get(`/social/comments/${targetType}/${targetId}`);

export const addComment = (targetType, targetId, body, parentId = null) =>
  api.post('/social/comments', {
    target_type: targetType,
    target_id: targetId,
    body,
    ...(parentId ? { parent_id: parentId } : {}),
  });

export const deleteComment = (commentId) =>
  api.delete(`/social/comments/${commentId}`);

// ── Saves ─────────────────────────────────────────────────────────────────────
export const saveContent = (targetType, targetId) =>
  api.post('/social/saves', { target_type: targetType, target_id: targetId });

export const unsaveContent = (targetType, targetId) =>
  api.delete(`/social/saves?target_type=${targetType}&target_id=${targetId}`);

export const getSavedContent = () => api.get('/social/saves');