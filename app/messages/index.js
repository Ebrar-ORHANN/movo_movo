// ── app/messages/index.js ─────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { api } from '../../services/api';

function timeAgo(d) {
  if (!d) return '';
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60)    return 'Az önce';
  if (s < 3600)  return `${Math.floor(s/60)}dk`;
  if (s < 86400) return `${Math.floor(s/3600)}s`;
  return `${Math.floor(s/86400)}g`;
}

function RoomItem({ item }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={r.row}
      onPress={() => router.push(`/messages/${item.id}?name=${encodeURIComponent(item.other_name||item.other_username||'')}`)}
      activeOpacity={0.75}
    >
      {item.other_avatar
        ? <Image source={{ uri: item.other_avatar }} style={r.avatar}/>
        : <View style={[r.avatar, r.avatarFB]}>
            <Text style={r.avatarInit}>{(item.other_name||item.other_username||'?').slice(0,1).toUpperCase()}</Text>
          </View>
      }
      <View style={r.body}>
        <View style={r.topRow}>
          <Text style={r.name}>{item.other_name || item.other_username}</Text>
          <Text style={r.time}>{timeAgo(item.last_message_at)}</Text>
        </View>
        <Text style={r.preview} numberOfLines={1}>{item.last_message_preview || 'Henüz mesaj yok'}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function MessagesScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const [rooms,   setRooms]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh=false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await api.get('/chat/rooms');
      setRooms(Array.isArray(data) ? data : []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={s.center}><ActivityIndicator color="#22C55E"/></View>;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#fff"/>
        </TouchableOpacity>
        <Text style={s.title}>Mesajlar</Text>
      </View>
      <FlatList
        data={rooms}
        keyExtractor={i => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#22C55E"/>}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="chatbubbles-outline" size={52} color="#333"/>
            <Text style={s.emptyTxt}>Henüz mesajlaşma yok</Text>
            <Text style={s.emptySub}>Takipçilerinize veya herkese açık profillere mesaj atabilirsiniz</Text>
          </View>
        }
        renderItem={({ item }) => <RoomItem item={item}/>}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex:1, backgroundColor:'#0A0A0A' },
  center:    { flex:1, alignItems:'center', justifyContent:'center', backgroundColor:'#0A0A0A' },
  header:    { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:14, borderBottomWidth:0.5, borderBottomColor:'#1C1C1C', gap:12 },
  title:     { flex:1, color:'#fff', fontSize:18, fontWeight:'700' },
  empty:     { alignItems:'center', paddingTop:80, paddingHorizontal:32, gap:12 },
  emptyTxt:  { color:'#ccc', fontSize:16, fontWeight:'600' },
  emptySub:  { color:'#555', fontSize:13, textAlign:'center', lineHeight:20 },
});
const r = StyleSheet.create({
  row:       { flexDirection:'row', alignItems:'center', padding:14, gap:12, borderBottomWidth:0.5, borderBottomColor:'#111' },
  avatar:    { width:50, height:50, borderRadius:25 },
  avatarFB:  { backgroundColor:'#1A3A1A', alignItems:'center', justifyContent:'center' },
  avatarInit:{ color:'#22C55E', fontSize:20, fontWeight:'700' },
  body:      { flex:1 },
  topRow:    { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:4 },
  name:      { color:'#fff', fontSize:14, fontWeight:'700' },
  time:      { color:'#555', fontSize:11 },
  preview:   { color:'#666', fontSize:13 },
});