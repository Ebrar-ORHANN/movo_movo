// ── app/route/walk/[id].js ───────────────────────────────────────────────────
// Aktif yürüyüş modu
// DB: route_stops (arrived_at, skipped_at, suggested_time, est_duration_min)
// GPS: PATCH /routes/{id}/recording/location (periyodik)
// Yorum: POST /pois/{id}/comments (sadece arrived_at dolu ise backend izin verir)

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { getRoute, markStopArrived, skipStop, stopRecording, updateRecordingLoc, formatDuration } from '../../../services/routeService';

export default function RouteWalkScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const [route,    setRoute]    = useState(null);
  const [stops,    setStops]    = useState([]);
  const [curIdx,   setCurIdx]   = useState(0);   // aktif durak
  const [elapsed,  setElapsed]  = useState(0);   // saniye
  const [distM,    setDistM]    = useState(0);
  const timerRef   = useRef(null);
  const locSubRef  = useRef(null);
  const startTime  = useRef(Date.now());
  const lastLoc    = useRef(null);

  useEffect(() => {
    getRoute(id).then(r => {
      setRoute(r);
      setStops(r.stops || []);
    }).catch(console.warn);

    // GPS izleme — her 15sn'de backend'e gönder
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 10 },
      async (loc) => {
        if (lastLoc.current) {
          const d = haversineM(
            lastLoc.current.coords.latitude, lastLoc.current.coords.longitude,
            loc.coords.latitude, loc.coords.longitude,
          );
          setDistM(p => p + d);
        }
        lastLoc.current = loc;
        updateRecordingLoc(id, loc.coords.latitude, loc.coords.longitude).catch(()=>{});
      }
    ).then(sub => { locSubRef.current = sub; });

    // Süre sayacı
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now()-startTime.current)/1000)), 1000);

    return () => {
      timerRef.current && clearInterval(timerRef.current);
      locSubRef.current?.remove();
    };
  }, [id]);

  const currentStop = stops[curIdx];

  const handleArrived = async () => {
    if (!currentStop) return;
    await markStopArrived(currentStop.id);
    setStops(p => p.map((s,i) => i===curIdx ? {...s, arrived_at: new Date().toISOString()} : s));
    Alert.alert('Varıldı!', 'Bu durağa ulaştın. Yorum yazabilirsin.');
  };

  const handleSkip = async () => {
    if (!currentStop) return;
    await skipStop(currentStop.id);
    setStops(p => p.map((s,i) => i===curIdx ? {...s, skipped_at: new Date().toISOString()} : s));
    if (curIdx < stops.length - 1) setCurIdx(curIdx + 1);
  };

  const handleFinish = async () => {
    Alert.alert('Rotayı Bitir', 'Rotayı tamamlamak istediğine emin misin?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Bitir', style: 'destructive',
        onPress: async () => {
          await stopRecording(id, Math.round(distM), elapsed);
          router.replace(`/route/${id}`);
        },
      },
    ]);
  };

  const coords = stops.filter(s=>s.lat&&s.lng).map(s => ({ latitude: s.lat, longitude: s.lng }));
  const arrivedCount = stops.filter(s => s.arrived_at).length;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Harita */}
      <MapView style={s.map} provider="google" showsUserLocation followsUserLocation
        initialRegion={coords[0] ? {
          latitude: coords[0].latitude, longitude: coords[0].longitude,
          latitudeDelta: 0.02, longitudeDelta: 0.02,
        } : undefined}>
        {coords.length > 1 && <Polyline coordinates={coords} strokeColor="#22C55E" strokeWidth={3} strokeDashArray={[0]} />}
        {stops.map((st, i) => st.lat && (
          <Marker key={i} coordinate={{ latitude: st.lat, longitude: st.lng }}>
            <View style={[s.pin, {
              backgroundColor: st.arrived_at ? '#22C55E' : st.skipped_at ? '#555' : i===curIdx ? '#FF9800' : '#1A1A1A',
              borderColor: i===curIdx ? '#FF9800' : '#333',
            }]}>
              <Text style={s.pinTxt}>{i+1}</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Üst HUD */}
      <View style={s.hud}>
        <View style={s.hudItem}>
          <Text style={s.hudVal}>{formatDuration(elapsed)}</Text>
          <Text style={s.hudLbl}>Süre</Text>
        </View>
        <View style={s.hudItem}>
          <Text style={s.hudVal}>{distM >= 1000 ? `${(distM/1000).toFixed(1)}km` : `${Math.round(distM)}m`}</Text>
          <Text style={s.hudLbl}>Mesafe</Text>
        </View>
        <View style={s.hudItem}>
          <Text style={s.hudVal}>{arrivedCount}/{stops.length}</Text>
          <Text style={s.hudLbl}>Durak</Text>
        </View>
        <TouchableOpacity style={s.finishBtn} onPress={handleFinish}>
          <Text style={s.finishTxt}>Bitir</Text>
        </TouchableOpacity>
      </View>

      {/* Aktif durak paneli */}
      <View style={s.panel}>
        {currentStop ? (
          <>
            <View style={s.stopProgress}>
              <Text style={s.progressTxt}>Durak {curIdx+1}/{stops.length}</Text>
              {currentStop.suggested_time && (
                <Text style={s.suggestedTime}>Önerilen: {currentStop.suggested_time}</Text>
              )}
            </View>
            <Text style={s.stopName}>{currentStop.name || `Durak ${curIdx+1}`}</Text>
            {currentStop.est_duration_min && (
              <Text style={s.stopDuration}>~{currentStop.est_duration_min} dk geçireceksin</Text>
            )}
            {currentStop.llm_comment ? (
              <Text style={s.stopComment} numberOfLines={2}>{currentStop.llm_comment.split('|')[0]}</Text>
            ) : null}

            {/* Durum */}
            {currentStop.arrived_at ? (
              <View style={s.arrivedBadge}>
                <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                <Text style={s.arrivedTxt}>Varıldı · Yorum yazabilirsin</Text>
              </View>
            ) : currentStop.skipped_at ? (
              <View style={[s.arrivedBadge, { backgroundColor:'#2A2A2A' }]}>
                <Ionicons name="arrow-forward-circle" size={16} color="#888" />
                <Text style={[s.arrivedTxt, { color:'#888' }]}>Atlandı</Text>
              </View>
            ) : null}

            {/* Aksiyon butonları */}
            <View style={s.actions}>
              {curIdx > 0 && (
                <TouchableOpacity style={s.navBtn} onPress={() => setCurIdx(curIdx-1)}>
                  <Ionicons name="arrow-back" size={18} color="#fff" />
                  <Text style={s.navTxt}>Önceki</Text>
                </TouchableOpacity>
              )}
              {!currentStop.arrived_at && !currentStop.skipped_at && (
                <>
                  <TouchableOpacity style={s.arriveBtn} onPress={handleArrived}>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={s.arriveTxt}>Varıştım</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.skipBtn} onPress={handleSkip}>
                    <Text style={s.skipTxt}>Atla</Text>
                  </TouchableOpacity>
                </>
              )}
              {curIdx < stops.length - 1 && (
                <TouchableOpacity style={s.navBtn} onPress={() => setCurIdx(curIdx+1)}>
                  <Text style={s.navTxt}>Sonraki</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          <View style={{ alignItems:'center', gap:8 }}>
            <Ionicons name="flag-outline" size={40} color="#22C55E" />
            <Text style={{ color:'#fff', fontSize:18, fontWeight:'700' }}>Rota Tamamlandı!</Text>
            <TouchableOpacity style={[s.arriveBtn, { paddingHorizontal:24 }]} onPress={handleFinish}>
              <Text style={s.arriveTxt}>Kaydet ve Bitir</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

function haversineM(lat1,lng1,lat2,lng2) {
  const R=6371000, d2r=Math.PI/180;
  const dlat=(lat2-lat1)*d2r, dlng=(lng2-lng1)*d2r;
  const a=Math.sin(dlat/2)**2+Math.cos(lat1*d2r)*Math.cos(lat2*d2r)*Math.sin(dlng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

const s = StyleSheet.create({
  container:    { flex:1, backgroundColor:'#0D0D0D' },
  map:          { flex:1 },
  hud:          { position:'absolute', top:0, left:0, right:0, flexDirection:'row', alignItems:'center', backgroundColor:'rgba(10,10,10,0.9)', paddingHorizontal:16, paddingVertical:10, gap:4 },
  hudItem:      { flex:1, alignItems:'center' },
  hudVal:       { color:'#22C55E', fontSize:16, fontWeight:'700' },
  hudLbl:       { color:'#888', fontSize:10 },
  finishBtn:    { backgroundColor:'#ef4444', paddingHorizontal:14, paddingVertical:7, borderRadius:12 },
  finishTxt:    { color:'#fff', fontSize:13, fontWeight:'600' },
  pin:          { width:26, height:26, borderRadius:13, alignItems:'center', justifyContent:'center', borderWidth:2 },
  pinTxt:       { color:'#fff', fontSize:11, fontWeight:'700' },
  panel:        { backgroundColor:'#111', padding:20, borderTopLeftRadius:24, borderTopRightRadius:24 },
  stopProgress: { flexDirection:'row', justifyContent:'space-between', marginBottom:6 },
  progressTxt:  { color:'#888', fontSize:12 },
  suggestedTime:{ color:'#22C55E', fontSize:12 },
  stopName:     { color:'#fff', fontSize:20, fontWeight:'700', marginBottom:4 },
  stopDuration: { color:'#888', fontSize:13, marginBottom:4 },
  stopComment:  { color:'#555', fontSize:12, fontStyle:'italic', marginBottom:8 },
  arrivedBadge: { flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'#0A1F0A', borderRadius:10, padding:8, marginBottom:10 },
  arrivedTxt:   { color:'#22C55E', fontSize:13 },
  actions:      { flexDirection:'row', gap:10, marginTop:4 },
  navBtn:       { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:14, paddingVertical:11, borderRadius:12, backgroundColor:'#1A1A1A', borderWidth:0.5, borderColor:'#2A2A2A' },
  navTxt:       { color:'#fff', fontSize:13 },
  arriveBtn:    { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, backgroundColor:'#22C55E', borderRadius:12, paddingVertical:12 },
  arriveTxt:    { color:'#fff', fontSize:14, fontWeight:'600' },
  skipBtn:      { paddingHorizontal:14, paddingVertical:12, borderRadius:12, backgroundColor:'#1A1A1A', borderWidth:0.5, borderColor:'#2A2A2A' },
  skipTxt:      { color:'#888', fontSize:13 },
});
