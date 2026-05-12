// ── services/api.js ─────────────────────────────────────────────────────────
// Tüm backend isteklerinin geçtiği merkezi istemci.
// Her istekte Firebase token otomatik eklenir.
// DB ile ilişki: Her endpoint doğrudan movo_final.sql'deki tablolara karşılık gelir.

import { auth } from '../src/firebase/config';
import { API_BASE } from '../constants/api';

async function getToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

async function request(method, path, body = null, isForm = false) {
  const token = await getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body && !isForm) opts.body = JSON.stringify(body);
  if (body && isForm) { delete headers['Content-Type']; opts.body = body; }

  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const err = await res.json(); msg = err.detail || msg; } catch {}
    throw new Error(msg);
  }
  // 204 No Content
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get:    (path)          => request('GET',    path),
  post:   (path, body)    => request('POST',   path, body),
  patch:  (path, body)    => request('PATCH',  path, body),
  delete: (path)          => request('DELETE', path),
  // Firebase token ile POST (kayıt/giriş için)
  postWithToken: async (path, firebaseToken, body = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${firebaseToken}`,
    };
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const err = await res.json(); msg = err.detail || msg; } catch {}
      throw new Error(msg);
    }
    return res.json();
  },
};

export default api;
