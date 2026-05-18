// ── app/notifications.js ─────────────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Image, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import useNotifications from '../hooks/useNotifications';
import { api } from '../services/api';

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ uri, name, size = 42 }) {
  const init = (name || '?').slice(0, 1).toUpperCase();
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: '#1A3A1A', alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: '#22C55E', fontSize: size * 0.38, fontWeight: '800' }}>{init}</Text>
    </View>
  );
}

// ── Bildirim konfigürasyonu ───────────────────────────────────────────────────
function getNotifConfig(type, payload = {}) {
  const isPending = payload.status === 'pending';
  switch (type) {
    case 'follow':
      return {
        icon:    isPending ? 'person-add-outline' : 'person-outline',
        color:   '#22C55E',
        message: isPending
          ? `${payload.actor_name || 'Birisi'} seni takip etmek istiyor`
          : `${payload.actor_name || 'Birisi'} seni takip etmeye başladı`,
      };
    case 'like':
      return {
        icon:    'heart',
        color:   '#ef4444',
        message: `${payload.actor_name || 'Birisi'} gönderini beğendi`,
      };
    case 'comment':
      return {
        icon:    'chatbubble',
        color:   '#3B82F6',
        message: `${payload.actor_name || 'Birisi'} yorum yaptı: "${payload.comment || ''}"`,
      };
    case 'poi_approved':
      return { icon: 'location', color: '#22C55E', message: 'Mekanın onaylandı' };
    case 'poi_rejected':
      return { icon: 'location', color: '#ef4444', message: 'Mekanın reddedildi' };
    case 'event_approved':
      return { icon: 'calendar', color: '#22C55E', message: 'Etkinliğin onaylandı' };
    case 'admin_message':
      return { icon: 'shield', color: '#f59e0b', message: 'MOVO ekibinden mesaj' };
    default:
      return { icon: 'notifications-outline', color: '#888', message: type };
  }
}

