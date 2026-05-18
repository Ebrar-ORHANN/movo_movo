// ── app/route/create.js ──────────────────────────────────────────────────────
// 3 yöntemli rota oluşturma:
//   1. LIVE   — Gezerken marker at, iz çiz (gerçek zamanlı kayıt)
//   2. DRAW   — Harita üzerine dokunarak waypoint ekle
//   3. AI     — LLM ile otomatik rota üret
// Paylaşıldığında feed'de harita kartı olarak görünür.

import React, {
  useState, useRef, useCallback, useEffect, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, FlatList, ActivityIndicator, Alert,
  Modal, Pressable, KeyboardAvoidingView, Platform,
  Dimensions, Animated, PanResponder,
} from 'react-native';
import MapView, { Marker, Polyline, UrlTile, Circle } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { BlurView } from 'expo-blur';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { auth } from '../../src/firebase/config';
import { API_BASE } from '../../constants/api';

const { width, height } = Dimensions.get('window');
const MAP_HEIGHT = height * 0.52;

// ─────────────────────────────────────────────────────────────────────────────
// Sabitler
// ─────────────────────────────────────────────────────────────────────────────
const TRANSPORT_MODES = [
  { key: 'walking',  icon: 'walk-outline',    label: 'Yürüyüş', color: '#22C55E' },
  { key: 'cycling',  icon: 'bicycle-outline', label: 'Bisiklet', color: '#3B82F6' },
  { key: 'driving',  icon: 'car-outline',     label: 'Araç', color: '#F97316' },
];

const VISIBILITY = [
  { key: 'public',    icon: 'earth-outline',       label: 'Herkese Açık' },
  { key: 'followers', icon: 'people-outline',      label: 'Takipçiler' },
  { key: 'private',   icon: 'lock-closed-outline', label: 'Gizli' },
];

const CATEGORIES = [
  { key: 'doğa',     emoji: '🌿' },
  { key: 'kültür',   emoji: '🏛️' },
  { key: 'yemek',    emoji: '🍽️' },
  { key: 'tarih',    emoji: '⚔️' },
  { key: 'macera',   emoji: '🧗' },
  { key: 'fotoğraf', emoji: '📸' },
];

const AI_PROMPTS = [
  '3 saatlik tarihi yürüyüş rotası öner',
  'Kafe ve kahve dükkanları turu yap',
  'Doğa ve park alanları güzergahı',
  'Fotoğraf için en iyi noktalar',
  'Akşam yemeği ve gece rotası',
  'Bisiklet dostu şehir turu',
];

