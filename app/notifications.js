// ── app/notifications.js ─────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '../services/api';

const ICONS = {
  follow:             { icon:'person-add',      color:'#22C55E' },
  like:               { icon:'heart',           color:'#ef4444' },
  comment:            { icon:'chatbubble',      color:'#3B82F6' },
  route_save:         { icon:'bookmark',        color:'#8B5CF6' },
  together_request:   { icon:'people',          color:'#F97316' },
  together_broadcast: { icon:'radio',           color:'#F97316' },
  event_invite:       { icon:'calendar',        color:'#EC4899' },
  live_started:       { icon:'radio-button-on', color:'#ef4444' },
  poi_approved:       { icon:'checkmark-circle',color:'#22C55E' },
  poi_rejected:       { icon:'close-circle',    color:'#ef4444' },
  report_resolved:    { icon:'shield-checkmark',color:'#22C55E' },
  admin_message:      { icon:'megaphone',       color:'#F97316' },
};

function timeAgo(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60)    return 'Az önce';
  if (s < 3600)  return `${Math.floor(s / 60)}dk`;
  if (s < 86400) return `${Math.floor(s / 3600)}s`;
  return `${Math.floor(s / 86400)}g`;
}

// payload bazen string bazen obje gelir — ikisini de handle et
function parsePayload(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw;
}

