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
    try {
      const err = await res.json();
      msg = err.detail || JSON.stringify(err);
    } catch {}
    console.error(`API Error ${res.status} on ${path}:`, msg);  // ← hangi endpoint olduğunu göster
    throw new Error(msg);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get:    (path)          => request('GET',    path),
  post:   (path, body)    => request('POST',   path, body),
  put:    (path, body)    => request('PUT',    path, body),   // ← EKLE
  patch:  (path, body)    => request('PATCH',  path, body),
  delete: (path)          => request('DELETE', path),
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
      const errText = await res.text();
      console.error(`API Error ${res.status} on ${path}:`, errText);
      throw new Error(errText);
    }
    return res.json();
  },
};

export default api;