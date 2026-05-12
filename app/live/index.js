// ── app/live/index.js ────────────────────────────────────────────────────────
// DB: live_sessions WHERE status='live' + live_viewers (viewer_cnt trigger)
// RTMP: host MediaMTX'e yayın gönderir, izleyiciler HLS okur

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { getActiveSessions, createLiveSession } from '../../services/liveService';
import { useAuth } from '../../context/AuthContext';

export default function LiveScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    // Demo: Ankara city_id olmalı — gerçekte detect_city'den gelir
    getActiveSessions('demo-city-id')
      .then(setSessions).catch(console.warn)
      .finally(() => setLoading(false));
  }, []);

  const startBroadcast = async () => {
    try {
      const sess = await createLiveSession({
        title: `${profile?.display_name}'ın Yayını`,
        is_recorded: true,
      });
      // rtmp_ingest_url → mobil RTMP kütüphanesiyle yayın başlatılır
      router.push(`/live/${sess.id}`);
    } catch (e) {
      console.warn(e.message);
    }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title}>Canlı Yayınlar</Text>
        <TouchableOpacity style={s.goLiveBtn} onPress={startBroadcast}>
          <Ionicons name="radio" size={16} color="#fff" />
          <Text style={s.goLiveText}>Yayın Başlat</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator color="#22C55E" style={{marginTop:40}} /> : (
        <FlatList
          data={sessions}
          keyExtractor={s => s.id}
          contentContainerStyle={{ padding:16, gap:10 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={ls.card} onPress={() => router.push(`/live/${item.id}`)}>
              <View style={ls.liveIndicator}>
                <View style={ls.liveDot} />
                <Text style={ls.liveText}>CANLI</Text>
              </View>
              <Text style={ls.sessionTitle} numberOfLines={2}>{item.title || 'Canlı Gezi'}</Text>
              <View style={ls.meta}>
                <Text style={ls.host}>{item.host_name}</Text>
                <View style={ls.viewers}>
                  <Ionicons name="eye-outline" size={14} color="#888" />
                  <Text style={ls.viewerCount}>{item.viewer_cnt || 0}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={ls.empty}>
              <Ionicons name="radio-outline" size={48} color="#333" />
              <Text style={ls.emptyText}>Şu an aktif yayın yok</Text>
              <Text style={ls.emptyHint}>İlk yayını başlatan sen ol!</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:  { flex:1, backgroundColor:'#0D0D0D' },
  header:     { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:16, paddingBottom:16 },
  title:      { flex:1, color:'#fff', fontSize:20, fontWeight:'700' },
  goLiveBtn:  { flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'#ef4444', paddingHorizontal:14, paddingVertical:8, borderRadius:20 },
  goLiveText: { color:'#fff', fontSize:13, fontWeight:'600' },
});

const ls = StyleSheet.create({
  card:        { backgroundColor:'#111', borderRadius:16, padding:16, borderWidth:0.5, borderColor:'#2A2A2A' },
  liveIndicator:{ flexDirection:'row', alignItems:'center', gap:6, marginBottom:8 },
  liveDot:     { width:8, height:8, borderRadius:4, backgroundColor:'#ef4444' },
  liveText:    { color:'#ef4444', fontSize:11, fontWeight:'700', letterSpacing:0.5 },
  sessionTitle:{ color:'#fff', fontSize:16, fontWeight:'600', marginBottom:10 },
  meta:        { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  host:        { color:'#888', fontSize:13 },
  viewers:     { flexDirection:'row', alignItems:'center', gap:4 },
  viewerCount: { color:'#888', fontSize:13 },
  empty:       { alignItems:'center', paddingTop:60, gap:10 },
  emptyText:   { color:'#555', fontSize:16 },
  emptyHint:   { color:'#333', fontSize:13 },
});
