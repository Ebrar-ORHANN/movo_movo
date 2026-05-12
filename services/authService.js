// ── services/authService.js ──────────────────────────────────────────────────
// DB tabloları: users, admin_roles
// Firebase Auth → token al → backend'e gönder → DB'ye yaz

import { api } from './api';

// Kayıt: Firebase kullanıcısı oluşturulduktan sonra backend'e bildir
// POST /auth/register → users tablosuna INSERT
export async function registerBackend(firebaseToken, username, displayName) {
  return api.postWithToken('/auth/register', firebaseToken, {
    username: username.toLowerCase().trim(),
    display_name: displayName,
  });
}

// Giriş: Firebase token ile backend'de kullanıcıyı getir
// POST /auth/login → users tablosundan SELECT
export async function loginBackend(firebaseToken) {
  return api.postWithToken('/auth/login', firebaseToken);
}

// Çıkış: FCM token temizle
// POST /auth/logout → users SET fcm_token=NULL
export async function logoutBackend() {
  return api.post('/auth/logout');
}

// Username müsaitlik kontrolü
// GET /auth/check-username → users WHERE LOWER(username)=$1
export async function checkUsername(username) {
  const data = await api.get(`/auth/check-username?q=${encodeURIComponent(username)}`);
  return data.available;
}
