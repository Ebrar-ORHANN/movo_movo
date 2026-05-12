// ── app/together.js ──────────────────────────────────────────────────────────
// DB: active_explorers, together_requests, together_sessions, together_session_members
// WebSocket: /together/sessions/{id}/ws → konum paylaşımı

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { getNearbyExplorers, sendTogetherRequest, updateExplorerStatus } from '../services/togetherService';
import useUserLocation from '../hooks/useUserLocation';

export default function TogetherScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { location } = useUserLocation();
  const [explorers, setExplorers] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [isActive, setIsActive]   = useState(false);

  useEffect(() => {
    if (!location) return;
    const { latitude: lat, longitude: lng } = location.coords;
    getNearbyExplorers(lat, lng, 500)
      .then(setExplorers).catch(console.warn)
      .finally(() => setLoading(false));
  }, [location]);

  const toggleActive = async () => {
    if (!location) return;
    const { latitude: lat, longitude: lng } = location.coords;
    await updateExplorerStatus(lat, lng, !isActive);
    setIsActive(!isActive);
  };

  const sendRequest = async (targetId) => {
    if (!location) return;
    try {
      await sendTogetherRequest({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        target_user_id: targetId,
        description: 'Birlikte gezmek ister misin?',
      });
      Alert.alert('Gönderildi', 'Beraber gez isteği gönderildi');
    } catch (e) { Alert.alert('Hata', e.message); }
  };

  const broadcastRequest = async () => {
    if (!location) return;
    try {
      await sendTogetherRequest({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        radius_m: 300,
        description: 'Yakınımdaki herkese beraber gez isteği',
      });
      Alert.alert('Yayınlandı', `${explorers.length} gezgine isteğin gönderildi`);
    } catch (e) { Alert.alert('Hata', e.message); }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title}>Beraber Gez</Text>
        <TouchableOpacity
          style={[s.toggleBtn, isActive && s.toggleActive]}
          onPress={toggleActive}
        >
          <Text style={s.toggleText}>{isActive ? 'Aktif' : 'Pasif'}</Text>
        </TouchableOpacity>
      </View>

      {location && (
        <MapView style={s.map} provider="google"
          initialRegion={{
            latitude: location.coords.latitude, longitude: location.coords.longitude,
            latitudeDelta: 0.01, longitudeDelta: 0.01,
          }}>
          {isActive && (
            <Circle center={{ latitude: location.coords.latitude, longitude: location.coords.longitude }}
              radius={300} fillColor="rgba(34,197,94,0.1)" strokeColor="#22C55E" />
          )}
          {explorers.map(ex => (
            <Marker key={ex.user_id} coordinate={{ latitude: ex.lat||39.9, longitude: ex.lng||32.8 }}>
              <View style={s.explorerPin}>
                <Text style={{ fontSize:10, color:'#22C55E', fontWeight:'700' }}>
                  {(ex.username||'?').slice(0,1).toUpperCase()}
                </Text>
              </View>
            </Marker>
          ))}
        </MapView>
      )}

      <View style={s.panel}>
        <View style={s.panelHeader}>
          <Text style={s.panelTitle}>{explorers.length} Gezgin Yakında</Text>
          <TouchableOpacity style={s.broadcastBtn} onPress={broadcastRequest}>
            <Ionicons name="radio-outline" size={18} color="#fff" />
            <Text style={s.broadcastText}>Broadcast</Text>
          </TouchableOpacity>
        </View>

        {loading ? <ActivityIndicator color="#22C55E" /> : (
          <FlatList
            data={explorers}
            keyExtractor={e => e.user_id}
            horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap:10, paddingVertical:4 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.explorerCard} onPress={() => sendRequest(item.user_id)}>
                <View style={s.explorerAvatar}>
                  <Text style={s.explorerInitial}>{(item.username||'?').slice(0,1).toUpperCase()}</Text>
                </View>
                <Text style={s.explorerName} numberOfLines={1}>{item.username || 'Gezgin'}</Text>
                <Text style={s.explorerDist}>{Math.round(item.distance_m)}m</Text>
                <View style={s.sendBtn}><Text style={s.sendText}>İstek Gönder</Text></View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={s.empty}>Yakında açık gezgin yok</Text>}
          />
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container:     { flex:1, backgroundColor:'#0D0D0D' },
  header:        { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:16, paddingBottom:12 },
  title:         { flex:1, color:'#fff', fontSize:20, fontWeight:'700' },
  toggleBtn:     { paddingHorizontal:14, paddingVertical:7, borderRadius:20, backgroundColor:'#111', borderWidth:0.5, borderColor:'#2A2A2A' },
  toggleActive:  { backgroundColor:'#22C55E', borderColor:'#22C55E' },
  toggleText:    { color:'#fff', fontSize:13, fontWeight:'600' },
  map:           { flex:1, minHeight:300 },
  explorerPin:   { width:28, height:28, borderRadius:14, backgroundColor:'#0A1F0A', borderWidth:1.5, borderColor:'#22C55E', alignItems:'center', justifyContent:'center' },
  panel:         { backgroundColor:'#111', padding:16, borderTopLeftRadius:24, borderTopRightRadius:24 },
  panelHeader:   { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12 },
  panelTitle:    { color:'#fff', fontSize:16, fontWeight:'600' },
  broadcastBtn:  { flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'#1A2E1A', paddingHorizontal:14, paddingVertical:8, borderRadius:20 },
  broadcastText: { color:'#22C55E', fontSize:13, fontWeight:'500' },
  explorerCard:  { backgroundColor:'#1A1A1A', borderRadius:14, padding:12, alignItems:'center', width:100, gap:4, borderWidth:0.5, borderColor:'#2A2A2A' },
  explorerAvatar:{ width:44, height:44, borderRadius:22, backgroundColor:'#0A1F0A', alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:'#22C55E' },
  explorerInitial:{ color:'#22C55E', fontSize:18, fontWeight:'700' },
  explorerName:  { color:'#fff', fontSize:12, fontWeight:'500' },
  explorerDist:  { color:'#888', fontSize:11 },
  sendBtn:       { backgroundColor:'#22C55E', paddingHorizontal:8, paddingVertical:4, borderRadius:10 },
  sendText:      { color:'#fff', fontSize:10, fontWeight:'600' },
  empty:         { color:'#555', fontSize:14, textAlign:'center', paddingVertical:20 },
});
