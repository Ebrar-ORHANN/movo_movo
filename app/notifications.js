// ── app/notifications.js ─────────────────────────────────────────────────────
// DB: notifications tablosu
// WebSocket: /notifications/ws/{user_id} → anlık bildirim

import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import useNotifications from '../hooks/useNotifications';

const NOTIF_ICONS = {
  like:             { icon:'heart',             color:'#ef4444' },
  comment:          { icon:'chatbubble',         color:'#3b82f6' },
  follow:           { icon:'person-add',         color:'#22C55E' },
  together_request: { icon:'people',             color:'#f59e0b' },
  live_started:     { icon:'radio',              color:'#ef4444' },
  event_approved:   { icon:'calendar',           color:'#22C55E' },
  poi_approved:     { icon:'location',           color:'#22C55E' },
  poi_rejected:     { icon:'location',           color:'#ef4444' },
  report_resolved:  { icon:'shield-checkmark',   color:'#22C55E' },
  admin_message:    { icon:'shield',             color:'#f59e0b' },
};

function NotifItem({ notif, onPress, onRead }) {
  const config = NOTIF_ICONS[notif.type] || { icon:'notifications', color:'#888' };
  const timeAgo = () => {
    const diff = Date.now() - new Date(notif.created_at).getTime();
    const min = Math.floor(diff/60000);
    if (min < 60)    return `${min}dk`;
    if (min < 1440)  return `${Math.floor(min/60)}sa`;
    return `${Math.floor(min/1440)}g`;
  };

  return (
    <TouchableOpacity style={[styles.notifRow, !notif.is_read && styles.notifUnread]}
      onPress={() => { onRead(notif.id); onPress(notif); }}>
      <View style={[styles.notifIcon, { backgroundColor: config.color+'22' }]}>
        <Ionicons name={config.icon} size={20} color={config.color} />
      </View>
      <View style={styles.notifBody}>
        <Text style={styles.notifType}>{notif.type?.replace(/_/g,' ')}</Text>
        <Text style={styles.notifPayload} numberOfLines={2}>
          {typeof notif.payload === 'object' ? JSON.stringify(notif.payload) : notif.payload}
        </Text>
      </View>
      <View style={styles.notifMeta}>
        <Text style={styles.notifTime}>{timeAgo()}</Text>
        {!notif.is_read && <View style={styles.unreadDot} />}
      </View>
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { notifs, unread, loading, markRead, markAll } = useNotifications();

  const handlePress = (notif) => {
    const p = notif.payload || {};
    if (p.route_id)   router.push(`/route/${p.route_id}`);
    if (p.event_id)   router.push(`/events/${p.event_id}`);
    if (p.room_id)    router.push(`/messages/${p.room_id}`);
    if (p.session_id) router.push(`/live/${p.session_id}`);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Bildirimler</Text>
        {unread > 0 && (
          <TouchableOpacity onPress={markAll}>
            <Text style={styles.markAll}>Tümünü Okundu Yap</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color="#22C55E" /></View>
      ) : (
        <FlatList
          data={notifs}
          keyExtractor={n => String(n.id)}
          renderItem={({ item }) => (
            <NotifItem notif={item} onPress={handlePress} onRead={markRead} />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={48} color="#333" />
              <Text style={styles.emptyText}>Bildirim yok</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex:1, backgroundColor:'#0D0D0D' },
  header:       { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:16, paddingBottom:16 },
  title:        { flex:1, color:'#fff', fontSize:20, fontWeight:'700' },
  markAll:      { color:'#22C55E', fontSize:13 },
  centered:     { flex:1, alignItems:'center', justifyContent:'center' },
  notifRow:     { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:16, paddingVertical:14, borderBottomWidth:0.5, borderBottomColor:'#111' },
  notifUnread:  { backgroundColor:'rgba(34,197,94,0.04)' },
  notifIcon:    { width:44, height:44, borderRadius:22, alignItems:'center', justifyContent:'center', flexShrink:0 },
  notifBody:    { flex:1 },
  notifType:    { color:'#fff', fontSize:13, fontWeight:'600', textTransform:'capitalize' },
  notifPayload: { color:'#888', fontSize:12, marginTop:2 },
  notifMeta:    { alignItems:'flex-end', gap:4 },
  notifTime:    { color:'#555', fontSize:11 },
  unreadDot:    { width:8, height:8, borderRadius:4, backgroundColor:'#22C55E' },
  empty:        { alignItems:'center', justifyContent:'center', paddingTop:80, gap:12 },
  emptyText:    { color:'#555', fontSize:16 },
});
