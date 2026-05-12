// ── app/messages/index.js ────────────────────────────────────────────────────
// DB: chat_rooms (last_message_at sıralı) + getUnreadCount
// Admin mesajı: is_admin_message=TRUE olan mesajlar farklı gösterilir

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { getRooms, getUnreadCount } from '../../services/messageService';

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [rooms, setRooms]   = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getRooms(), getUnreadCount()])
      .then(([r, u]) => { setRooms(r); setUnread(u.unread_count || 0); })
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title}>Mesajlar</Text>
        {unread > 0 && <View style={s.badge}><Text style={s.badgeText}>{unread}</Text></View>}
      </View>

      {loading ? <ActivityIndicator color="#22C55E" style={{marginTop:40}} /> : (
        <FlatList
          data={rooms}
          keyExtractor={r => r.id}
          contentContainerStyle={{ paddingHorizontal:16, gap:4 }}
          renderItem={({ item }) => {
            const initials = (item.other_name || item.other_username || '?').slice(0,1).toUpperCase();
            return (
              <TouchableOpacity style={s.row} onPress={() => router.push(`/messages/${item.id}`)}>
                <View style={s.avatar}><Text style={s.avatarText}>{initials}</Text></View>
                <View style={{ flex:1 }}>
                  <Text style={s.name}>{item.other_name || item.other_username}</Text>
                  <Text style={s.preview} numberOfLines={1}>{item.last_message_preview || '...'}</Text>
                </View>
                <Text style={s.time}>
                  {item.last_message_at ? new Date(item.last_message_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : ''}
                </Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color="#333" />
              <Text style={s.emptyText}>Henüz mesaj yok</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex:1, backgroundColor:'#0D0D0D' },
  header:    { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:16, paddingBottom:16 },
  title:     { flex:1, color:'#fff', fontSize:20, fontWeight:'700' },
  badge:     { backgroundColor:'#22C55E', borderRadius:10, paddingHorizontal:8, paddingVertical:2 },
  badgeText: { color:'#fff', fontSize:12, fontWeight:'700' },
  row:       { flexDirection:'row', alignItems:'center', gap:12, paddingVertical:12, borderBottomWidth:0.5, borderBottomColor:'#111' },
  avatar:    { width:48, height:48, borderRadius:24, backgroundColor:'#1A2E1A', alignItems:'center', justifyContent:'center' },
  avatarText:{ color:'#22C55E', fontSize:18, fontWeight:'700' },
  name:      { color:'#fff', fontSize:15, fontWeight:'600' },
  preview:   { color:'#888', fontSize:13, marginTop:2 },
  time:      { color:'#555', fontSize:11 },
  empty:     { alignItems:'center', paddingTop:60, gap:12 },
  emptyText: { color:'#555', fontSize:16 },
});
