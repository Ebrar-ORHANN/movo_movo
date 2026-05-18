// ── app/route/walk/[id].js ───────────────────────────────────────────────────
// Google Maps mantığında adım adım navigasyon.
// • Kullanıcının mevcut konumundan rotanın tüm duraklarına sırayla yol tarifi
// • OSRM açık kaynak yönlendirme motoru (veri: OpenStreetMap)
// • Yürüyüş | Bisiklet | Araç modları
// • Gerçek zamanlı konum takibi, otomatik sıradaki durağa geçiş
// • Adım adım talimatlar listesi
// • Varış tespiti (20 m yarıçap)

import React, {
  useEffect, useState, useRef, useCallback, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  Animated, Dimensions, ScrollView, FlatList,
  Platform, ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Polyline, Circle } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import {
  getRoute, markStopArrived, skipStop, stopRecording, updateRecordingLoc,
} from '../../../services/routeService';

const { width, height } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// Sabitler
// ─────────────────────────────────────────────────────────────────────────────
const ARRIVAL_RADIUS_M  = 25;   // bu kadar yaklaşınca "varıldı"
const RECALC_DIST_M     = 40;   // rotadan bu kadar sapınca yeniden hesapla
const UPDATE_INTERVAL   = 4000; // ms — konum güncelleme