// ── Takip isteği butonları ────────────────────────────────────────────────────
function FollowRequestActions({ notif, onDone }) {
  const payload    = notif.payload || {};
  const isPending  = payload.status === 'pending';
  const [loading,  setLoading]  = useState(false);
  const [decided,  setDecided]  = useState(false); // kabul/ret sonrası

  if (!isPending || decided) return null;

  const handleAccept = async () => {
    setLoading(true);
    try {
      await api.patch(`/users/me/follow-requests/${payload.follower_id}/accept`);
      setDecided(true);
      onDone?.('accepted');
    } catch (e) {
      Alert.alert('Hata', e.message);
    } finally { setLoading(false); }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      await api.delete(`/users/me/follow-requests/${payload.follower_id}`);
      setDecided(true);
      onDone?.('rejected');
    } catch (e) {
      Alert.alert('Hata', e.message);
    } finally { setLoading(false); }
  };

  if (loading) return <ActivityIndicator color="#22C55E" style={{ marginTop: 8 }} />;

  return (
    <View style={act.row}>
      <TouchableOpacity style={act.acceptBtn} onPress={handleAccept}>
        <Text style={act.acceptTxt}>Kabul Et</Text>
      </TouchableOpacity>
      <TouchableOpacity style={act.rejectBtn} onPress={handleReject}>
        <Text style={act.rejectTxt}>Reddet</Text>
      </TouchableOpacity>
    </View>
  );
}
const act = StyleSheet.create({
  row:       { flexDirection: 'row', gap: 8, marginTop: 8 },
  acceptBtn: { flex: 1, backgroundColor: '#22C55E', borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  acceptTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  rejectBtn: { flex: 1, backgroundColor: '#1A1A1A', borderRadius: 10, paddingVertical: 8, alignItems: 'center', borderWidth: 0.5, borderColor: '#333' },
  rejectTxt: { color: '#888', fontWeight: '600', fontSize: 13 },
});

// ── Tek bildirim satırı ───────────────────────────────────────────────────────
function NotifRow({ notif, onRead, onPress }) {
  const router  = useRouter();
  const payload = notif.payload || {};
  const config  = getNotifConfig(notif.type, payload);
  const [actionDone, setActionDone] = useState(null);

  const timeAgo = () => {
    const diff = (Date.now() - new Date(notif.created_at)) / 1000;
    if (diff < 60)    return 'az önce';
    if (diff < 3600)  return `${Math.floor(diff / 60)}dk`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}sa`;
    return `${Math.floor(diff / 86400)}g`;
  };

  const handlePress = () => {
    onRead(notif.id);
    // Posta git
    if (payload.post_id) router.push(`/post/${payload.post_id}`);
    // Kullanıcı profiline git
    else if (payload.actor_id && notif.type !== 'follow') router.push(`/user/${payload.actor_id}`);
  };

  return (
    <TouchableOpacity
      style={[s.row, !notif.is_read && s.rowUnread]}
      onPress={handlePress}
      activeOpacity={0.75}
    >
      {/* Sol: avatar + ikon */}
      <View style={{ position: 'relative' }}>
        <Avatar uri={payload.actor_avatar} name={payload.actor_name} size={46} />
        <View style={[s.typeIcon, { backgroundColor: config.color }]}>
          <Ionicons name={config.icon} size={11} color="#fff" />
        </View>
      </View>

      {/* Sağ: metin + butonlar */}
      <View style={{ flex: 1 }}>
        <View style={s.msgRow}>
          <Text style={s.msg} numberOfLines={2}>{config.message}</Text>
          <Text style={s.time}>{timeAgo()}</Text>
        </View>

        {/* Takip isteği kabul/ret butonları */}
        {notif.type === 'follow' && !actionDone && (
          <FollowRequestActions
            notif={notif}
            onDone={(result) => setActionDone(result)}
          />
        )}

        {/* Aksiyon sonucu */}
        {actionDone && (
          <Text style={{ color: actionDone === 'accepted' ? '#22C55E' : '#888', fontSize: 12, marginTop: 6 }}>
            {actionDone === 'accepted' ? '✓ Kabul edildi' : '✗ Reddedildi'}
          </Text>
        )}
      </View>

      {/* Okunmamış nokta */}
      {!notif.is_read && <View style={s.unreadDot} />}
    </TouchableOpacity>
  );
}

// ── Ana ekran ─────────────────────────────────────────────────────────────────
export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { notifs, unread, loading, markRead, markAll } = useNotifications();

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title}>Bildirimler</Text>
        {unread > 0 && (
          <TouchableOpacity style={s.readAllBtn} onPress={markAll}>
            <Text style={s.readAllTxt}>Tümünü Oku</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={s.loadWrap}>
          <ActivityIndicator color="#22C55E" size="large" />
        </View>
      ) : (
        <FlatList
          data={notifs}
          keyExtractor={n => String(n.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          ListEmptyComponent={() => (
            <View style={s.empty}>
              <Ionicons name="notifications-off-outline" size={52} color="#2A2A2A" />
              <Text style={s.emptyTitle}>Bildirim yok</Text>
              <Text style={s.emptyDesc}>Beğeni, yorum ve takip istekleri burada görünür</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <NotifRow
              notif={item}
              onRead={markRead}
              onPress={() => {}}
            />
          )}
        />
      )}
    </View>
  );
}

// ── Stiller ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#0A0A0A' },
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 12, gap: 10, borderBottomWidth: 0.5, borderBottomColor: '#111' },
  backBtn:    { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  title:      { flex: 1, color: '#fff', fontSize: 20, fontWeight: '800' },
  readAllBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#0A2A1A', borderRadius: 14 },
  readAllTxt: { color: '#22C55E', fontSize: 13, fontWeight: '600' },
  loadWrap:   { flex: 1, alignItems: 'center', justifyContent: 'center' },

  row:        { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowUnread:  { backgroundColor: 'rgba(34,197,94,0.04)' },
  typeIcon:   { position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#0A0A0A' },
  msgRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  msg:        { flex: 1, color: '#ccc', fontSize: 13, lineHeight: 19 },
  time:       { color: '#444', fontSize: 11, marginTop: 2, flexShrink: 0 },
  unreadDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E', marginTop: 4 },
  sep:        { height: 0.5, backgroundColor: '#111', marginLeft: 74 },

  empty:      { alignItems: 'center', paddingTop: 100, gap: 12 },
  emptyTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  emptyDesc:  { color: '#555', fontSize: 13, textAlign: 'center', paddingHorizontal: 40 },
});