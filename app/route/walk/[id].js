// ── app/route/walk/[id].js ───────────────────────────────────────────────────
// Aktif rota takip ekranı — hem kendi rotanı yürü hem başkasının rotasını takip et.
// DB: route_stops (arrived_at, skipped_at), route_snapshots
// GPS: PATCH /routes/{id}/recording/location (periyodik)

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  Animated, Dimensions, ScrollView, Platform,
} from 'react-native';
import MapView, { Marker, Polyline, Circle } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import {
  getRoute, markStopArrived, skipStop, stopRecording,
  updateRecordingLoc, formatDuration,
} from '../../../services/routeService';

const { width, height } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// Yardımcı
// ─────────────────────────────────────────────────────────────────────────────
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000, d2r = Math.PI / 180;
  const dlat = (lat2 - lat1) * d2r, dlng = (lng2 - lng1) * d2r;
  const a = Math.sin(dlat / 2) ** 2 +
    Math.cos(lat1 * d2r) * Math.cos(lat2 * d2r) * Math.sin(dlng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDist(m) {
  return m > 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

const TRANSPORT_COLORS = {
  walking: '#22C55E', cycling: '#3B82F6', driving: '#F97316',
};

// ─────────────────────────────────────────────────────────────────────────────
// Navigasyon oku bileşeni
// ─────────────────────────────────────────────────────────────────────────────
function NavArrow({ bearing, color }) {
  return (
    <Animated.View style={[na.outer, { transform: [{ rotate: `${bearing}deg` }] }]}>
      <View style={[na.arrow, { borderBottomColor: color }]} />
    </Animated.View>
  );
}
const na = StyleSheet.create({
  outer: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  arrow: { width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 18, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Durak kartı — alt sheet'de gösterilir
// ─────────────────────────────────────────────────────────────────────────────
function StopCard({ stop, index, total, distToNext, onArrived, onSkip, onPrev, onNext }) {
  const isFirst  = index === 0;
  const isLast   = index === total - 1;
  const arrived  = !!stop?.arrived_at;
  const skipped  = !!stop?.skipped_at;
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
  }, [index]);

  return (
    <Animated.View style={[sc.card, {
      opacity: slideAnim,
      transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
    }]}>
      {/* Progress pills */}
      <View style={sc.pills}>
        {Array.from({ length: total }).map((_, i) => (
          <View key={i} style={[sc.pill, {
            backgroundColor: i < index ? '#22C55E'
              : i === index ? '#fff'
              : '#2A2A2A',
            flex: i === index ? 2 : 1,
          }]} />
        ))}
      </View>

      <View style={sc.header}>
        <View style={sc.indexBadge}>
          <Text style={sc.indexNum}>{index + 1}</Text>
          <Text style={sc.indexOf}>/{total}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={sc.stopName} numberOfLines={1}>{stop?.name || `Durak ${index + 1}`}</Text>
          {stop?.llm_comment && (
            <Text style={sc.stopComment} numberOfLines={2}>{stop.llm_comment}</Text>
          )}
          {stop?.notes && !stop?.llm_comment && (
            <Text style={sc.stopComment} numberOfLines={2}>{stop.notes}</Text>
          )}
        </View>
        {distToNext && (
          <View style={sc.distBadge}>
            <Ionicons name="navigate-outline" size={11} color="#22C55E" />
            <Text style={sc.distVal}>{fmtDist(distToNext)}</Text>
          </View>
        )}
      </View>

      {/* Durum badge */}
      {arrived && (
        <View style={[sc.statusBadge, { backgroundColor: '#0A2A1A', borderColor: '#22C55E' }]}>
          <Ionicons name="checkmark-circle" size={15} color="#22C55E" />
          <Text style={[sc.statusTxt, { color: '#22C55E' }]}>Varıldı! Yorum yapabilirsin.</Text>
        </View>
      )}
      {skipped && (
        <View style={[sc.statusBadge, { backgroundColor: '#1A1A1A', borderColor: '#333' }]}>
          <Ionicons name="arrow-forward-circle" size={15} color="#888" />
          <Text style={[sc.statusTxt, { color: '#888' }]}>Bu durak atlandı</Text>
        </View>
      )}

      {/* Aksiyonlar */}
      <View style={sc.actions}>
        {!isFirst && (
          <TouchableOpacity style={sc.navBtn} onPress={onPrev}>
            <Ionicons name="arrow-back" size={18} color="#888" />
          </TouchableOpacity>
        )}

        {!arrived && !skipped && (
          <>
            <TouchableOpacity style={sc.arriveBtn} onPress={onArrived}>
              <Ionicons name="flag" size={17} color="#fff" />
              <Text style={sc.arriveTxt}>Varıştım</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sc.skipBtn} onPress={onSkip}>
              <Ionicons name="play-skip-forward-outline" size={16} color="#888" />
              <Text style={sc.skipTxt}>Atla</Text>
            </TouchableOpacity>
          </>
        )}

        {(arrived || skipped) && !isLast && (
          <TouchableOpacity style={[sc.arriveBtn, { backgroundColor: '#1A3A2A' }]} onPress={onNext}>
            <Text style={[sc.arriveTxt, { color: '#22C55E' }]}>Sonraki Durak</Text>
            <Ionicons name="arrow-forward" size={17} color="#22C55E" />
          </TouchableOpacity>
        )}

        {!isLast && (arrived || skipped) ? null : !isLast && (
          <TouchableOpacity style={sc.navBtn} onPress={onNext}>
            <Ionicons name="arrow-forward" size={18} color="#888" />
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}
const sc = StyleSheet.create({
  card:       { paddingHorizontal: 20, paddingVertical: 16 },
  pills:      { flexDirection: 'row', gap: 4, marginBottom: 16, height: 3 },
  pill:       { borderRadius: 2, height: 3 },
  header:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  indexBadge: { flexDirection: 'row', alignItems: 'baseline', gap: 1 },
  indexNum:   { color: '#fff', fontSize: 28, fontWeight: '800', lineHeight: 32 },
  indexOf:    { color: '#444', fontSize: 14, fontWeight: '600' },
  stopName:   { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  stopComment:{ color: '#666', fontSize: 12, lineHeight: 17 },
  distBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#0A2A1A', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5 },
  distVal:    { color: '#22C55E', fontSize: 11, fontWeight: '700' },
  statusBadge:{ flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, padding: 9, borderWidth: 0.5, marginBottom: 10 },
  statusTxt:  { fontSize: 12, fontWeight: '500' },
  actions:    { flexDirection: 'row', gap: 8 },
  navBtn:     { width: 44, height: 44, backgroundColor: '#1A1A1A', borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: '#2A2A2A' },
  arriveBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#22C55E', borderRadius: 14, paddingVertical: 13 },
  arriveTxt:  { color: '#fff', fontSize: 14, fontWeight: '700' },
  skipBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, backgroundColor: '#1A1A1A', borderRadius: 14, paddingVertical: 13, borderWidth: 0.5, borderColor: '#2A2A2A' },
  skipTxt:    { color: '#888', fontSize: 13 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Ana Ekran
// ─────────────────────────────────────────────────────────────────────────────
export default function RouteWalkScreen() {
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const { id }   = useLocalSearchParams();
  const mapRef   = useRef(null);

  const [route, setRoute]         = useState(null);
  const [stops, setStops]         = useState([]);
  const [curIdx, setCurIdx]       = useState(0);
  const [elapsed, setElapsed]     = useState(0);
  const [distM, setDistM]         = useState(0);
  const [heading, setHeading]     = useState(0);
  const [userLoc, setUserLoc]     = useState(null);
  const [trailCoords, setTrail]   = useState([]);
  const [followMap, setFollowMap] = useState(true);

  const timerRef   = useRef(null);
  const locSubRef  = useRef(null);
  const startTime  = useRef(Date.now());
  const lastLoc    = useRef(null);

  // ── Yükle ────────────────────────────────────────────────────────────────
  useEffect(() => {
    getRoute(id).then(r => {
      setRoute(r);
      setStops(r.stops || []);
    }).catch(console.warn);

    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 8, timeInterval: 4000 },
      async (loc) => {
        const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setUserLoc(coord);
        if (loc.coords.heading != null) setHeading(loc.coords.heading);

        if (lastLoc.current) {
          const d = haversineM(
            lastLoc.current.coords.latitude, lastLoc.current.coords.longitude,
            loc.coords.latitude, loc.coords.longitude
          );
          if (d > 2) setDistM(p => p + d);
        }
        lastLoc.current = loc;
        setTrail(prev => [...prev, coord]);

        if (followMap) {
          mapRef.current?.animateCamera({
            center: coord,
            heading: loc.coords.heading || 0,
            pitch: 35,
            zoom: 17,
          }, { duration: 800 });
        }

        updateRecordingLoc(id, loc.coords.latitude, loc.coords.longitude).catch(() => {});
      }
    ).then(sub => { locSubRef.current = sub; });

    timerRef.current = setInterval(
      () => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)),
      1000
    );

    return () => {
      timerRef.current && clearInterval(timerRef.current);
      locSubRef.current?.remove();
    };
  }, [id]);

  // ── Aksiyonlar ───────────────────────────────────────────────────────────
  const handleArrived = async () => {
    const stop = stops[curIdx];
    if (!stop) return;
    await markStopArrived(stop.id);
    setStops(p => p.map((s, i) => i === curIdx ? { ...s, arrived_at: new Date().toISOString() } : s));
  };

  const handleSkip = async () => {
    const stop = stops[curIdx];
    if (!stop) return;
    await skipStop(stop.id);
    setStops(p => p.map((s, i) => i === curIdx ? { ...s, skipped_at: new Date().toISOString() } : s));
    if (curIdx < stops.length - 1) setCurIdx(i => i + 1);
  };

  const handleNext = () => {
    if (curIdx < stops.length - 1) {
      const next = stops[curIdx + 1];
      setCurIdx(i => i + 1);
      if (next?.lat && next?.lng) {
        mapRef.current?.animateToRegion({
          latitude: next.lat, longitude: next.lng,
          latitudeDelta: 0.008, longitudeDelta: 0.008,
        }, 800);
      }
    }
  };

  const handlePrev = () => curIdx > 0 && setCurIdx(i => i - 1);

  const handleFinish = () => {
    Alert.alert('Rotayı Tamamla', 'Rotayı bitirmek istiyor musun?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Bitir', style: 'default',
        onPress: async () => {
          locSubRef.current?.remove();
          clearInterval(timerRef.current);
          try { await stopRecording(id, Math.round(distM), elapsed); } catch {}
          router.replace(`/route/${id}`);
        },
      },
    ]);
  };

  // ── Harita verileri ───────────────────────────────────────────────────────
  const routeColor  = TRANSPORT_COLORS[route?.transport_mode] || '#22C55E';
  const stopCoords  = stops.filter(s => s.lat && s.lng).map(s => ({ latitude: s.lat, longitude: s.lng }));
  const arrivedCount = stops.filter(s => s.arrived_at).length;
  const currentStop  = stops[curIdx];

  const distToNextStop = useCallback(() => {
    const next = stops[curIdx];
    if (!next?.lat || !userLoc) return null;
    return haversineM(userLoc.latitude, userLoc.longitude, next.lat, next.lng);
  }, [curIdx, stops, userLoc]);

  // ── UI ───────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      {/* ── Harita ── */}
      <MapView
        ref={mapRef}
        style={[StyleSheet.absoluteFill, { height: height * 0.62 }]}
        showsUserLocation={false}
        showsCompass={false}
        showsScale={false}
        initialRegion={stopCoords[0] ? {
          latitude: stopCoords[0].latitude, longitude: stopCoords[0].longitude,
          latitudeDelta: 0.02, longitudeDelta: 0.02,
        } : undefined}
      >
        {/* Planlı rota çizgisi (soluk) */}
        {stopCoords.length > 1 && (
          <Polyline
            coordinates={stopCoords}
            strokeColor={`${routeColor}40`}
            strokeWidth={3}
            lineDashPattern={[8, 6]}
          />
        )}

        {/* Gerçek trail */}
        {trailCoords.length > 1 && (
          <>
            <Polyline
              coordinates={trailCoords}
              strokeColor={`${routeColor}55`}
              strokeWidth={8}
              lineJoin="round"
            />
            <Polyline
              coordinates={trailCoords}
              strokeColor={routeColor}
              strokeWidth={3.5}
              lineJoin="round"
            />
          </>
        )}

        {/* Stop markerlar */}
        {stops.map((stop, i) => {
          if (!stop.lat || !stop.lng) return null;
          const isActive  = i === curIdx;
          const isArrived = !!stop.arrived_at;
          const isSkipped = !!stop.skipped_at;
          const bg = isArrived ? '#22C55E' : isSkipped ? '#555' : isActive ? routeColor : '#1A1A1A';
          return (
            <Marker
              key={stop.id || i}
              coordinate={{ latitude: stop.lat, longitude: stop.lng }}
              onPress={() => setCurIdx(i)}
              tracksViewChanges={false}
            >
              <View style={[mp.pin, { backgroundColor: bg, borderColor: isActive ? '#fff' : '#333', width: isActive ? 36 : 26, height: isActive ? 36 : 26, borderRadius: isActive ? 18 : 13 }]}>
                {isArrived
                  ? <Ionicons name="checkmark" size={isActive ? 18 : 13} color="#fff" />
                  : isSkipped
                    ? <Ionicons name="close" size={isActive ? 16 : 12} color="#fff" />
                    : <Text style={[mp.pinTxt, { fontSize: isActive ? 14 : 11 }]}>{i + 1}</Text>
                }
              </View>
              {isActive && <View style={mp.activeRing} />}
            </Marker>
          );
        })}

        {/* Kullanıcı konumu — özel ok */}
        {userLoc && (
          <Marker
            coordinate={userLoc}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={mp.userMarker}>
              <View style={[mp.userDot, { backgroundColor: routeColor }]}>
                <View style={mp.userDotInner} />
              </View>
              {/* Yön çizgisi */}
              <View style={[mp.userHeading, { transform: [{ rotate: `${heading}deg` }] }]}>
                <View style={[mp.headingArrow, { borderBottomColor: routeColor }]} />
              </View>
            </View>
          </Marker>
        )}

        {/* Aktif durağa yaklaşım çemberi */}
        {currentStop?.lat && currentStop?.lng && (
          <Circle
            center={{ latitude: currentStop.lat, longitude: currentStop.lng }}
            radius={20}
            fillColor={`${routeColor}22`}
            strokeColor={routeColor}
            strokeWidth={1.5}
          />
        )}
      </MapView>

      {/* ── Üst HUD ── */}
      <View style={[s.hud, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity style={s.hudBack} onPress={handleFinish}>
          <Ionicons name="close" size={20} color="#fff" />
        </TouchableOpacity>

        <View style={s.hudStats}>
          <View style={s.hudStat}>
            <Text style={s.hudVal}>{formatDuration(elapsed)}</Text>
            <Text style={s.hudLabel}>Süre</Text>
          </View>
          <View style={s.hudDiv} />
          <View style={s.hudStat}>
            <Text style={s.hudVal}>{fmtDist(distM)}</Text>
            <Text style={s.hudLabel}>Mesafe</Text>
          </View>
          <View style={s.hudDiv} />
          <View style={s.hudStat}>
            <Text style={[s.hudVal, { color: routeColor }]}>{arrivedCount}/{stops.length}</Text>
            <Text style={s.hudLabel}>Durak</Text>
          </View>
        </View>

        <TouchableOpacity style={s.hudFollow} onPress={() => setFollowMap(!followMap)}>
          <Ionicons name={followMap ? 'navigate' : 'navigate-outline'} size={18} color={followMap ? routeColor : '#555'} />
        </TouchableOpacity>
      </View>

      {/* ── Alt panel ── */}
      <View style={s.sheet}>
        <LinearGradient
          colors={['rgba(10,10,10,0)', '#0A0A0A']}
          style={s.sheetGrad}
          pointerEvents="none"
        />
        <View style={s.sheetHandle} />

        {currentStop ? (
          <StopCard
            stop={currentStop}
            index={curIdx}
            total={stops.length}
            distToNext={distToNextStop()}
            onArrived={handleArrived}
            onSkip={handleSkip}
            onPrev={handlePrev}
            onNext={handleNext}
          />
        ) : (
          <View style={s.finishedBox}>
            <Text style={s.finishedEmoji}>🏁</Text>
            <Text style={s.finishedTitle}>Rota Tamamlandı!</Text>
            <Text style={s.finishedSub}>{fmtDist(distM)} · {formatDuration(elapsed)}</Text>
            <TouchableOpacity style={s.finishBtn} onPress={handleFinish}>
              <Text style={s.finishBtnTxt}>Kaydet & Bitir</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tüm durağı bitirmediyse "Bitir" */}
        {currentStop && arrivedCount < stops.length && (
          <TouchableOpacity
            style={[s.endBtn, { marginBottom: insets.bottom + 8 }]}
            onPress={handleFinish}
          >
            <Ionicons name="flag-outline" size={15} color="#888" />
            <Text style={s.endBtnTxt}>Erken Bitir</Text>
          </TouchableOpacity>
        )}

        {!currentStop && (
          <View style={{ height: insets.bottom + 8 }} />
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stiller
// ─────────────────────────────────────────────────────────────────────────────
const mp = StyleSheet.create({
  pin:         { alignItems: 'center', justifyContent: 'center', borderWidth: 2, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 5, elevation: 6 },
  pinTxt:      { color: '#fff', fontWeight: '800' },
  activeRing:  { position: 'absolute', width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', top: -7, left: -7 },
  userMarker:  { alignItems: 'center', justifyContent: 'center', width: 40, height: 40 },
  userDot:     { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 5, elevation: 7 },
  userDotInner:{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  userHeading: { position: 'absolute', top: 0, alignItems: 'center' },
  headingArrow:{ width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderBottomWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
});

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0A0A0A' },

  // HUD
  hud:          { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 12, zIndex: 20, backgroundColor: 'rgba(0,0,0,0.6)' },
  hudBack:      { width: 38, height: 38, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  hudStats:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  hudStat:      { alignItems: 'center' },
  hudVal:       { color: '#fff', fontSize: 15, fontWeight: '800' },
  hudLabel:     { color: '#555', fontSize: 9, fontWeight: '600', marginTop: 1 },
  hudDiv:       { width: 0.5, height: 20, backgroundColor: '#2A2A2A' },
  hudFollow:    { width: 38, height: 38, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 19, alignItems: 'center', justifyContent: 'center' },

  // Sheet
  sheet:        { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#0A0A0A', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 0.5, borderTopColor: '#1C1C1C' },
  sheetGrad:    { position: 'absolute', top: -60, left: 0, right: 0, height: 60 },
  sheetHandle:  { width: 36, height: 4, backgroundColor: '#2A2A2A', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },

  // Finished
  finishedBox:  { alignItems: 'center', paddingVertical: 30, paddingHorizontal: 20, gap: 8 },
  finishedEmoji:{ fontSize: 44, marginBottom: 4 },
  finishedTitle:{ color: '#fff', fontSize: 22, fontWeight: '800' },
  finishedSub:  { color: '#666', fontSize: 14 },
  finishBtn:    { backgroundColor: '#22C55E', borderRadius: 16, paddingHorizontal: 32, paddingVertical: 14, marginTop: 10 },
  finishBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // End early
  endBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginHorizontal: 20, backgroundColor: '#111', borderRadius: 12, borderWidth: 0.5, borderColor: '#1C1C1C' },
  endBtnTxt:    { color: '#888', fontSize: 13 },
});