// ── context/AuthContext.js ───────────────────────────────────────────────────
import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../src/firebase/config';
import { loginBackend } from '../services/authService';
import { getMyPermissions } from '../services/adminService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile]           = useState(null);
  const [permissions, setPermissions]   = useState(null);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        try {
          const token = await fbUser.getIdToken(true);
          const result = await loginBackend(token);

          // Backend { user: {...} } veya direkt {...} döndürebilir
          const user = result?.user ?? result;
          if (!user?.id) throw new Error('Profil alınamadı');

          setProfile(user);

          const perms = await getMyPermissions().catch(() => ({ is_admin: false }));
          setPermissions(perms);

        } catch (e) {
          const msg = e.message || '';

          // Ağ hatası — backend çalışmıyor veya ulaşılamıyor
          if (
            msg.toLowerCase().includes('network request failed') ||
            msg.toLowerCase().includes('failed to fetch') ||
            msg.toLowerCase().includes('econnrefused') ||
            msg.toLowerCase().includes('network error')
          ) {
            console.error('[AuthContext] Backend ulaşılamıyor:', msg);
            console.error(
              '[AuthContext] EXPO_PUBLIC_API_URL değerini kontrol edin.',
              'Bilgisayarınızın IP adresi değişmiş olabilir.',
              'Terminalde: ipconfig (Windows) veya ifconfig (Mac/Linux)'
            );
            // Kullanıcıyı login'e at ama crash'leme
            setProfile(null);
            setLoading(false);
            return;
          }

          // Kullanıcı DB'de yok → otomatik kayıt dene
          if (msg.includes('önce kayıt olun') || msg.includes('404') || msg.includes('Kullanıcı bulunamadı')) {
            try {
              const token  = await fbUser.getIdToken(true);
              const email  = fbUser.email || '';
              const defaultUsername = email
                .split('@')[0]
                .replace(/[^a-z0-9_]/gi, '')
                .toLowerCase()
                .slice(0, 20) || `user${Date.now()}`;

              const { registerBackend } = await import('../services/authService');
              await registerBackend(token, defaultUsername, fbUser.displayName || defaultUsername);

              const token2  = await fbUser.getIdToken(true);
              const result2 = await loginBackend(token2);
              const user2   = result2?.user ?? result2;
              setProfile(user2);

            } catch (regErr) {
              console.error('[AuthContext] Otomatik kayıt başarısız:', regErr.message);
              setProfile(null);
              await signOut(auth);
            }
          } else {
            console.error('[AuthContext] Backend login error:', msg);
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
    try {
      const token  = await firebaseUser.getIdToken(true);
      const result = await loginBackend(token);
      const user   = result?.user ?? result;
      setProfile(user);
    } catch (e) {
      console.error('[AuthContext] refreshProfile hatası:', e.message);
    }
  };

  const logout = async () => {
    await signOut(auth);
    setProfile(null);
    setPermissions(null);
  };

  return (
    <AuthContext.Provider value={{
      firebaseUser, profile, permissions, loading,
      refreshProfile, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export default AuthContext;