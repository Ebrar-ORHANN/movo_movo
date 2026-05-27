// ── app/(tabs)/discover/index.js ─────────────────────────────────────────────
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  ScrollView, Animated, Dimensions, ActivityIndicator, Alert,
} from 'react-native';
import MapView, { Marker, Polyline, Circle } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import useExplorer from '../../../hooks/useExplorer';
import useUserLocation from '../../../hooks/useUserLocation';
import { useAuth } from '../../../context/AuthContext';
import { updateExplorerStatus } from '../../../services/explorerService';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const CATEGORY_COLORS = {
  cafe: '#F97316', restaurant: '#EF4444', museum: '#3B82F6',
  park: '#22C55E', historic: '#8B5CF6', viewpoint: '#EC4899',
  market: '#F59E0B', other: '#6B7280',
};

// Ankara merkezi — konum alınana kadar fallback
const DEFAULT_REGION = {
  latitude: 39.9208, longitude: 32.8541,
  latitudeDelta: 0.1, longitudeDelta: 0.1,
};

export default function DiscoverScreen() {
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const mapRef    = useRef(null);
  const sheetAnim = useRef(new Animated.Value(0)).current;

  const [prompt, setPrompt]           = useState('');
  const [showSheet, setShowSheet]     = useState(false);
  const [selectedPOI, setSelectedPOI] = useState(null);
  const [isExplorerActive, setExplorerActive] = useState(false);

  const { location } = useUserLocation();
  const { profile }  = useAuth();

  // location?.coords?.latitude — güvenli erişim
  const lat = location?.coords?.latitude;
  const lng = location?.coords?.longitude;

  const [cityId, setCityId] = useState(null);
  // Konum alınınca şehri tespit et
useEffect(() => {
  if (lat && lng && !cityId) {
    api.get(`/geo/detect-city?lat=${lat}&lng=${lng}`)
      .then(data => {
        if (data?.id) setCityId(data.id);
      })
      .catch(() => {});
  }
}, [lat, lng]);

  const {
    pois, route, nearbyExplorers, events, liveSessions,
    llmLoading, error, loadPOIsForBBox, loadNearbyData,
    generateRoute, clearRoute, QUICK_PROMPTS,
  } = useExplorer(cityId);

  // Konum alındığında yakındaki verileri yükle
  useEffect(() => {
    if (lat && lng) {
      loadNearbyData(lat, lng);
    }
  }, [lat, lng]);

  useEffect(() => {
    if (route) openSheet();
  }, [route]);

  const openSheet = () => {
    setShowSheet(true);
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true }).start();
  };

  const closeSheet = () => {
    Animated.timing(sheetAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
      setShowSheet(false);
      clearRoute();
    });
  };

  const onRegionChangeComplete = useCallback((region) => {
    loadPOIsForBBox(region);
  }, [loadPOIsForBBox]);

  const toggleExplorerStatus = async () => {
    if (!lat || !lng) return;
    try {
      await updateExplorerStatus(lat, lng, !isExplorerActive, cityId);
      setExplorerActive(!isExplorerActive);
    } catch (e) { Alert.alert('Hata', e.message); }
  };

  const handleSearch = () => {
    if (!prompt.trim()) return;
    generateRoute(prompt, location?.coords);
  };

  const sheetTranslateY = sheetAnim.interpolate({
    inputRange: [0, 1], outputRange: [400, 0],
  });

  const initialRegion = (lat && lng)
    ? { latitude: lat, longitude: lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }
    : DEFAULT_REGION;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider="google"
        showsUserLocation
        followsUserLocation={!route}
        initialRegion={initialRegion}
        onRegionChangeComplete={onRegionChangeComplete}
        onPress={() => setSelectedPOI(null)}
      >
        {pois.map(poi => (
          <Marker
            key={poi.id}
            coordinate={{ latitude: poi.lat, longitude: poi.lng }}
            onPress={() => setSelectedPOI(poi)}
          >
            <View style={[styles.pin, { backgroundColor: CATEGORY_COLORS[poi.category] || '#6B7280' }]}>
              <Text style={styles.pinText}>{poi.is_sponsored ? '⭐' : '📍'}</Text>
            </View>
          </Marker>
        ))}

        {nearbyExplorers.map(ex => (
          <Circle
            key={ex.user_id}
            center={{ latitude: ex.lat || 39.9, longitude: ex.lng || 32.8 }}
            radius={30}
            fillColor="rgba(34,197,94,0.2)"
            strokeColor="#22C55E"
            strokeWidth={1}
          />
        ))}

        {route?.stops && route.stops.length > 1 && (
          <Polyline
            coordinates={route.stops.filter(s => s.lat && s.lng).map(s => ({ latitude: s.lat, longitude: s.lng }))}
            strokeColor="#22C55E"
            strokeWidth={3}
          />
        )}
        {route?.stops?.map((s, i) => s.lat && (
          <Marker key={i} coordinate={{ latitude: s.lat, longitude: s.lng }}>
            <View style={[styles.routePin, {
              backgroundColor: i === 0 ? '#22C55E' : i === route.stops.length - 1 ? '#2196F3' : '#FF9800',
            }]}>
              <Text style={styles.routePinText}>{i + 1}</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Üst katman */}
      <View style={[styles.overlay, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.overlayTitle}>Nereye gitmek istersin?</Text>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={20} color="#888" />
            <TextInput
              style={styles.searchInput}
              placeholder="Tarihi bir rota öner, kamp yeri bul..."
              placeholderTextColor="#555"
              value={prompt}
              onChangeText={setPrompt}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            {prompt ? (
              <TouchableOpacity onPress={() => setPrompt('')}>
                <Ionicons name="close-circle" size={18} color="#888" />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity
            style={[styles.aiBtn, llmLoading && styles.aiBtnLoading]}
            onPress={handleSearch}
            disabled={llmLoading}
          >
            {llmLoading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Ionicons name="sparkles" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickRow}>
          {QUICK_PROMPTS.map((p, i) => (
            <TouchableOpacity key={i} style={styles.quickChip}
              onPress={() => { setPrompt(p); generateRoute(p, location?.coords); }}>
              <Text style={styles.quickText}>{p}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Sağ butonlar */}
      <View style={[styles.rightBtns, { top: insets.top + 140 }]}>
        <TouchableOpacity style={styles.fab} onPress={() => router.push('/explorer/chat')}>
    <Ionicons name="chatbubble-ellipses-outline" size={22} color="#22C55E" />
  </TouchableOpacity>
  <Text style={styles.fabLabel}>AI Kaşif</Text>
        <TouchableOpacity
          style={[styles.fab, isExplorerActive && { backgroundColor: '#22C55E' }]}
          onPress={toggleExplorerStatus}
        >
          <Ionicons name="people-outline" size={22} color={isExplorerActive ? '#fff' : '#ccc'} />
        </TouchableOpacity>
        <Text style={styles.fabLabel}>
          {nearbyExplorers.length > 0 ? `${nearbyExplorers.length} gezgin` : 'Beraber Gez'}
        </Text>

        <TouchableOpacity style={styles.fab} onPress={() => router.push('/events/index')}>
          <Ionicons name="calendar-outline" size={22} color="#ccc" />
        </TouchableOpacity>
        <Text style={styles.fabLabel}>{events.length > 0 ? `${events.length} etkinlik` : 'Etkinlikler'}</Text>

        <TouchableOpacity style={styles.fab} onPress={() => router.push('/live/index')}>
          <Ionicons name="radio-outline" size={22} color="#ccc" />
        </TouchableOpacity>
        <Text style={styles.fabLabel}>{liveSessions.length > 0 ? `${liveSessions.length} canlı` : 'Canlı'}</Text>

        <TouchableOpacity style={styles.fab} onPress={() => router.push('/messages/index')}>
          <Ionicons name="chatbubble-outline" size={22} color="#ccc" />
        </TouchableOpacity>
        <Text style={styles.fabLabel}>Mesajlar</Text>
      </View>

      {/* Seçili POI popup */}
      {selectedPOI && (
        <TouchableOpacity
          style={styles.poiPopup}
          onPress={() => router.push(`/poi/${selectedPOI.id}`)}
        >
          <Text style={styles.poiName}>{selectedPOI.name}</Text>
          <View style={styles.poiMeta}>
            {selectedPOI.is_sponsored && <Text style={styles.poiSponsored}>⭐ Sponsor</Text>}
            <Text style={styles.poiRating}>★ {(selectedPOI.rating || 0).toFixed(1)}</Text>
            <Text style={styles.poiCategory}>{selectedPOI.category}</Text>
          </View>
          <Text style={styles.poiMore}>Detay →</Text>
        </TouchableOpacity>
      )}

      {/* LLM Rota Bottom Sheet */}
      {showSheet && route && (
        <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{route.title || 'AI Rotası'}</Text>
            <TouchableOpacity onPress={closeSheet}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.sheetBadges}>
            <View style={styles.badge}><Text style={styles.badgeText}>{route.total_hours ? `${route.total_hours} saat` : ''}</Text></View>
            <View style={styles.badge}><Text style={styles.badgeText}>{route.stop_count} durak</Text></View>
            {route.vibe && (
              <View style={[styles.badge, { backgroundColor: '#1A2E1A' }]}>
                <Text style={[styles.badgeText, { color: '#22C55E' }]}>{route.vibe}</Text>
              </View>
            )}
          </View>

          {route.highlights?.length > 0 && (
            <View style={styles.aiNote}>
              <Ionicons name="sparkles" size={14} color="#22C55E" />
              <Text style={styles.aiNoteText}>{route.highlights.join(' · ')}</Text>
            </View>
          )}

          <Text style={styles.stopsLabel}>GÜZERGAH ({route.stop_count} DURAK)</Text>
          <ScrollView style={{ maxHeight: 160 }}>
            {route.stops?.map((stop, i) => (
              <View key={i} style={styles.stopRow}>
                <View style={[styles.stopDot, {
                  backgroundColor: i === 0 ? '#22C55E' : i === route.stops.length - 1 ? '#2196F3' : '#FF9800',
                }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.stopName}>{stop.name || `Durak ${i + 1}`}</Text>
                  {stop.suggested_time && (
                    <Text style={styles.stopTime}>{stop.suggested_time} · {stop.est_duration_min || 30} dk</Text>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.renewBtn}
              onPress={() => { closeSheet(); generateRoute(prompt, location?.coords); }}>
              <Ionicons name="refresh-outline" size={18} color="#fff" />
              <Text style={styles.renewText}>Yenile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.startBtn}
              onPress={() => { closeSheet(); router.push(`/route/${route.route_id}`); }}
            >
              <Ionicons name="navigate" size={18} color="#fff" />
              <Text style={styles.startText}>Rotayı Başlat</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#0D0D0D' },
  overlay:       { position: 'absolute', left: 0, right: 0, paddingHorizontal: 16 },
  overlayTitle:  { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 10 },
  searchRow:     { flexDirection: 'row', gap: 8, marginBottom: 8 },
  searchBox:     { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(20,20,20,0.95)', borderRadius: 12, paddingHorizontal: 12, height: 48, gap: 8, borderWidth: 0.5, borderColor: '#2A2A2A' },
  searchInput:   { flex: 1, color: '#fff', fontSize: 14 },
  aiBtn:         { width: 48, height: 48, backgroundColor: '#22C55E', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  aiBtnLoading:  { backgroundColor: '#166534' },
  quickRow:      { marginBottom: 8 },
  quickChip:     { backgroundColor: 'rgba(20,20,20,0.9)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8, borderWidth: 0.5, borderColor: '#2A2A2A' },
  quickText:     { color: '#ccc', fontSize: 12 },
  rightBtns:     { position: 'absolute', right: 12, alignItems: 'center', gap: 4 },
  fab:           { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(20,20,20,0.9)', alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: '#2A2A2A' },
  fabLabel:      { color: '#888', fontSize: 9, textAlign: 'center', maxWidth: 55 },
  pin:           { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff' },
  pinText:       { fontSize: 12 },
  routePin:      { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  routePinText:  { color: '#fff', fontSize: 11, fontWeight: '700' },
  poiPopup:      { position: 'absolute', bottom: 110, left: 16, right: 16, backgroundColor: '#1A1A1A', borderRadius: 16, padding: 16, borderWidth: 0.5, borderColor: '#2A2A2A' },
  poiName:       { color: '#fff', fontSize: 16, fontWeight: '600' },
  poiMeta:       { flexDirection: 'row', gap: 8, marginTop: 4 },
  poiSponsored:  { color: '#F59E0B', fontSize: 12 },
  poiRating:     { color: '#22C55E', fontSize: 12 },
  poiCategory:   { color: '#888', fontSize: 12 },
  poiMore:       { color: '#22C55E', fontSize: 13, marginTop: 8 },
  sheet:         { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  sheetHandle:   { width: 40, height: 4, backgroundColor: '#333', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sheetTitle:    { color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 },
  sheetBadges:   { flexDirection: 'row', gap: 8, marginBottom: 10 },
  badge:         { backgroundColor: '#1A1A1A', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 0.5, borderColor: '#2A2A2A' },
  badgeText:     { color: '#ccc', fontSize: 12 },
  aiNote:        { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0A1F0A', borderRadius: 8, padding: 8, marginBottom: 10 },
  aiNoteText:    { color: '#22C55E', fontSize: 12, flex: 1 },
  stopsLabel:    { color: '#555', fontSize: 10, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8 },
  stopRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  stopDot:       { width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0 },
  stopName:      { color: '#fff', fontSize: 13, fontWeight: '500' },
  stopTime:      { color: '#888', fontSize: 11, marginTop: 1 },
  sheetActions:  { flexDirection: 'row', gap: 10, marginTop: 16 },
  renewBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, borderWidth: 0.5, borderColor: '#2A2A2A', paddingVertical: 13 },
  renewText:     { color: '#fff', fontSize: 14, fontWeight: '500' },
  startBtn:      { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#22C55E', borderRadius: 12, paddingVertical: 13 },
  startText:     { color: '#fff', fontSize: 15, fontWeight: '600' },
  errorBar:      { position: 'absolute', bottom: 100, left: 16, right: 16, backgroundColor: '#7f1d1d', borderRadius: 10, padding: 12 },
  errorText:     { color: '#fca5a5', fontSize: 13, textAlign: 'center' },
});