const TRANSPORT_MODES = [
  { key: 'walking',  osrm: 'foot',       icon: 'walk-outline',    label: 'Yürüyüş', color: '#22C55E' },
  { key: 'cycling',  osrm: 'bike',       icon: 'bicycle-outline', label: 'Bisiklet', color: '#3B82F6' },
  { key: 'driving',  osrm: 'car',        icon: 'car-outline',     label: 'Araç',    color: '#F97316' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Yardımcı fonksiyonlar
// ─────────────────────────────────────────────────────────────────────────────
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6_371_000, r = Math.PI / 180;
  const dlat = (lat2 - lat1) * r, dlng = (lng2 - lng1) * r;
  const a = Math.sin(dlat / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dlng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDist(m) {
  if (m == null) return '—';
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function fmtTime(sec) {
  if (sec == null) return '—';
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} dk`;
  return `${Math.floor(m / 60)} sa ${m % 60} dk`;
}

// Maneuvra tipine göre ikon
function maneuverIcon(type = '') {
  if (type.includes('left'))       return 'return-up-back-outline';
  if (type.includes('right'))      return 'return-up-forward-outline';
  if (type.includes('uturn'))      return 'refresh-outline';
  if (type.includes('arrive'))     return 'flag-outline';
  if (type.includes('depart'))     return 'navigate-outline';
  if (type.includes('roundabout')) return 'reload-outline';
  return 'arrow-up-outline';
}

// ─────────────────────────────────────────────────────────────────────────────
// OSRM'den rota al
// ─────────────────────────────────────────────────────────────────────────────
async function fetchOSRM(waypoints, osrmProfile = 'foot') {
  // waypoints: [{lat, lng}, ...]
  const coords = waypoints.map(w => `${w.lng},${w.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${coords}`
    + `?steps=true&geometries=geojson&overview=full&annotations=false`;

  const res  = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('OSRM yanıt vermedi');
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('Rota bulunamadı');

  const route = data.routes[0];

  // Polyline koordinatları
  const polyline = route.geometry.coordinates.map(([lng, lat]) => ({
    latitude: lat, longitude: lng,
  }));

  // Adım adım talimatlar
  const steps = [];
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      const type = step.maneuver?.type || '';
      const mod  = step.maneuver?.modifier || '';
      const key  = `${type}${mod ? ` ${mod}` : ''}`;
      const dist = step.distance;
      const instr = step.maneuver?.instruction
        || (type === 'depart' ? 'Rotaya başla' : type === 'arrive' ? 'Hedefe ulaştın' : key);
      steps.push({
        instruction: instr,
        distance:    dist,
        duration:    step.duration,
        maneuver:    key,
        name:        step.name || '',
        coord:       {
          latitude:  step.maneuver.location[1],
          longitude: step.maneuver.location[0],
        },
      });
    }
  }

  return {
    polyline,
    steps,
    totalDist:  route.distance,
    totalTime:  route.duration,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Adım talimatı satırı
// ─────────────────────────────────────────────────────────────────────────────
function StepRow({ step, active }) {
  return (
    <View style={[sr.row, active && sr.rowActive]}>
      <View style={[sr.iconWrap, active && sr.iconWrapActive]}>
        <Ionicons name={maneuverIcon(step.maneuver)} size={16}
          color={active ? '#22C55E' : '#555'} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[sr.instr, active && { color: '#fff' }]} numberOfLines={2}>
          {step.instruction}
        </Text>
        {step.name ? (
          <Text style={sr.name} numberOfLines={1}>{step.name}</Text>
        ) : null}
      </View>
      <Text style={[sr.dist, active && { color: '#22C55E' }]}>
        {fmtDist(step.distance)}
      </Text>
    </View>
  );
}
const sr = StyleSheet.create({
  row:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: '#111' },
  rowActive:   { backgroundColor: '#0A1A0A' },
  iconWrap:    { width: 34, height: 34, backgroundColor: '#111', borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  iconWrapActive:{ backgroundColor: '#0A2A1A' },
  instr:       { color: '#888', fontSize: 13, lineHeight: 18 },
  name:        { color: '#444', fontSize: 11, marginTop: 2 },
  dist:        { color: '#555', fontSize: 12, fontWeight: '600', minWidth: 44, textAlign: 'right' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Sonraki dönüş banner (harita üzerinde)
// ─────────────────────────────────────────────────────────────────────────────
function NextTurnBanner({ step, distToStep, transportColor }) {
  if (!step) return null;
  return (
    <View style={nb.banner}>
      <View style={[nb.iconBox, { backgroundColor: transportColor }]}>
        <Ionicons name={maneuverIcon(step.maneuver)} size={22} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={nb.distTxt}>{fmtDist(distToStep)}</Text>
        <Text style={nb.instrTxt} numberOfLines={1}>{step.instruction}</Text>
        {step.name ? <Text style={nb.nameTxt} numberOfLines={1}>{step.name}</Text> : null}
      </View>
    </View>
  );
}
const nb = StyleSheet.create({
  banner:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#0D0D0D', borderRadius: 20, paddingRight: 16, overflow: 'hidden', borderWidth: 0.5, borderColor: '#1C1C1C', shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 10, elevation: 10 },
  iconBox:  { width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  distTxt:  { color: '#fff', fontSize: 18, fontWeight: '800' },
  instrTxt: { color: '#ccc', fontSize: 13, marginTop: 1 },
  nameTxt:  { color: '#555', fontSize: 11, marginTop: 1 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Ulaşım modu seçici (header'da)
// ─────────────────────────────────────────────────────────────────────────────
function ModePicker({ current, onChange }) {
  return (
    <View style={mp2.row}>
      {TRANSPORT_MODES.map(m => (
        <TouchableOpacity
          key={m.key}
          style={[mp2.btn, current === m.key && { backgroundColor: m.color + '22', borderColor: m.color }]}
          onPress={() => onChange(m.key)}
        >
          <Ionicons name={m.icon} size={15} color={current === m.key ? m.color : '#555'} />
          <Text style={[mp2.label, current === m.key && { color: m.color }]}>{m.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
const mp2 = StyleSheet.create({
  row:   { flexDirection: 'row', gap: 6 },
  btn:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#111', borderRadius: 14, borderWidth: 0.5, borderColor: '#222' },
  label: { color: '#555', fontSize: 11, fontWeight: '600' },
});

// ─────────────────────────────────────────────────────────────────────────────
// ANA EKRAN
// ─────────────────────────────────────────────────────────────────────────────
export default function RouteNavigateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const mapRef  = useRef(null);

  // ── Rota verisi ───────────────────────────────────────────────────────────
  const [route,  setRoute]  = useState(null);
  const [stops,  setStops]  = useState([]);   // [{id, name, lat, lng, ...}]

  // ── Navigasyon durumu ─────────────────────────────────────────────────────
  const [userLoc,    setUserLoc]    = useState(null);
  const [heading,    setHeading]    = useState(0);
  const [curStopIdx, setCurStopIdx] = useState(0);  // hangi durağa gidiyoruz
  const [transport,  setTransport]  = useState('walking');

  // ── OSRM sonuçları ─────────────────────────────────────────────────────────
  const [navData,    setNavData]    = useState(null);   // {polyline, steps, totalDist, totalTime}
  const [navLoading, setNavLoading] = useState(false);
  const [navError,   setNavError]   = useState(null);

  // ── Aktif adım takibi ──────────────────────────────────────────────────────
  const [activeStep, setActiveStep] = useState(0);
  const [distToNext, setDistToNext] = useState(null); // sonraki dönüşe mesafe

  // ── UI durumu ─────────────────────────────────────────────────────────────
  const [showSteps,  setShowSteps]  = useState(false); // adım listesi aç/kapa
  const [mapFollow,  setMapFollow]  = useState(true);
  const [arrived,    setArrived]    = useState([]); // varılan stop indeksleri

  // ── Refs ──────────────────────────────────────────────────────────────────
  const locSubRef      = useRef(null);
  const lastNavReqRef  = useRef(null); // debounce
  const stepsListRef   = useRef(null);

  // ── Rota yükle ────────────────────────────────────────────────────────────
  useEffect(() => {
    getRoute(id)
      .then(r => {
        setRoute(r);
        const s = (r.stops || []).filter(st => st.lat && st.lng);
        setStops(s);
        // Eğer transport_mode varsa kullan
        if (r.transport_mode && TRANSPORT_MODES.find(t => t.key === r.transport_mode)) {
          setTransport(r.transport_mode);
        }
      })
      .catch(() => Alert.alert('Hata', 'Rota yüklenemedi.'));
  }, [id]);

  // ── Konum izni & izleme ───────────────────────────────────────────────────
  useEffect(() => {
    let sub;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Konum izni gerekli', 'Navigasyon için konum iznine ihtiyaç var.');
        return;
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5, timeInterval: UPDATE_INTERVAL },
        (loc) => {
          const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setUserLoc(coord);
          if (loc.coords.heading != null) setHeading(loc.coords.heading);
          updateRecordingLoc(id, coord.latitude, coord.longitude).catch(() => {});
        }
      );
      locSubRef.current = sub;
    })();
    return () => { sub?.remove(); };
  }, [id]);

  // ── Navigasyon hesapla (kullanıcı konumu + hedef durak + ulaşım modu) ────
  const calcNav = useCallback(async (fromCoord, stopIdx, mode) => {
    const targetStops = stops.slice(stopIdx); // mevcut + sonraki tüm duraklar
    if (!fromCoord || targetStops.length === 0) return;

    // Tüm waypoint'ler: kullanıcı → stop[stopIdx] → stop[stopIdx+1] → ...
    const waypoints = [
      { lat: fromCoord.latitude, lng: fromCoord.longitude },
      ...targetStops.map(s => ({ lat: s.lat, lng: s.lng })),
    ];

    const modeObj = TRANSPORT_MODES.find(t => t.key === mode) || TRANSPORT_MODES[0];

    try {
      setNavLoading(true);
      setNavError(null);
      const data = await fetchOSRM(waypoints, modeObj.osrm);
      setNavData(data);
      setActiveStep(0);

      // Haritaya sığdır
      if (data.polyline.length > 1) {
        mapRef.current?.fitToCoordinates(data.polyline, {
          edgePadding: { top: 140, right: 30, bottom: 260, left: 30 },
          animated: true,
        });
      }
    } catch (e) {
      setNavError(e.message || 'Yol tarifi alınamadı');
    } finally {
      setNavLoading(false);
    }
  }, [stops]);

  // ── Konum değişince → aktif adımı güncelle + varış kontrolü ──────────────
  useEffect(() => {
    if (!userLoc || !navData?.steps?.length) return;

    // Mevcut durağa mesafe kontrolü
    const curStop = stops[curStopIdx];
    if (curStop) {
      const d = haversineM(userLoc.latitude, userLoc.longitude, curStop.lat, curStop.lng);
      if (d <= ARRIVAL_RADIUS_M && !arrived.includes(curStopIdx)) {
        // Otomatik varış tespiti
        handleAutoArrival(curStopIdx);
      }
    }

    // Aktif adımı bul (en yakın)
    let nearestIdx = activeStep;
    let nearestDist = Infinity;
    for (let i = activeStep; i < Math.min(activeStep + 5, navData.steps.length); i++) {
      const step = navData.steps[i];
      const d = haversineM(userLoc.latitude, userLoc.longitude, step.coord.latitude, step.coord.longitude);
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    if (nearestIdx !== activeStep) {
      setActiveStep(nearestIdx);
      // Adım listesini kaydır
      stepsListRef.current?.scrollToIndex({ index: nearestIdx, animated: true, viewOffset: 8 });
    }

    // Sonraki dönüşe mesafe
    const nextStep = navData.steps[activeStep];
    if (nextStep) {
      setDistToNext(haversineM(
        userLoc.latitude, userLoc.longitude,
        nextStep.coord.latitude, nextStep.coord.longitude
      ));
    }

    // Harita takibi
    if (mapFollow) {
      mapRef.current?.animateCamera({
        center:  userLoc,
        heading: heading,
        pitch:   40,
        zoom:    17,
      }, { duration: 600 });
    }
  }, [userLoc]);

  // ── Kullanıcı ilk konumunu aldıktan sonra navigasyonu hesapla ─────────────
  useEffect(() => {
    if (!userLoc || stops.length === 0) return;
    // Debounce: 600ms
    clearTimeout(lastNavReqRef.current);
    lastNavReqRef.current = setTimeout(() => calcNav(userLoc, curStopIdx, transport), 600);
  }, [userLoc?.latitude, userLoc?.longitude, curStopIdx, transport, stops.length]);

  // ── Otomatik varış ─────────────────────────────────────────────────────────
  const handleAutoArrival = useCallback((stopIdx) => {
    setArrived(prev => {
      if (prev.includes(stopIdx)) return prev;
      return [...prev, stopIdx];
    });
    const stop = stops[stopIdx];
    if (stop?.id) markStopArrived(stop.id).catch(() => {});

    // Son duraksa bitti
    if (stopIdx >= stops.length - 1) {
      setTimeout(() => handleFinish(), 1200);
      return;
    }
    // Sıradaki durağa geç
    setCurStopIdx(stopIdx + 1);
  }, [stops]);

  const handleManualArrival = () => {
    if (arrived.includes(curStopIdx)) {
      // Zaten varıldıysa sıradakine geç
      if (curStopIdx < stops.length - 1) setCurStopIdx(i => i + 1);
      return;
    }
    handleAutoArrival(curStopIdx);
  };

  const handleSkipStop = () => {
    const stop = stops[curStopIdx];
    if (stop?.id) skipStop(stop.id).catch(() => {});
    if (curStopIdx < stops.length - 1) setCurStopIdx(i => i + 1);
  };

  // ── Navigasyonu bitir ─────────────────────────────────────────────────────
  const handleFinish = useCallback(() => {
    Alert.alert('Navigasyonu Bitir', 'Rotayı tamamlamak istiyor musun?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Bitir', onPress: async () => {
          locSubRef.current?.remove();
          try { await stopRecording(id, 0, 0); } catch {}
          router.back();
        },
      },
    ]);
  }, [id, router]);

  // ── Türetilenler ──────────────────────────────────────────────────────────
  const transportMeta = TRANSPORT_MODES.find(t => t.key === transport) || TRANSPORT_MODES[0];
  const curStop       = stops[curStopIdx];
  const nextStep      = navData?.steps?.[activeStep];
  const isLastStop    = curStopIdx >= stops.length - 1;
  const isArrived     = arrived.includes(curStopIdx);

  const stopCoords = stops.map(s => ({ latitude: s.lat, longitude: s.lng }));

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>

      {/* ════════════════════════ HARİTA ════════════════════════ */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        showsUserLocation={false}
        showsCompass={false}
        showsScale={false}
        showsTraffic={false}
        onTouchStart={() => setMapFollow(false)}
        initialRegion={stopCoords[0] ? {
          latitude:      stopCoords[0].latitude,
          longitude:     stopCoords[0].longitude,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        } : undefined}
      >
        {/* OSRM polyline — glow efekti */}
        {navData?.polyline?.length > 1 && (
          <>
            <Polyline
              coordinates={navData.polyline}
              strokeColor={`${transportMeta.color}30`}
              strokeWidth={14}
              lineJoin="round"
            />
            <Polyline
              coordinates={navData.polyline}
              strokeColor={transportMeta.color}
              strokeWidth={5}
              lineJoin="round"
              lineCap="round"
            />
          </>
        )}

        {/* Durak markerları */}
        {stops.map((stop, i) => {
          const isActive   = i === curStopIdx;
          const isDone     = arrived.includes(i);
          const dotColor   = isDone ? '#22C55E'
            : isActive ? transportMeta.color
            : '#2A2A2A';
          const borderColor = isActive ? '#fff' : isDone ? '#22C55E' : '#444';
          const size = isActive ? 38 : 28;

          return (
            <Marker
              key={stop.id || i}
              coordinate={{ latitude: stop.lat, longitude: stop.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              onPress={() => setCurStopIdx(i)}
            >
              <View style={{ alignItems: 'center' }}>
                <View style={[sm.pin, {
                  width: size, height: size, borderRadius: size / 2,
                  backgroundColor: dotColor, borderColor, borderWidth: isActive ? 3 : 1.5,
                  shadowColor: transportMeta.color, shadowOpacity: isActive ? 0.7 : 0,
                  shadowRadius: 8, elevation: isActive ? 10 : 3,
                }]}>
                  {isDone
                    ? <Ionicons name="checkmark" size={isActive ? 18 : 13} color="#fff" />
                    : <Text style={[sm.pinTxt, { fontSize: isActive ? 15 : 11 }]}>{i + 1}</Text>
                  }
                </View>
                {isActive && <View style={[sm.pulse, { borderColor: transportMeta.color }]} />}
              </View>
            </Marker>
          );
        })}

        {/* Kullanıcı konumu — yönlü ok */}
        {userLoc && (
          <Marker
            coordinate={userLoc}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            rotation={heading}
            tracksViewChanges={false}
          >
            <View style={um.wrap}>
              <View style={[um.dot, { backgroundColor: transportMeta.color }]}>
                <Ionicons name="navigate" size={14} color="#fff" />
              </View>
              <View style={[um.halo, { borderColor: transportMeta.color }]} />
            </View>
          </Marker>
        )}

        {/* Mevcut durağa varış çemberi */}
        {curStop && (
          <Circle
            center={{ latitude: curStop.lat, longitude: curStop.lng }}
            radius={ARRIVAL_RADIUS_M}
            fillColor={`${transportMeta.color}18`}
            strokeColor={`${transportMeta.color}66`}
            strokeWidth={1.5}
          />
        )}
      </MapView>

      {/* ════════════════════════ ÜST BÖLÜM ════════════════════════ */}
      <LinearGradient
        colors={['rgba(5,5,5,0.95)', 'rgba(5,5,5,0.7)', 'transparent']}
        style={[s.topGrad, { paddingTop: insets.top + 8 }]}
        pointerEvents="box-none"
      >
        {/* Header butonları */}
        <View style={s.header}>
          <TouchableOpacity style={s.headerBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>

          {/* Rota adı */}
          <Text style={s.routeName} numberOfLines={1}>{route?.title || 'Rota Navigasyonu'}</Text>

          {/* Haritayı kilitle/serbest */}
          <TouchableOpacity
            style={[s.headerBtn, mapFollow && { backgroundColor: `${transportMeta.color}30`, borderColor: transportMeta.color }]}
            onPress={() => { setMapFollow(!mapFollow); if (!mapFollow && userLoc) mapRef.current?.animateToRegion({ ...userLoc, latitudeDelta: 0.008, longitudeDelta: 0.008 }, 600); }}
          >
            <Ionicons name={mapFollow ? 'navigate' : 'navigate-outline'} size={18}
              color={mapFollow ? transportMeta.color : '#888'} />
          </TouchableOpacity>
        </View>

        {/* Ulaşım modu seçici */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.modePicker} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          <ModePicker current={transport} onChange={(m) => { setTransport(m); setNavData(null); }} />
        </ScrollView>

        {/* Sonraki dönüş banner */}
        {!navLoading && nextStep && !showSteps && (
          <View style={s.bannerWrap}>
            <NextTurnBanner
              step={nextStep}
              distToStep={distToNext}
              transportColor={transportMeta.color}
            />
          </View>
        )}

        {/* Yükleniyor */}
        {navLoading && (
          <View style={s.loadingBanner}>
            <ActivityIndicator color={transportMeta.color} size="small" />
            <Text style={s.loadingTxt}>Yol tarifi hesaplanıyor…</Text>
          </View>
        )}

        {/* Hata */}
        {navError && !navLoading && (
          <View style={s.errorBanner}>
            <Ionicons name="warning-outline" size={15} color="#f59e0b" />
            <Text style={s.errorTxt}>{navError}</Text>
            <TouchableOpacity onPress={() => userLoc && calcNav(userLoc, curStopIdx, transport)}>
              <Text style={{ color: transportMeta.color, fontSize: 13, fontWeight: '600' }}>Tekrar</Text>
            </TouchableOpacity>
          </View>
        )}
      </LinearGradient>

      {/* ════════════════════════ ALT PANEL ════════════════════════ */}
      <View style={[s.sheet, showSteps && s.sheetExpanded]}>
        <LinearGradient
          colors={['transparent', 'rgba(5,5,5,0.95)']}
          style={s.sheetTopGrad}
          pointerEvents="none"
        />

        <View style={s.sheetHandle} />

        {/* Özet istatistikler */}
        <View style={s.stats}>
          {/* Toplam kalan mesafe + süre */}
          {navData && (
            <>
              <View style={s.statItem}>
                <Ionicons name="navigate-outline" size={14} color={transportMeta.color} />
                <Text style={s.statVal}>{fmtDist(navData.totalDist)}</Text>
                <Text style={s.statLabel}>toplam</Text>
              </View>
              <View style={s.statDiv} />
              <View style={s.statItem}>
                <Ionicons name="time-outline" size={14} color={transportMeta.color} />
                <Text style={s.statVal}>{fmtTime(navData.totalTime)}</Text>
                <Text style={s.statLabel}>süre</Text>
              </View>
              <View style={s.statDiv} />
            </>
          )}
          <View style={s.statItem}>
            <Ionicons name="pin-outline" size={14} color={transportMeta.color} />
            <Text style={[s.statVal, { color: transportMeta.color }]}>
              {arrived.length}/{stops.length}
            </Text>
            <Text style={s.statLabel}>durak</Text>
          </View>

          {/* Adım listesi toggle */}
          {navData?.steps?.length > 0 && (
            <TouchableOpacity
              style={[s.stepsToggle, showSteps && { backgroundColor: `${transportMeta.color}22` }]}
              onPress={() => setShowSteps(!showSteps)}
            >
              <Ionicons name={showSteps ? 'list' : 'list-outline'} size={16}
                color={showSteps ? transportMeta.color : '#555'} />
              <Text style={[s.stepsToggleTxt, showSteps && { color: transportMeta.color }]}>
                {showSteps ? 'Haritaya Dön' : 'Adımlar'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Adım listesi (açıkken) ── */}
        {showSteps && navData?.steps?.length > 0 && (
          <FlatList
            ref={stepsListRef}
            data={navData.steps}
            keyExtractor={(_, i) => String(i)}
            style={s.stepsList}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <StepRow step={item} active={index === activeStep} />
            )}
            onScrollToIndexFailed={() => {}}
          />
        )}

        {/* ── Mevcut durak bilgisi (adım listesi kapalıyken) ── */}
        {!showSteps && curStop && (
          <View style={s.curStop}>
            {/* Durak başlığı */}
            <View style={s.curStopHeader}>
              <View style={[s.curStopNum, { backgroundColor: transportMeta.color }]}>
                <Text style={s.curStopNumTxt}>{curStopIdx + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.curStopName} numberOfLines={1}>{curStop.name || `Durak ${curStopIdx + 1}`}</Text>
                {curStop.notes || curStop.llm_comment ? (
                  <Text style={s.curStopNote} numberOfLines={2}>
                    {curStop.notes || curStop.llm_comment}
                  </Text>
                ) : null}
              </View>
              {/* Durağa mesafe */}
              {userLoc && curStop.lat && (
                <View style={[s.distPill, { backgroundColor: `${transportMeta.color}20` }]}>
                  <Text style={[s.distPillTxt, { color: transportMeta.color }]}>
                    {fmtDist(haversineM(
                      userLoc.latitude, userLoc.longitude, curStop.lat, curStop.lng
                    ))}
                  </Text>
                </View>
              )}
            </View>

            {/* Durak progress */}
            <View style={s.stopProgress}>
              {stops.map((_, i) => (
                <View key={i} style={[
                  s.stopPip,
                  arrived.includes(i) && { backgroundColor: '#22C55E', flex: 1 },
                  i === curStopIdx && !arrived.includes(i) && { backgroundColor: transportMeta.color, flex: 2 },
                ]} />
              ))}
            </View>

            {/* Varıldı badge */}
            {isArrived && (
              <View style={[s.arrivedBadge, { borderColor: '#22C55E' }]}>
                <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                <Text style={s.arrivedTxt}>
                  {isLastStop ? 'Son durağa ulaştın! 🎉' : 'Durağa ulaştın!'}
                </Text>
              </View>
            )}

            {/* Aksiyonlar */}
            <View style={s.actions}>
              {/* Önceki durak */}
              {curStopIdx > 0 && (
                <TouchableOpacity
                  style={s.secondaryBtn}
                  onPress={() => { setCurStopIdx(i => i - 1); setNavData(null); }}
                >
                  <Ionicons name="arrow-back" size={17} color="#888" />
                </TouchableOpacity>
              )}

              {/* Ana buton */}
              {!isLastStop ? (
                <TouchableOpacity
                  style={[s.primaryBtn, { backgroundColor: isArrived ? '#1A3A1A' : transportMeta.color }]}
                  onPress={handleManualArrival}
                >
                  <Ionicons name={isArrived ? 'arrow-forward' : 'flag'} size={18}
                    color={isArrived ? '#22C55E' : '#fff'} />
                  <Text style={[s.primaryBtnTxt, isArrived && { color: '#22C55E' }]}>
                    {isArrived ? 'Sıradaki Durak' : 'Varıştım'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[s.primaryBtn, { backgroundColor: '#22C55E' }]}
                  onPress={handleManualArrival}
                >
                  <Ionicons name="flag" size={18} color="#fff" />
                  <Text style={s.primaryBtnTxt}>
                    {isArrived ? 'Rotayı Tamamla' : 'Son Durağa Vardım'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Atla */}
              {!isArrived && (
                <TouchableOpacity style={s.secondaryBtn} onPress={handleSkipStop}>
                  <Ionicons name="play-skip-forward-outline" size={17} color="#555" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Bitir */}
        <TouchableOpacity
          style={[s.finishBtn, { marginBottom: insets.bottom + 10 }]}
          onPress={handleFinish}
        >
          <Ionicons name="stop-circle-outline" size={16} color="#ef4444" />
          <Text style={s.finishBtnTxt}>Navigasyonu Bitir</Text>
        </TouchableOpacity>
      </View>

      {/* Floating — haritayı kilitle (serbest modda görünür) */}
      {!mapFollow && userLoc && (
        <TouchableOpacity
          style={[s.relocBtn, { bottom: height * 0.44, right: 16, borderColor: transportMeta.color }]}
          onPress={() => {
            setMapFollow(true);
            mapRef.current?.animateCamera({
              center: userLoc, heading, pitch: 40, zoom: 17,
            }, { duration: 600 });
          }}
        >
          <Ionicons name="locate" size={20} color={transportMeta.color} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stiller
// ─────────────────────────────────────────────────────────────────────────────
const sm = StyleSheet.create({ // stop marker
  pin:    { alignItems: 'center', justifyContent: 'center' },
  pinTxt: { color: '#fff', fontWeight: '800' },
  pulse:  { position: 'absolute', width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, opacity: 0.4, top: -9, left: -9 },
});
const um = StyleSheet.create({ // user marker
  wrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot:  { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 6, elevation: 8 },
  halo: { position: 'absolute', width: 44, height: 44, borderRadius: 22, borderWidth: 1, opacity: 0.3, top: 0, left: 0 },
});

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#050505' },

  // Üst gradient
  topGrad:       { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 16, zIndex: 20 },
  header:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, marginBottom: 10 },
  headerBtn:     { width: 38, height: 38, backgroundColor: 'rgba(20,20,20,0.85)', borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: '#2A2A2A' },
  routeName:     { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700' },
  modePicker:    { marginBottom: 8 },
  bannerWrap:    { marginHorizontal: 14 },

  // Loading / error
  loadingBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 14, backgroundColor: 'rgba(20,20,20,0.85)', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  loadingTxt:    { color: '#888', fontSize: 13 },
  errorBanner:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, backgroundColor: 'rgba(30,15,0,0.9)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  errorTxt:      { flex: 1, color: '#f59e0b', fontSize: 12 },

  // Alt panel
  sheet:         { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#0A0A0A', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 0.5, borderTopColor: '#1C1C1C', maxHeight: height * 0.52 },
  sheetExpanded: { maxHeight: height * 0.7 },
  sheetTopGrad:  { position: 'absolute', top: -50, left: 0, right: 0, height: 50 },
  sheetHandle:   { width: 36, height: 4, backgroundColor: '#2A2A2A', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 12 },

  // İstatistikler
  stats:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, marginBottom: 14, gap: 10 },
  statItem:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statVal:       { color: '#fff', fontSize: 14, fontWeight: '700' },
  statLabel:     { color: '#444', fontSize: 10 },
  statDiv:       { width: 0.5, height: 18, backgroundColor: '#222' },
  stepsToggle:   { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 'auto', backgroundColor: '#111', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 0.5, borderColor: '#1C1C1C' },
  stepsToggleTxt:{ color: '#555', fontSize: 12, fontWeight: '600' },

  // Adım listesi
  stepsList:     { maxHeight: height * 0.32 },

  // Mevcut durak
  curStop:       { paddingHorizontal: 16, paddingBottom: 8 },
  curStopHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  curStopNum:    { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  curStopNumTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  curStopName:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  curStopNote:   { color: '#666', fontSize: 12, marginTop: 3, lineHeight: 17 },
  distPill:      { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  distPillTxt:   { fontSize: 12, fontWeight: '700' },

  // Progress
  stopProgress:  { flexDirection: 'row', gap: 4, height: 4, marginBottom: 12 },
  stopPip:       { flex: 1, backgroundColor: '#1C1C1C', borderRadius: 2, height: 4 },

  // Varıldı
  arrivedBadge:  { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#0A1F0A', borderRadius: 10, padding: 9, borderWidth: 0.5, marginBottom: 10 },
  arrivedTxt:    { color: '#22C55E', fontSize: 13, fontWeight: '500' },

  // Aksiyonlar
  actions:       { flexDirection: 'row', gap: 8, marginBottom: 8 },
  primaryBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, paddingVertical: 14 },
  primaryBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn:  { width: 48, height: 48, backgroundColor: '#111', borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: '#1C1C1C' },

  // Bitir
  finishBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginHorizontal: 16, paddingVertical: 10, backgroundColor: '#1A0A0A', borderRadius: 14, borderWidth: 0.5, borderColor: '#2A1010' },
  finishBtnTxt:  { color: '#ef4444', fontSize: 13, fontWeight: '600' },

  // Relokasyon butonu
  relocBtn:      { position: 'absolute', width: 44, height: 44, backgroundColor: '#0A0A0A', borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 6, elevation: 8, zIndex: 30 },
});