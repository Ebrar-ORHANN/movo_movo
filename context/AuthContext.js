// ── context/AuthContext.js ───────────────────────────────────────────────────
// Firebase oturumu + backend kullanıcı profili merkezi state
// Admin yetkisi de burada tutulur → tüm ekranlar buradan okur

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../src/firebase/config';
import { loginBackend } from '../services/authService';
import { getMyPermissions } from '../services/notificationService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);     // users tablosu
  const [permissions, setPermissions] = useState(null); // admin_roles tablosu
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        try {
          const token = await fbUser.getIdToken();
          const { user } = await loginBackend(token);
          setProfile(user);
          // Admin yetkisi — admin_roles tablosundan
          const perms = await getMyPermissions().catch(() => ({ is_admin: false }));
          setPermissions(perms);
        } catch {
          setProfile(null);
          setPermissions(null);
        }
      } else {
        setProfile(null);
        setPermissions(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const refreshProfile = async () => {
    if (!firebaseUser) return;
    const token = await firebaseUser.getIdToken();
    const { user } = await loginBackend(token);
    setProfile(user);
  };

  return (
    <AuthContext.Provider value={{ firebaseUser, profile, permissions, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export default AuthContext;
