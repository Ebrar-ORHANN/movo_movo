// ── context/AuthContext.js ───────────────────────────────────────────────────
import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../src/firebase/config';
import { loginBackend } from '../services/authService';
//import { getMyPermissions } from '../services/notificationService';
import { getMyPermissions } from '../services/adminService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [loading, setLoading] = useState(true);

useEffect(() => {
  const unsub = onAuthStateChanged(auth, async (fbUser) => {
    setFirebaseUser(fbUser);
    if (fbUser) {
      try {
        const token = await fbUser.getIdToken();
        const { user } = await loginBackend(token);
        setProfile(user);
        const perms = await getMyPermissions().catch(() => ({ is_admin: false }));
        setPermissions(perms);
      } catch (e) {
        const msg = e.message || '';
        if (msg.includes('önce kayıt olun') || msg.includes('404')) {
          // DB'de yok → otomatik kayıt dene
          try {
            const token = await fbUser.getIdToken(true);
            const email = fbUser.email || '';
            const defaultUsername = email.split('@')[0].replace(/[^a-z0-9_]/gi, '').toLowerCase();
            const { registerBackend } = await import('./services/authService');
            await registerBackend(token, defaultUsername, fbUser.displayName || defaultUsername);
            const token2 = await fbUser.getIdToken(true);
            const { user } = await loginBackend(token2);
            setProfile(user);
          } catch (regErr) {
            console.error('Otomatik kayıt başarısız:', regErr.message);
            setProfile(null);
            await signOut(auth);
          }
        } else {
          console.error('Backend login error:', msg);
          setProfile(null);
        }
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