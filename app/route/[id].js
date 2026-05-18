// ── app/route/[id].js ────────────────────────────────────────────────────────
// DB: routes JOIN route_stops (suggested_time, est_duration_min, skipped_at)
// LLM: llm_plan JSONB → highlights, vibe, best_start_time
// Kaydet: route_snapshots INSERT (stops_data JSONB)

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getRoute, saveRoute, startRecording, formatDistance, formatDuration, getDifficulty, TRANSPORT_ICONS } from '../../services/routeService';
import { likeContent, saveContent } from '../../services/feedService';

export default function RouteDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved]     = useState(false);
  const [liked, setLiked]     = useState(false);

  useEffect(() => {
    getRoute(id).then(setRoute).catch(console.warn).finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    await saveRoute(id);
    setSaved(true);
  };

  const handleLike = () => {
    setLiked(!liked);
    liked ? null : likeContent('route', id);
  };

 const handleStart = () => router.push(`/route/navigate/${id}`);

  if (loading) return (
    <View style={[s.container, s.centered, { paddingTop: insets.top }]}>
      <ActivityIndicator color="#22C55E" size="large" />
    </View>
  );

  const llm = route?.llm_plan || {};
  const coords = route?.stops?.filter(s=>s.lat&&s.lng).map(s=>({ latitude:s.lat, longitude:s.lng })) || [];
  const difficulty = getDifficulty(route?.distance_m, route?.duration_sec);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Harita */}
      {coords.length > 0 ? (
        <MapView style={s.map} provider="google"
          initialRegion={{ latitude:coords[0].latitude, longitude:coords[0].longitude, latitudeDelta:0.05, longitudeDelta:0.05 }}>
          <Polyline coordinates={coords} strokeColor="#22C55E" strokeWidth={3} />
          {coords.map((c,i) => (
            <Marker key={i} coordinate={c}>
              <View style={[s.mapPin, { backgroundColor: i===0?'#22C55E':i===coords.length-1?'#2196F3':'#FF9800' }]}>
                <Text style={s.mapPinText}>{i+1}</Text>
              </View>
            </Marker>
          ))}
        </MapView>
      ) : (
        <View style={[s.map, s.mapPlaceholder]}>
          <Text style={{ color:'#555' }}>Harita yükleniyor...</Text>
        </View>
      )}

      <ScrollView style={s.details}>
        {/* Başlık */}
        <View style={s.titleRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.title} numberOfLines={2}>{route?.title || 'Rota Detayı'}</Text>
        </View>

        {/* Bilgi badgeleri */}
        <View style={s.badges}>
          <View style={s.badge}><Text style={s.badgeT}>{TRANSPORT_ICONS[route?.transport_mode]||'🗺️'} {route?.transport_mode||'yürüyüş'}</Text></View>
          <View style={s.badge}><Text style={s.badgeT}>{formatDistance(route?.distance_m)}</Text></View>
          <View style={s.badge}><Text style={s.badgeT}>{formatDuration(route?.duration_sec)}</Text></View>
          <View style={[s.badge, { backgroundColor: difficulty==='Zor'?'#7f1d1d':difficulty==='Orta'?'#78350f':'#14532d' }]}>
            <Text style={s.badgeT}>{difficulty}</Text>
          </View>
        </View>

        {/* LLM bilgiler */}
        {llm.highlights?.length > 0 && (
          <View style={s.aiCard}>
            <Ionicons name="sparkles" size={16} color="#22C55E" />
            <Text style={s.aiText}>{llm.highlights.join(' · ')}</Text>
          </View>
        )}
        {llm.best_start_time && (
          <Text style={s.startTime}>En iyi başlangıç: {llm.best_start_time} · {llm.vibe}</Text>
        )}

        {/* Duraklar */}
        <Text style={s.stopsLabel}>DURAKLAR ({route?.stops?.length || 0})</Text>
        {route?.stops?.map((stop, i) => (
          <View key={stop.id || i} style={s.stopRow}>
            <View style={[s.stopDot, { backgroundColor: i===0?'#22C55E': i===(route.stops.length-1)?'#2196F3':'#FF9800' }]} />
            <View style={{ flex:1 }}>
              <Text style={s.stopName}>{stop.name || `Durak ${i+1}`}</Text>
              <Text style={s.stopMeta}>
                {stop.suggested_time ? `${stop.suggested_time} · ` : ''}
                {stop.est_duration_min ? `~${stop.est_duration_min} dk` : ''}
              </Text>
              {stop.llm_comment ? <Text style={s.stopComment} numberOfLines={2}>{stop.llm_comment}</Text> : null}
            </View>
          </View>
        ))}

        {/* Aksiyonlar */}
        <View style={s.actions}>
          <TouchableOpacity style={s.actionBtn} onPress={handleLike}>
            <Ionicons name={liked?'heart':'heart-outline'} size={22} color={liked?'#ef4444':'#ccc'} />
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={handleSave}>
            <Ionicons name={saved?'bookmark':'bookmark-outline'} size={22} color={saved?'#22C55E':'#ccc'} />
          </TouchableOpacity>
          <TouchableOpacity style={s.shareBtn}>
            <Ionicons name="share-outline" size={22} color="#ccc" />
          </TouchableOpacity>
          <TouchableOpacity style={s.startBtn} onPress={handleStart}>
            <Ionicons name="navigate" size={18} color="#fff" />
            <Text style={s.startText}>Rotayı Başlat</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex:1, backgroundColor:'#0D0D0D' },
  centered:    { alignItems:'center', justifyContent:'center' },
  map:         { height:240 },
  mapPlaceholder: { backgroundColor:'#111', alignItems:'center', justifyContent:'center' },
  mapPin:      { width:24, height:24, borderRadius:12, alignItems:'center', justifyContent:'center' },
  mapPinText:  { color:'#fff', fontSize:11, fontWeight:'700' },
  details:     { flex:1, backgroundColor:'#0D0D0D' },
  titleRow:    { flexDirection:'row', alignItems:'flex-start', gap:12, padding:16 },
  backBtn:     { marginTop:3 },
  title:       { flex:1, color:'#fff', fontSize:20, fontWeight:'700', lineHeight:26 },
  badges:      { flexDirection:'row', flexWrap:'wrap', gap:8, paddingHorizontal:16, marginBottom:12 },
  badge:       { backgroundColor:'#1A1A1A', paddingHorizontal:12, paddingVertical:5, borderRadius:10, borderWidth:0.5, borderColor:'#2A2A2A' },
  badgeT:      { color:'#ccc', fontSize:12 },
  aiCard:      { flexDirection:'row', alignItems:'flex-start', gap:8, backgroundColor:'#0A1F0A', borderRadius:10, padding:12, marginHorizontal:16, marginBottom:8 },
  aiText:      { color:'#22C55E', fontSize:12, flex:1, lineHeight:18 },
  startTime:   { color:'#888', fontSize:12, paddingHorizontal:16, marginBottom:12 },
  stopsLabel:  { color:'#555', fontSize:10, fontWeight:'600', letterSpacing:0.5, paddingHorizontal:16, marginBottom:8 },
  stopRow:     { flexDirection:'row', gap:12, paddingHorizontal:16, marginBottom:12 },
  stopDot:     { width:10, height:10, borderRadius:5, marginTop:5, flexShrink:0 },
  stopName:    { color:'#fff', fontSize:14, fontWeight:'500' },
  stopMeta:    { color:'#888', fontSize:12, marginTop:2 },
  stopComment: { color:'#555', fontSize:11, marginTop:3, fontStyle:'italic' },
  actions:     { flexDirection:'row', alignItems:'center', gap:12, padding:16, borderTopWidth:0.5, borderTopColor:'#111', marginTop:8 },
  actionBtn:   { width:44, height:44, alignItems:'center', justifyContent:'center', backgroundColor:'#111', borderRadius:22 },
  shareBtn:    { width:44, height:44, alignItems:'center', justifyContent:'center', backgroundColor:'#111', borderRadius:22 },
  startBtn:    { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:'#22C55E', borderRadius:14, paddingVertical:13 },
  startText:   { color:'#fff', fontSize:15, fontWeight:'600' },
});