// ─────────────────────────────────────────────────────────────────────────────
// Yardımcı: Haversine mesafe (metre)
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
function fmtTime(s) {
  const m = Math.round(s / 60);
  return m < 60 ? `${m} dk` : `${Math.floor(m / 60)} sa ${m % 60} dk`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Marker Pin bileşeni
// ─────────────────────────────────────────────────────────────────────────────
function WaypointPin({ index, total, isActive, color }) {
  const bg = isActive ? '#FF9800'
    : index === 0 ? '#22C55E'
    : index === total - 1 ? '#3B82F6'
    : color || '#8B5CF6';
  return (
    <View style={pin.outer}>
      <View style={[pin.bubble, { backgroundColor: bg }]}>
        <Text style={pin.label}>{index + 1}</Text>
      </View>
      <View style={[pin.tail, { borderTopColor: bg }]} />
    </View>
  );
}
const pin = StyleSheet.create({
  outer:  { alignItems: 'center' },
  bubble: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },
  label:  { color: '#fff', fontSize: 11, fontWeight: '800' },
  tail:   { width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -1 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Waypoint listesi satırı
// ─────────────────────────────────────────────────────────────────────────────
function WaypointRow({ item, index, total, onDelete, onEdit, onFocus }) {
  const isFirst = index === 0;
  const isLast  = index === total - 1;
  const dotColor = isFirst ? '#22C55E' : isLast ? '#3B82F6' : '#8B5CF6';

  return (
    <TouchableOpacity style={wr.row} onPress={() => onFocus(index)} activeOpacity={0.7}>
      {/* Sol çizgi */}
      <View style={wr.lineCol}>
        <View style={[wr.dot, { backgroundColor: dotColor }]} />
        {index < total - 1 && <View style={wr.line} />}
      </View>

      {/* İçerik */}
      <View style={wr.body}>
        <View style={wr.nameRow}>
          <Text style={wr.name} numberOfLines={1}>
            {item.name || `Durak ${index + 1}`}
          </Text>
          <View style={wr.actions}>
            <TouchableOpacity style={wr.iconBtn} onPress={() => onEdit(index)}>
              <Ionicons name="pencil-outline" size={14} color="#555" />
            </TouchableOpacity>
            <TouchableOpacity style={wr.iconBtn} onPress={() => onDelete(index)}>
              <Ionicons name="trash-outline" size={14} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>
        {item.note ? (
          <Text style={wr.note} numberOfLines={1}>{item.note}</Text>
        ) : null}
        <Text style={wr.coords}>
          {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
const wr = StyleSheet.create({
  row:     { flexDirection: 'row', gap: 12, paddingVertical: 8 },
  lineCol: { alignItems: 'center', width: 20, paddingTop: 4 },
  dot:     { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#0A0A0A' },
  line:    { flex: 1, width: 2, backgroundColor: '#1C1C1C', marginTop: 2, minHeight: 16 },
  body:    { flex: 1, backgroundColor: '#111', borderRadius: 12, padding: 10, borderWidth: 0.5, borderColor: '#1C1C1C' },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name:    { color: '#fff', fontSize: 13, fontWeight: '600', flex: 1 },
  note:    { color: '#666', fontSize: 11, marginTop: 2 },
  coords:  { color: '#333', fontSize: 10, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  actions: { flexDirection: 'row', gap: 4 },
  iconBtn: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A1A1A', borderRadius: 8 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Waypoint düzenleme modalı
// ─────────────────────────────────────────────────────────────────────────────
function WaypointEditModal({ visible, waypoint, index, onSave, onClose }) {
  const [name, setName] = useState(waypoint?.name || '');
  const [note, setNote] = useState(waypoint?.note || '');

  useEffect(() => {
    if (waypoint) { setName(waypoint.name || ''); setNote(waypoint.note || ''); }
  }, [waypoint]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={em.overlay} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={em.sheet}>
        <View style={em.handle} />
        <Text style={em.title}>Durak {(index ?? 0) + 1} Düzenle</Text>
        <View style={em.field}>
          <Text style={em.fieldLabel}>DURAK ADI</Text>
          <TextInput style={em.input} value={name} onChangeText={setName}
            placeholder="Örn: Atatürk Anıtı" placeholderTextColor="#333"
            autoFocus maxLength={60} />
        </View>
        <View style={em.field}>
          <Text style={em.fieldLabel}>NOT (opsiyonel)</Text>
          <TextInput style={[em.input, { minHeight: 70, textAlignVertical: 'top' }]}
            value={note} onChangeText={setNote}
            placeholder="Bu nokta hakkında not..." placeholderTextColor="#333"
            multiline maxLength={200} />
        </View>
        <TouchableOpacity style={em.saveBtn}
          onPress={() => { onSave(index, { name: name.trim() || `Durak ${(index ?? 0) + 1}`, note: note.trim() }); onClose(); }}>
          <Text style={em.saveTxt}>Kaydet</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const em = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet:    { backgroundColor: '#0F0F0F', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: Platform.OS === 'ios' ? 34 : 20 },
  handle:   { width: 36, height: 4, backgroundColor: '#2A2A2A', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  title:    { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center', paddingVertical: 14 },
  field:    { paddingHorizontal: 20, marginBottom: 14 },
  fieldLabel:{ color: '#444', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  input:    { backgroundColor: '#1A1A1A', color: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, borderWidth: 0.5, borderColor: '#2A2A2A' },
  saveBtn:  { backgroundColor: '#22C55E', margin: 20, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  saveTxt:  { color: '#fff', fontWeight: '700', fontSize: 15 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Ana Ekran
// ─────────────────────────────────────────────────────────────────────────────
export default function RouteCreateScreen() {
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const { profile } = useAuth();
  const mapRef   = useRef(null);

  // ── Mod: live | draw | ai ────────────────────────────────────────────────
  const [mode, setMode] = useState('draw');

  // ── Waypoints ──────────────────────────────────────────────────────────
  const [waypoints, setWaypoints] = useState([]);
  const [editingIdx, setEditingIdx] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // ── Harita ─────────────────────────────────────────────────────────────
  const [region, setRegion] = useState({
    latitude: 39.9208, longitude: 32.8541,
    latitudeDelta: 0.05, longitudeDelta: 0.05,
  });
  const [drawMode, setDrawMode] = useState(false); // haritaya dokunarak ekle

  // ── Live kayıt ─────────────────────────────────────────────────────────
  const [recording, setRecording]     = useState(false);
  const [trail, setTrail]             = useState([]);
  const [currentLoc, setCurrentLoc]   = useState(null);
  const [elapsed, setElapsed]         = useState(0);
  const [distM, setDistM]             = useState(0);
  const locWatcher  = useRef(null);
  const timerRef    = useRef(null);
  const startTime   = useRef(null);
  const lastLocRef  = useRef(null);
  const dynRouteId  = useRef(null);

  // ── AI ─────────────────────────────────────────────────────────────────
  const [aiPrompt, setAiPrompt]     = useState('');
  const [aiLoading, setAiLoading]   = useState(false);
  const [cityId]                    = useState(null); // detect from location

  // ── Rota ayarları ───────────────────────────────────────────────────────
  const [title, setTitle]           = useState('');
  const [description, setDesc]      = useState('');
  const [transport, setTransport]   = useState('walking');
  const [visibility, setVisibility] = useState('public');
  const [category, setCategory]     = useState('doğa');

  // ── UI ──────────────────────────────────────────────────────────────────
  const [saving, setSaving]         = useState(false);
  const [showSettings, setSettings] = useState(false);
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Kayıt sırasında nabız animasyonu
  useEffect(() => {
    if (!recording) { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [recording]);

  // ── Konum izni & ilk konum ─────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setCurrentLoc(loc);
      setRegion({ ...loc, latitudeDelta: 0.02, longitudeDelta: 0.02 });
    })();
    return () => {
      locWatcher.current?.remove();
      timerRef.current && clearInterval(timerRef.current);
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // LIVE KAYIT
  // ─────────────────────────────────────────────────────────────────────────
  const startLiveRecording = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Konum izni gerekli'); return; }
    setTrail([]); setDistM(0); setElapsed(0);
    startTime.current = Date.now();
    setRecording(true);

    timerRef.current = setInterval(
      () => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)),
      1000
    );

    locWatcher.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
      (pos) => {
        const coord = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setCurrentLoc(coord);
        setTrail(prev => {
          if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const d = haversineM(last.latitude, last.longitude, coord.latitude, coord.longitude);
            setDistM(m => m + d);
          }
          return [...prev, coord];
        });
        mapRef.current?.animateToRegion(
          { ...coord, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 800
        );
      }
    );
  };

  const stopLiveRecording = () => {
    locWatcher.current?.remove();
    locWatcher.current = null;
    clearInterval(timerRef.current);
    setRecording(false);
  };

  const dropMarkerAtCurrent = () => {
    if (!currentLoc) { Alert.alert('Konum bekleniyor'); return; }
    const wp = {
      lat: currentLoc.latitude,
      lng: currentLoc.longitude,
      name: `Durak ${waypoints.length + 1}`,
      note: '',
      timestamp: Date.now(),
    };
    setWaypoints(prev => [...prev, wp]);
    // Marker eklendi animasyonu için state flash yok, sadece ekliyoruz
  };

  // ─────────────────────────────────────────────────────────────────────────
  // DRAW MODU — haritaya dokun → waypoint
  // ─────────────────────────────────────────────────────────────────────────
  const handleMapPress = (e) => {
    if (!drawMode) return;
    const { latitude, longitude } = e.nativeEvent.coordinate;
    const wp = {
      lat: latitude,
      lng: longitude,
      name: `Durak ${waypoints.length + 1}`,
      note: '',
      timestamp: Date.now(),
    };
    setWaypoints(prev => [...prev, wp]);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // AI ROTA
  // ─────────────────────────────────────────────────────────────────────────
  const generateAIRoute = async (prompt) => {
    const q = (prompt || aiPrompt).trim();
    if (!q) return;
    setAiLoading(true);
    try {
      const res = await api.post('/explorer/chat', {
        message: q,
        lat: currentLoc?.latitude || null,
        lng: currentLoc?.longitude || null,
        history: [],
      });
      if (res?.locations?.length) {
        const newWps = res.locations
          .filter(l => l.lat && l.lng)
          .map((l, i) => ({
            lat: l.lat,
            lng: l.lng,
            name: l.name || `Durak ${i + 1}`,
            note: l.description || '',
            timestamp: Date.now() + i,
          }));
        setWaypoints(newWps);
        if (!title && res.route_suggestion?.title) setTitle(res.route_suggestion.title);
        if (newWps.length > 0) {
          mapRef.current?.fitToCoordinates(
            newWps.map(w => ({ latitude: w.lat, longitude: w.lng })),
            { edgePadding: { top: 60, right: 40, bottom: 60, left: 40 }, animated: true }
          );
        }
      }
    } catch (e) { Alert.alert('AI Hatası', e.message); }
    finally { setAiLoading(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Waypoint işlemleri
  // ─────────────────────────────────────────────────────────────────────────
  const deleteWaypoint = (idx) => setWaypoints(prev => prev.filter((_, i) => i !== idx));

  const editWaypoint = (idx, data) => {
    setWaypoints(prev => prev.map((w, i) => i === idx ? { ...w, ...data } : w));
  };

  const focusWaypoint = (idx) => {
    const wp = waypoints[idx];
    if (!wp) return;
    mapRef.current?.animateToRegion(
      { latitude: wp.lat, longitude: wp.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      600
    );
  };

  const undoLast = () => setWaypoints(prev => prev.slice(0, -1));

  // ─────────────────────────────────────────────────────────────────────────
  // Kaydet & Paylaş
  // ─────────────────────────────────────────────────────────────────────────
  const totalDist = useMemo(() => {
    let d = 0;
    for (let i = 1; i < waypoints.length; i++) {
      d += haversineM(waypoints[i - 1].lat, waypoints[i - 1].lng, waypoints[i].lat, waypoints[i].lng);
    }
    return d;
  }, [waypoints]);

  const handleSave = async (publish = true) => {
    if (!title.trim()) { Alert.alert('Başlık gerekli', 'Rotana bir isim ver.'); return; }
    if (waypoints.length < 2) { Alert.alert('En az 2 durak', 'Haritaya en az 2 nokta ekle.'); return; }
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        description: description.trim() || null,
        transport_mode: transport,
        visibility: publish ? visibility : 'private',
        category,
        // Trail verisi — feed'de harita önizlemesi için
        trail_coords: trail.length > 1
          ? trail.map(c => ({ lat: c.latitude, lng: c.longitude }))
          : null,
        distance_m: Math.round(totalDist),
        stops: waypoints.map((w, i) => ({
          lat: w.lat, lng: w.lng,
          name: w.name,
          notes: w.note || '',
          seq: i + 1,
        })),
      };
      const data = await api.post('/routes', body);
      const newId = data?.route?.id || data?.id;
      Alert.alert(
        publish ? '🗺️ Rota Paylaşıldı!' : '📥 Taslak Kaydedildi',
        publish
          ? 'Rotanı takipçilerin görebilir. Paylaşımında harita olarak görünecek.'
          : 'Rotanı daha sonra yayınlayabilirsin.',
        [{ text: 'Tamam', onPress: () => router.replace(newId ? `/route/${newId}` : '/(tabs)/feed') }]
      );
    } catch (e) { Alert.alert('Hata', e.message); }
    finally { setSaving(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Polyline koordinatları
  // ─────────────────────────────────────────────────────────────────────────
  const polyCoords = waypoints.map(w => ({ latitude: w.lat, longitude: w.lng }));
  const trailColor = TRANSPORT_MODES.find(t => t.key === transport)?.color || '#22C55E';

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>

      {/* ── Harita ── */}
      <View style={{ height: MAP_HEIGHT }}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={region}
          onPress={handleMapPress}
          showsUserLocation
          showsCompass={false}
          showsScale={false}
        >
          {/* Live trail */}
          {trail.length > 1 && (
            <Polyline
              coordinates={trail}
              strokeColor={`${trailColor}55`}
              strokeWidth={3}
              lineDashPattern={[6, 4]}
            />
          )}

          {/* Waypoint polyline */}
          {polyCoords.length > 1 && (
            <Polyline
              coordinates={polyCoords}
              strokeColor={trailColor}
              strokeWidth={4}
              lineJoin="round"
            />
          )}

          {/* Waypoint markers */}
          {waypoints.map((wp, i) => (
            <Marker
              key={`wp-${i}-${wp.timestamp}`}
              coordinate={{ latitude: wp.lat, longitude: wp.lng }}
              onPress={() => { setEditingIdx(i); setShowEditModal(true); }}
              tracksViewChanges={false}
            >
              <WaypointPin
                index={i}
                total={waypoints.length}
                isActive={false}
                color={trailColor}
              />
            </Marker>
          ))}
        </MapView>

        {/* Harita üst overlay */}
        <LinearGradient
          colors={['rgba(0,0,0,0.65)', 'transparent']}
          style={s.mapTopGrad}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.5)']}
          style={s.mapBottomGrad}
          pointerEvents="none"
        />

        {/* Header */}
        <View style={[s.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>

          <View style={s.modeTabs}>
            {[
              { key: 'draw', icon: 'finger-print-outline', label: 'Çiz' },
              { key: 'live', icon: 'radio-button-on-outline', label: 'Canlı' },
              { key: 'ai',   icon: 'sparkles-outline', label: 'AI' },
            ].map(m => (
              <TouchableOpacity
                key={m.key}
                style={[s.modeTab, mode === m.key && s.modeTabActive]}
                onPress={() => { setMode(m.key); if (recording) stopLiveRecording(); }}
              >
                <Ionicons name={m.icon} size={13} color={mode === m.key ? '#22C55E' : '#888'} />
                <Text style={[s.modeTabTxt, mode === m.key && { color: '#22C55E' }]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={s.settingsBtn} onPress={() => setSettings(!showSettings)}>
            <Ionicons name="options-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Live HUD */}
        {mode === 'live' && (
          <View style={s.liveHud}>
            {recording && (
              <View style={s.liveStats}>
                <Animated.View style={[s.recDot, { transform: [{ scale: pulseAnim }] }]} />
                <Text style={s.liveStat}>{fmtTime(elapsed)}</Text>
                <View style={s.hudDiv} />
                <Text style={s.liveStat}>{fmtDist(distM)}</Text>
                <View style={s.hudDiv} />
                <Text style={s.liveStat}>{trail.length} nokta</Text>
              </View>
            )}
          </View>
        )}

        {/* Draw modu ipucu */}
        {mode === 'draw' && drawMode && (
          <View style={s.drawHint}>
            <Ionicons name="hand-left-outline" size={14} color="#22C55E" />
            <Text style={s.drawHintTxt}>Haritaya dokun → marker ekle</Text>
          </View>
        )}

        {/* Waypoint sayacı */}
        {waypoints.length > 0 && (
          <View style={s.wpCounter}>
            <Text style={s.wpCounterTxt}>{waypoints.length}</Text>
            <Text style={s.wpCounterSub}>durak</Text>
          </View>
        )}

        {/* Harita aksiyonları */}
        <View style={s.mapActions}>
          {/* Mode-specific butonlar */}
          {mode === 'draw' && (
            <TouchableOpacity
              style={[s.mapFab, drawMode && { backgroundColor: '#22C55E' }]}
              onPress={() => setDrawMode(!drawMode)}
            >
              <Ionicons name={drawMode ? 'checkmark' : 'add-outline'} size={22} color="#fff" />
            </TouchableOpacity>
          )}

          {mode === 'live' && !recording && (
            <TouchableOpacity style={[s.mapFab, { backgroundColor: '#ef4444' }]} onPress={startLiveRecording}>
              <Ionicons name="radio-button-on" size={22} color="#fff" />
            </TouchableOpacity>
          )}

          {mode === 'live' && recording && (
            <>
              <TouchableOpacity style={[s.mapFab, { backgroundColor: '#22C55E' }]} onPress={dropMarkerAtCurrent}>
                <Ionicons name="location" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={[s.mapFab, { backgroundColor: '#ef4444' }]} onPress={stopLiveRecording}>
                <Ionicons name="stop" size={20} color="#fff" />
              </TouchableOpacity>
            </>
          )}

          {/* Geri al */}
          {waypoints.length > 0 && (
            <TouchableOpacity style={s.mapFabSm} onPress={undoLast}>
              <Ionicons name="arrow-undo" size={18} color="#ccc" />
            </TouchableOpacity>
          )}

          {/* Rotaya sığdır */}
          {polyCoords.length > 1 && (
            <TouchableOpacity style={s.mapFabSm} onPress={() =>
              mapRef.current?.fitToCoordinates(polyCoords, {
                edgePadding: { top: 80, right: 40, bottom: 80, left: 40 }, animated: true,
              })
            }>
              <Ionicons name="expand-outline" size={18} color="#ccc" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Alt panel ── */}
      <View style={s.panel}>

        {/* AI modu arama */}
        {mode === 'ai' && (
          <View style={s.aiBar}>
            <View style={s.aiInput}>
              <Ionicons name="sparkles-outline" size={16} color="#22C55E" />
              <TextInput
                style={s.aiTextInput}
                placeholder="Nasıl bir rota oluşturayım?"
                placeholderTextColor="#444"
                value={aiPrompt}
                onChangeText={setAiPrompt}
                onSubmitEditing={() => generateAIRoute()}
                returnKeyType="search"
              />
              {aiPrompt.length > 0 && (
                <TouchableOpacity onPress={() => setAiPrompt('')}>
                  <Ionicons name="close-circle" size={16} color="#444" />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[s.aiSendBtn, (!aiPrompt.trim() || aiLoading) && { opacity: 0.5 }]}
              onPress={() => generateAIRoute()}
              disabled={!aiPrompt.trim() || aiLoading}
            >
              {aiLoading ? <ActivityIndicator color="#fff" size="small" /> :
                <Ionicons name="arrow-forward" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        )}

        {/* AI hızlı öneriler */}
        {mode === 'ai' && !aiLoading && waypoints.length === 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.promptScroll}>
            {AI_PROMPTS.map((p, i) => (
              <TouchableOpacity key={i} style={s.promptChip} onPress={() => { setAiPrompt(p); generateAIRoute(p); }}>
                <Text style={s.promptTxt}>{p}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {aiLoading && (
          <View style={s.aiLoading}>
            <ActivityIndicator color="#22C55E" />
            <Text style={s.aiLoadingTxt}>AI rotanı hazırlıyor…</Text>
          </View>
        )}

        {/* Mesafe özeti */}
        {waypoints.length >= 2 && (
          <View style={s.summary}>
            <View style={s.summaryItem}>
              <Ionicons name="navigate-outline" size={14} color="#22C55E" />
              <Text style={s.summaryVal}>{fmtDist(totalDist)}</Text>
            </View>
            <View style={s.summaryDiv} />
            <View style={s.summaryItem}>
              <Ionicons name="pin-outline" size={14} color="#22C55E" />
              <Text style={s.summaryVal}>{waypoints.length} durak</Text>
            </View>
            <View style={s.summaryDiv} />
            {/* Transport ikonu */}
            <View style={s.summaryItem}>
              <Text style={{ fontSize: 14 }}>
                {transport === 'walking' ? '🚶' : transport === 'cycling' ? '🚴' : '🚗'}
              </Text>
              <Text style={s.summaryVal}>{TRANSPORT_MODES.find(t => t.key === transport)?.label}</Text>
            </View>
          </View>
        )}

        {/* Başlık input */}
        <View style={s.titleRow}>
          <TextInput
            style={s.titleInput}
            placeholder="Rotana bir isim ver…"
            placeholderTextColor="#333"
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />
        </View>

        {/* Waypoint listesi */}
        {waypoints.length > 0 ? (
          <View style={s.waypointList}>
            {waypoints.map((wp, i) => (
              <WaypointRow
                key={`${wp.timestamp}-${i}`}
                item={wp} index={i} total={waypoints.length}
                onDelete={deleteWaypoint}
                onEdit={(idx) => { setEditingIdx(idx); setShowEditModal(true); }}
                onFocus={focusWaypoint}
              />
            ))}
          </View>
        ) : (
          <View style={s.emptyList}>
            {mode === 'draw' ? (
              <>
                <Text style={s.emptyIcon}>👆</Text>
                <Text style={s.emptyTxt}>
                  {drawMode
                    ? 'Haritaya dokunarak durak ekle'
                    : '"+" butonuna basıp haritaya dokunarak başla'}
                </Text>
              </>
            ) : mode === 'live' ? (
              <>
                <Text style={s.emptyIcon}>📡</Text>
                <Text style={s.emptyTxt}>
                  {recording
                    ? '📍 butonuna basarak istediğin yerlere marker at'
                    : 'Kayıt butonuna bas, gezerken marker ekle'}
                </Text>
              </>
            ) : (
              <>
                <Text style={s.emptyIcon}>🤖</Text>
                <Text style={s.emptyTxt}>Yukarıya rotanı tarif et</Text>
              </>
            )}
          </View>
        )}

        {/* Ayarlar paneli */}
        {showSettings && (
          <View style={s.settingsPanel}>
            {/* Transport */}
            <Text style={s.setLabel}>ULAŞIM</Text>
            <View style={s.chipRow}>
              {TRANSPORT_MODES.map(m => (
                <TouchableOpacity key={m.key}
                  style={[s.chip, transport === m.key && { borderColor: m.color, backgroundColor: `${m.color}18` }]}
                  onPress={() => setTransport(m.key)}>
                  <Ionicons name={m.icon} size={14} color={transport === m.key ? m.color : '#666'} />
                  <Text style={[s.chipTxt, transport === m.key && { color: m.color }]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Visibility */}
            <Text style={s.setLabel}>KİMLER GÖREBİLİR</Text>
            <View style={s.chipRow}>
              {VISIBILITY.map(v => (
                <TouchableOpacity key={v.key}
                  style={[s.chip, visibility === v.key && { borderColor: '#22C55E', backgroundColor: '#0A2A1A' }]}
                  onPress={() => setVisibility(v.key)}>
                  <Ionicons name={v.icon} size={14} color={visibility === v.key ? '#22C55E' : '#666'} />
                  <Text style={[s.chipTxt, visibility === v.key && { color: '#22C55E' }]}>{v.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Kategori */}
            <Text style={s.setLabel}>KATEGORİ</Text>
            <View style={s.chipRow}>
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c.key}
                  style={[s.chip, category === c.key && { borderColor: '#22C55E', backgroundColor: '#0A2A1A' }]}
                  onPress={() => setCategory(c.key)}>
                  <Text style={{ fontSize: 14 }}>{c.emoji}</Text>
                  <Text style={[s.chipTxt, category === c.key && { color: '#22C55E' }]}>{c.key}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Açıklama */}
            <Text style={s.setLabel}>AÇIKLAMA</Text>
            <TextInput
              style={s.descInput}
              placeholder="Rota hakkında kısa bilgi…"
              placeholderTextColor="#333"
              value={description}
              onChangeText={setDesc}
              multiline
              maxLength={300}
            />
          </View>
        )}
      </View>

      {/* ── Alt butonlar ── */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity style={s.draftBtn} onPress={() => handleSave(false)} disabled={saving}>
          <Ionicons name="save-outline" size={16} color="#888" />
          <Text style={s.draftTxt}>Taslak</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.publishBtn, saving && { opacity: 0.6 }]}
          onPress={() => handleSave(true)} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
                <Ionicons name="map" size={18} color="#fff" />
                <Text style={s.publishTxt}>Rotayı Paylaş</Text>
              </>
          }
        </TouchableOpacity>
      </View>

      {/* Waypoint düzenleme modalı */}
      <WaypointEditModal
        visible={showEditModal}
        waypoint={editingIdx !== null ? waypoints[editingIdx] : null}
        index={editingIdx}
        onSave={editWaypoint}
        onClose={() => { setShowEditModal(false); setEditingIdx(null); }}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stiller
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#0A0A0A' },

  // Header
  header:         { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 10, gap: 10, zIndex: 10 },
  backBtn:        { width: 38, height: 38, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)' },
  modeTabs:       { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(10,10,10,0.8)', borderRadius: 14, padding: 3, gap: 2, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)' },
  modeTab:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 7, borderRadius: 12 },
  modeTabActive:  { backgroundColor: 'rgba(34,197,94,0.15)' },
  modeTabTxt:     { color: '#888', fontSize: 11, fontWeight: '600' },
  settingsBtn:    { width: 38, height: 38, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)' },

  // Map overlays
  mapTopGrad:     { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  mapBottomGrad:  { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },

  // Live HUD
  liveHud:        { position: 'absolute', top: 90, alignSelf: 'center' },
  liveStats:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 0.5, borderColor: '#22C55E' },
  recDot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  liveStat:       { color: '#fff', fontSize: 13, fontWeight: '700' },
  hudDiv:         { width: 0.5, height: 14, backgroundColor: '#333' },

  // Draw hint
  drawHint:       { position: 'absolute', top: 100, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 0.5, borderColor: '#22C55E' },
  drawHintTxt:    { color: '#22C55E', fontSize: 12, fontWeight: '600' },

  // Waypoint counter
  wpCounter:      { position: 'absolute', bottom: 16, left: 16, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center', borderWidth: 0.5, borderColor: '#22C55E' },
  wpCounterTxt:   { color: '#22C55E', fontSize: 18, fontWeight: '800' },
  wpCounterSub:   { color: '#22C55E', fontSize: 9, fontWeight: '600' },

  // Map action buttons
  mapActions:     { position: 'absolute', right: 14, bottom: 16, gap: 8 },
  mapFab:         { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(10,10,10,0.9)', alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: '#333', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, elevation: 6 },
  mapFabSm:       { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(10,10,10,0.9)', alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: '#222' },

  // Panel
  panel:          { flex: 1, backgroundColor: '#0A0A0A', paddingHorizontal: 16, paddingTop: 14 },

  // AI bar
  aiBar:          { flexDirection: 'row', gap: 8, marginBottom: 10 },
  aiInput:        { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#111', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 0.5, borderColor: '#1C1C1C' },
  aiTextInput:    { flex: 1, color: '#fff', fontSize: 13 },
  aiSendBtn:      { width: 44, height: 44, backgroundColor: '#22C55E', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  promptScroll:   { marginBottom: 8 },
  promptChip:     { backgroundColor: '#111', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, borderWidth: 0.5, borderColor: '#1C1C1C' },
  promptTxt:      { color: '#888', fontSize: 12 },
  aiLoading:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0A1F0A', borderRadius: 12, padding: 12, marginBottom: 10 },
  aiLoadingTxt:   { color: '#22C55E', fontSize: 13 },

  // Summary
  summary:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 10, borderWidth: 0.5, borderColor: '#1C1C1C', gap: 12 },
  summaryItem:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  summaryVal:     { color: '#ccc', fontSize: 12, fontWeight: '600' },
  summaryDiv:     { width: 0.5, height: 16, backgroundColor: '#2A2A2A' },

  // Title input
  titleRow:       { marginBottom: 10 },
  titleInput:     { color: '#fff', fontSize: 16, fontWeight: '600', borderBottomWidth: 0.5, borderBottomColor: '#1C1C1C', paddingBottom: 10 },

  // Waypoint list
  waypointList:   { flex: 1 },

  // Empty
  emptyList:      { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyIcon:      { fontSize: 32 },
  emptyTxt:       { color: '#444', fontSize: 13, textAlign: 'center', lineHeight: 20, maxWidth: 260 },

  // Settings panel
  settingsPanel:  { backgroundColor: '#0F0F0F', borderRadius: 16, padding: 14, marginTop: 8, borderWidth: 0.5, borderColor: '#1C1C1C', gap: 10 },
  setLabel:       { color: '#444', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  chipRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip:           { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#111', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 0.5, borderColor: '#2A2A2A' },
  chipTxt:        { color: '#666', fontSize: 12 },
  descInput:      { backgroundColor: '#111', color: '#ccc', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, borderWidth: 0.5, borderColor: '#1C1C1C', minHeight: 70, textAlignVertical: 'top' },

  // Footer
  footer:         { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: '#1C1C1C', backgroundColor: '#0A0A0A' },
  draftBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: '#111', borderRadius: 16, borderWidth: 0.5, borderColor: '#1C1C1C' },
  draftTxt:       { color: '#888', fontSize: 14 },
  publishBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#22C55E', borderRadius: 16, paddingVertical: 14 },
  publishTxt:     { color: '#fff', fontWeight: '700', fontSize: 15 },
});