function NotifItem({ item, onRead, onAccept, onReject }) {
  const meta = ICONS[item.type] || { icon:'notifications', color:'#888' };
  const p    = parsePayload(item.payload);
  const [acting, setActing] = useState(false);
  const [done,   setDone]   = useState(false); // kabul/red sonrası butonları gizle

  // Gizli profil takip isteği → pending
  const isPending = item.type === 'follow' && p.status === 'pending' && !done;

  const label = () => {
    const name = p.actor_name || 'Birisi';
    switch (item.type) {
      case 'follow':
        return p.status === 'pending'
          ? `${name} sizi takip etmek istiyor`
          : `${name} sizi takip etti`;
      case 'like':        return `${name} gönderinizi beğendi`;
      case 'comment':     return `${name} yorum yaptı: "${p.comment || ''}"`;
      case 'route_save':  return `${name} rotanızı kaydetti`;
      case 'live_started':return `${name} canlı yayın başlattı`;
      case 'poi_approved':return 'Mekanınız onaylandı ✅';
      case 'poi_rejected':return 'Mekanınız reddedildi ❌';
      case 'admin_message': return p.message || 'Admin mesajı';
      default:            return item.type;
    }
  };

  const handleAccept = async () => {
    setActing(true);
    try {
      await onAccept(p.follower_id || p.actor_id, item.id);
      setDone(true);
    } catch(e) { Alert.alert('Hata', e.message); }
    finally { setActing(false); }
  };

  const handleReject = async () => {
    setActing(true);
    try {
      await onReject(p.follower_id || p.actor_id, item.id);
      setDone(true);
    } catch(e) { Alert.alert('Hata', e.message); }
    finally { setActing(false); }
  };

  return (
    <TouchableOpacity
      style={[n.row, !item.is_read && n.rowUnread]}
      onPress={() => !item.is_read && onRead(item.id)}
      activeOpacity={0.8}
    >
      {/* Avatar */}
      <View style={n.avatarWrap}>
        {p.actor_avatar
          ? <Image source={{ uri: p.actor_avatar }} style={n.avatar}/>
          : <View style={[n.avatar, n.avatarFB]}>
              <Text style={n.avatarInit}>{(p.actor_name||'?').slice(0,1).toUpperCase()}</Text>
            </View>
        }
        <View style={[n.badge, { backgroundColor: meta.color }]}>
          <Ionicons name={meta.icon} size={10} color="#fff"/>
        </View>
      </View>

      {/* İçerik */}
      <View style={n.body}>
        <Text style={n.label} numberOfLines={3}>{label()}</Text>
        <Text style={n.time}>{timeAgo(item.created_at)}</Text>

        {/* ── Takip isteği — Kabul / Reddet ── */}
        {isPending && (
          <View style={n.actions}>
            {acting ? (
              <ActivityIndicator color="#22C55E" size="small" style={{ marginTop:8 }}/>
            ) : (
              <>
                <TouchableOpacity style={n.acceptBtn} onPress={handleAccept}>
                  <Ionicons name="checkmark" size={14} color="#fff"/>
                  <Text style={n.acceptTxt}>Kabul Et</Text>
                </TouchableOpacity>
                <TouchableOpacity style={n.rejectBtn} onPress={handleReject}>
                  <Ionicons name="close" size={14} color="#888"/>
                  <Text style={n.rejectTxt}>Reddet</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Kabul/red yapıldıysa küçük durum mesajı */}
        {item.type === 'follow' && done && (
          <Text style={n.doneLabel}>İşlem tamamlandı</Text>
        )}
      </View>

      {!item.is_read && <View style={n.dot}/>}
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [notifs,     setNotifs]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await api.get('/notifications?limit=50');
      setNotifs(Array.isArray(data) ? data : data?.notifications || []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const markRead = async (id) => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    try { await api.patch(`/notifications/${id}/read`); } catch {}
  };

  const markAll = async () => {
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    try { await api.patch('/notifications/read-all'); } catch {}
  };

  const acceptFollow = async (followerId, notifId) => {
    await api.patch(`/users/me/follow-requests/${followerId}/accept`);
    // Bildirimi okundu yap ve payload status'unu güncelle
    setNotifs(prev => prev.map(n =>
      n.id === notifId
        ? { ...n, is_read: true, payload: { ...parsePayload(n.payload), status: 'accepted' } }
        : n
    ));
  };

  const rejectFollow = async (followerId, notifId) => {
    await api.delete(`/users/me/follow-requests/${followerId}`);
    setNotifs(prev => prev.filter(n => n.id !== notifId));
  };

  const unread = notifs.filter(n => !n.is_read).length;

  if (loading) return (
    <View style={s.center}><ActivityIndicator color="#22C55E" size="large"/></View>
  );

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#fff"/>
        </TouchableOpacity>
        <Text style={s.title}>Bildirimler</Text>
        {unread > 0 && (
          <TouchableOpacity onPress={markAll}>
            <Text style={s.markAll}>Tümünü Oku</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifs}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#22C55E"/>
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="notifications-off-outline" size={52} color="#333"/>
            <Text style={s.emptyTxt}>Henüz bildirim yok</Text>
          </View>
        }
        renderItem={({ item }) => (
          <NotifItem
            item={item}
            onRead={markRead}
            onAccept={acceptFollow}
            onReject={rejectFollow}
          />
        )}
      />
    </View>
  );
}

// ── Stiller ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex:1, backgroundColor:'#0A0A0A' },
  center:    { flex:1, alignItems:'center', justifyContent:'center', backgroundColor:'#0A0A0A' },
  header:    { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:14, borderBottomWidth:0.5, borderBottomColor:'#1C1C1C', gap:12 },
  title:     { flex:1, color:'#fff', fontSize:18, fontWeight:'700' },
  markAll:   { color:'#22C55E', fontSize:13 },
  empty:     { alignItems:'center', paddingTop:80, gap:12 },
  emptyTxt:  { color:'#444', fontSize:15 },
});

const n = StyleSheet.create({
  row:        { flexDirection:'row', alignItems:'flex-start', padding:14, gap:12, borderBottomWidth:0.5, borderBottomColor:'#111' },
  rowUnread:  { backgroundColor:'#091409' },
  avatarWrap: { position:'relative' },
  avatar:     { width:46, height:46, borderRadius:23 },
  avatarFB:   { backgroundColor:'#1A3A1A', alignItems:'center', justifyContent:'center' },
  avatarInit: { color:'#22C55E', fontSize:18, fontWeight:'700' },
  badge:      { position:'absolute', bottom:0, right:0, width:18, height:18, borderRadius:9, alignItems:'center', justifyContent:'center', borderWidth:2, borderColor:'#0A0A0A' },
  body:       { flex:1 },
  label:      { color:'#ddd', fontSize:13, lineHeight:20 },
  time:       { color:'#555', fontSize:11, marginTop:3 },
  dot:        { width:8, height:8, borderRadius:4, backgroundColor:'#22C55E', marginTop:5 },
  // Kabul/Red butonları
  actions:    { flexDirection:'row', gap:8, marginTop:10 },
  acceptBtn:  { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:'#22C55E', borderRadius:10, paddingHorizontal:14, paddingVertical:8 },
  acceptTxt:  { color:'#fff', fontWeight:'700', fontSize:13 },
  rejectBtn:  { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:'#1C1C1C', borderRadius:10, paddingHorizontal:14, paddingVertical:8, borderWidth:0.5, borderColor:'#333' },
  rejectTxt:  { color:'#888', fontSize:13 },
  doneLabel:  { color:'#555', fontSize:11, marginTop:6, fontStyle:'italic' },
});