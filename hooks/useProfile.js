// ── hooks/useProfile.js ──────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import { fetchMyProfile, fetchUserStats, getMyAdminPermissions } from '../services/userService';
import { getUserRoutes } from '../services/routeService';
import { getUserEvents } from '../services/eventService';
import { getSavedContent } from '../services/feedService';
import { api } from '../services/api';
import { signOut } from 'firebase/auth';
import { auth } from '../src/firebase/config';
import { useAuth } from '../context/AuthContext';

async function safeGet(fn, fallback) {
  try { return await fn(); }
  catch (e) { console.warn('Profile isteği başarısız:', e.message); return fallback; }
}

export default function useProfile() {
  const authCtx      = useAuth();
  const firebaseUser = authCtx?.firebaseUser;
  const authLoading  = authCtx?.loading;

  const [profile, setProfile]       = useState(null);
  const [stats, setStats]           = useState(null);
  const [routes, setRoutes]         = useState([]);
  const [events, setEvents]         = useState([]);
  const [saved, setSaved]           = useState([]);
  const [posts, setPosts]           = useState([]);
  const [adminPerms, setAdminPerms] = useState({ is_admin: false });
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState('gönderiler');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const me = await fetchMyProfile();
      if (!me) { setLoading(false); return; }
      setProfile(me);

      const [statsData, routesData, eventsData, savedData, postsData, perms] = await Promise.all([
        safeGet(() => fetchUserStats(me.id),              null),
        safeGet(() => getUserRoutes(me.id),               []),
        safeGet(() => getUserEvents(me.id),               []),
        safeGet(() => getSavedContent(),                  []),
        safeGet(() => api.get(`/social/users/${me.id}/posts`), []),
        safeGet(() => getMyAdminPermissions(),            { is_admin: false }),
      ]);

      setStats(statsData);
      setRoutes(routesData  || []);
      setEvents(eventsData  || []);
      setSaved(savedData    || []);
      setPosts(postsData    || []);
      setAdminPerms(perms   || { is_admin: false });
    } catch (e) {
      console.warn('Profil yüklenemedi:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && firebaseUser) load();
  }, [load, authLoading, firebaseUser]);

  const logout = async () => { await signOut(auth); };

  const totalKm = (routes || []).reduce((s, r) => s + (r.distance_m || 0), 0) / 1000;

  return {
    profile, stats, routes, events, saved, posts, adminPerms,
    loading, activeTab, setActiveTab,
    totalKm, reload: load, logout,
  };
}