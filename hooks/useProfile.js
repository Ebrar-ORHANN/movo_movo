// ── hooks/useProfile.js ──────────────────────────────────────────────────────
// DB: users, follows, routes, events, saves, admin_roles
import { useState, useEffect, useCallback } from 'react';
import { fetchMyProfile, fetchUserStats, getMyAdminPermissions } from '../services/userService';
import { getUserRoutes } from '../services/routeService';
import { getUserEvents } from '../services/eventService';
import { getSavedContent } from '../services/feedService';
import { signOut } from 'firebase/auth';
import { auth } from '../src/firebase/config';

export default function useProfile() {
  const [profile, setProfile]       = useState(null);
  const [stats, setStats]           = useState(null);
  const [routes, setRoutes]         = useState([]);
  const [events, setEvents]         = useState([]);
  const [saved, setSaved]           = useState([]);
  const [adminPerms, setAdminPerms] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState('rotalar');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const me = await fetchMyProfile();
      setProfile(me);
      const [statsData, routesData, eventsData, savedData, perms] = await Promise.all([
        fetchUserStats(me.id),
        getUserRoutes(me.id),
        getUserEvents(me.id),
        getSavedContent(),
        getMyAdminPermissions().catch(() => ({ is_admin: false })),
      ]);
      setStats(statsData);
      setRoutes(routesData);
      setEvents(eventsData);
      setSaved(savedData);
      setAdminPerms(perms);
    } catch (e) { console.warn('Profile:', e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const logout = async () => {
    await signOut(auth);
  };

  // Toplam km: routes.distance_m toplamı
  const totalKm = routes.reduce((s, r) => s + (r.distance_m || 0), 0) / 1000;

  return {
    profile, stats, routes, events, saved, adminPerms,
    loading, activeTab, setActiveTab,
    totalKm, reload: load, logout,
  };
}
