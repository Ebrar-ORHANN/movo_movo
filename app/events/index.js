// ── app/events/index.js ──────────────────────────────────────────────────────
// DB: events WHERE ST_DWithin + status filtresi
// İçe aktarılan: eventService.getNearbyEvents, getEventsByCity

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { getNearbyEvents, EVENT_CATEGORY_MAP } from '../../services/eventService';

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getNearbyEvents(39.92, 32.85, 50000)
      .then(setEvents).catch(console.warn)
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title}>Etkinlikler</Text>
        <TouchableOpacity onPress={() => router.push('/events/create')}>
          <Ionicons name="add-circle-outline" size={26} color="#22C55E" />
        </TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator color="#22C55E" style={{marginTop:40}} /> : (
        <FlatList
          data={events}
          keyExtractor={e => e.id}
          contentContainerStyle={{ paddingHorizontal:16, gap:10 }}
          renderItem={({ item }) => {
            const cat = EVENT_CATEGORY_MAP[item.categories?.[0]] || EVENT_CATEGORY_MAP.other;
            return (
              <TouchableOpacity style={s.card} onPress={() => router.push(`/events/${item.id}`)}>
                <View style={[s.catIcon, { backgroundColor: cat.color+'22' }]}>
                  <Text style={{ fontSize:20 }}>{cat.icon}</Text>
                </View>
                <View style={{ flex:1 }}>
                  <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.cardMeta}>
                    {item.start_time ? new Date(item.start_time).toLocaleDateString('tr-TR') : ''} ·{' '}
                    {item.attendee_cnt || 0}/{item.max_participants || '∞'} kişi
                  </Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: item.status==='upcoming'?'#22C55E':'#FF9800' }]}>
                  <Text style={s.statusText}>Katıl</Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={s.empty}>Yakında etkinlik yok</Text>}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex:1, backgroundColor:'#0D0D0D' },
  header:      { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:16, paddingBottom:16 },
  title:       { flex:1, color:'#fff', fontSize:20, fontWeight:'700' },
  card:        { flexDirection:'row', alignItems:'center', backgroundColor:'#111', borderRadius:14, padding:14, gap:12, borderWidth:0.5, borderColor:'#1A1A1A' },
  catIcon:     { width:48, height:48, borderRadius:24, alignItems:'center', justifyContent:'center' },
  cardTitle:   { color:'#fff', fontSize:15, fontWeight:'600' },
  cardMeta:    { color:'#888', fontSize:12, marginTop:3 },
  statusBadge: { paddingHorizontal:14, paddingVertical:7, borderRadius:20 },
  statusText:  { color:'#fff', fontSize:13, fontWeight:'600' },
  empty:       { textAlign:'center', color:'#555', marginTop:40, fontSize:16 },
});
