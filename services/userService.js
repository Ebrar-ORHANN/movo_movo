// ── services/userService.js ──────────────────────────────────────────────────
import { api } from './api';

// ── Kendi profili getir ───────────────────────────────────────────────────────
export const fetchMyProfile = () => api.get('/users/me');

// ── Başka kullanıcı profili getir ─────────────────────────────────────────────
export const fetchUserProfile = (userId) => api.get(`/users/${userId}`);

// ── Kullanıcı istatistikleri ──────────────────────────────────────────────────
export const fetchUserStats = (userId) => api.get(`/users/${userId}/stats`);

// ── Profil güncelle ───────────────────────────────────────────────────────────
export const updateProfile = (data) => api.patch('/users/me', data);

// ── Gizlilik güncelle ─────────────────────────────────────────────────────────
export const updatePrivacy = (privacy) =>
  api.patch('/users/me/privacy', { privacy });

// ── Dil güncelle ──────────────────────────────────────────────────────────────
export const updateLanguage = (lang) =>
  api.patch('/users/me', { preferred_language: lang });

// ── Admin izinleri ────────────────────────────────────────────────────────────
export const getMyAdminPermissions = () => api.get('/admin/my-permissions');
export const getMyPermissions      = () => api.get('/admin/my-permissions');

// ── Takip işlemleri ───────────────────────────────────────────────────────────
export const followUser   = (userId) => api.post(`/users/${userId}/follow`);
export const unfollowUser = (userId) => api.delete(`/users/${userId}/follow`);

export const getFollowers  = (userId) => api.get(`/users/${userId}/followers`);
export const getFollowing  = (userId) => api.get(`/users/${userId}/following`);

// ── Engel işlemleri ───────────────────────────────────────────────────────────
export const blockUser   = (userId) => api.post(`/users/${userId}/block`);
export const unblockUser = (userId) => api.delete(`/users/${userId}/block`);

// ── FCM token ─────────────────────────────────────────────────────────────────
export const updateFCMToken = (fcmToken, platform) =>
  api.patch('/users/me/fcm', { fcm_token: fcmToken, fcm_platform: platform });