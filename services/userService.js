// ── services/userService.js ──────────────────────────────────────────────────
// DB tabloları: users, follows, blocks, admin_roles

import { api } from './api';

// Kendi profili — users JOIN cities, istatistikler dahil
export const fetchMyProfile      = ()        => api.get('/users/me');
export const fetchUserProfile    = (id)      => api.get(`/users/${id}`);
export const fetchUserStats      = (id)      => api.get(`/users/${id}/stats`);
export const updateProfile       = (data)    => api.patch('/users/me', data);
export const updatePrivacy       = (privacy) => api.patch('/users/me/privacy', { privacy });
export const updateFCMToken      = (tok, pl) => api.patch('/users/me/fcm-token', { fcm_token: tok, fcm_platform: pl });
export const deactivateAccount   = ()        => api.patch('/users/me/deactivate');
export const searchUsers         = (q)       => api.get(`/users/search/users?q=${encodeURIComponent(q)}`);

// Takip sistemi — follows tablosu
export const followUser          = (id)      => api.post(`/users/${id}/follow`);
export const unfollowUser        = (id)      => api.delete(`/users/${id}/follow`);
export const getFollowers        = (id)      => api.get(`/users/${id}/followers`);
export const getFollowing        = (id)      => api.get(`/users/${id}/following`);
export const getPendingRequests  = ()        => api.get('/users/me/follow-requests');
export const acceptFollowRequest = (id)      => api.patch(`/users/me/follow-requests/${id}/accept`);
export const rejectFollowRequest = (id)      => api.delete(`/users/me/follow-requests/${id}`);

// Engel sistemi — blocks tablosu
export const blockUser           = (id)      => api.post(`/users/${id}/block`);
export const unblockUser         = (id)      => api.delete(`/users/${id}/block`);
export const getBlockedUsers     = ()        => api.get('/users/me/blocked');

// Admin yetkisi — admin_roles tablosu
// Mobilde admin sekmesini açmak için kullanılır
export const getMyAdminPermissions = ()      => api.get('/admin/my-permissions');
