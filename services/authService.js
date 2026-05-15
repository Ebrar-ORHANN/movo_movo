// ── services/authService.js ──────────────────────────────────────────────────
import { api } from './api';

export async function registerBackend(firebaseToken, username, displayName) {
  return api.postWithToken('/auth/register', firebaseToken, {
    firebase_token: firebaseToken,
    username: username.toLowerCase().trim(),
    display_name: displayName,
  });
}

export async function loginBackend(firebaseToken) {
  return api.postWithToken('/auth/login', firebaseToken, {
    firebase_token: firebaseToken,
  });
}

export async function logoutBackend() {
  return api.post('/auth/logout');
}

export async function checkUsername(username) {
  const data = await api.get(`/auth/check-username?q=${encodeURIComponent(username)}`);
  return data.available;
}