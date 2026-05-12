// ── hooks/useNotifications.js ────────────────────────────────────────────────
// DB: notifications tablosu, WebSocket bağlantısı
import { useState, useEffect, useCallback, useRef } from 'react';
import { getNotifications, markNotifRead, markAllNotifRead, getUnreadNotifCount, subscribeNotifications } from '../services/notificationService';
import { useAuth } from '../context/AuthContext';

export default function useNotifications() {
  const { profile }         = useAuth();
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [data, cnt] = await Promise.all([
        getNotifications(),
        getUnreadNotifCount(),
      ]);
      setNotifs(data);
      setUnread(cnt.unread_count);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    if (!profile?.id) return;
    // WebSocket ile anlık bildirim — notifications tablosuna yeni INSERT
    subscribeNotifications(profile.id, (msg) => {
      if (msg.type === 'notification' || msg.notif_type) {
        setNotifs(p => [msg, ...p]);
        setUnread(u => u + 1);
      }
    }).then(ws => { wsRef.current = ws; });
    return () => wsRef.current?.close();
  }, [profile?.id, load]);

  const markRead = async (id) => {
    await markNotifRead(id);
    setNotifs(p => p.map(n => n.id===id ? {...n, is_read:true} : n));
    setUnread(u => Math.max(0, u-1));
  };

  const markAll = async () => {
    await markAllNotifRead();
    setNotifs(p => p.map(n => ({...n, is_read:true})));
    setUnread(0);
  };

  return { notifs, unread, loading, markRead, markAll, reload: load };
}
