// ── components/RoutePostCard.js ──────────────────────────────────────────────
// Feed'de rota gönderilerini harita kartı olarak gösterir.
// Karta tıklandığında rotayı canlı takip edebilirsin.
// Kullanım:
//   import RoutePostCard from '../../components/RoutePostCard';
//   <RoutePostCard route={post.route_data} postId={post.id} />

import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
  Animated, Image,
} from 'react-native';
import MapView, { Polyline, Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');
const CARD_H    = width * 0.58;

const TRANSPORT_META = {
  walking:  { icon: '🚶', label: 'Yürüyüş', color: '#22C55E' },
  cycling:  { icon: '🚴', label: 'Bisiklet', color: '#3B82F6' },
  driving:  { icon: '🚗', label: 'Araç',     color: '#F97316' },
};

function fmtDist(m) {
  if (!m) return null;
  return m > 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
function fmtDuration(s) {
  if (!s) return null;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} dk` : `${Math.floor(m / 60)} sa`;
}

// ── Harita kartı ─────────────────────────────────────────────────────────────
export default function RoutePostCard({ route, postId, compact = false }) {
  const router   = useRouter();
  const mapRef   = useRef(null);
  const pressAnim = useRef(new Animated.Value(1)).current;
  const [ready, setReady] = useState(false);

  if (!route) return null;

  const stops   = route.stops || [];
  const trail   = route.trail_coords || [];
  const meta    = TRANSPORT_META[route.transport_mode] || TRANSPORT_META.walking;
  const polyCoords = (trail.length > 1 ? trail : stops)
    .map(c => ({ latitude: c.lat ?? c.latitude, longitude: c.lng ?? c.longitude }))
    .filter(c => c.latitude && c.longitude);

  const initialRegion = polyCoords.length > 0 ? {
    latitude:      polyCoords[Math.floor(polyCoords.length / 2)].latitude,
    longitude:     polyCoords[Math.floor(polyCoords.length / 2)].longitude,
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
  } : null;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(pressAnim, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.timing(pressAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start(() => {
      // Rota detayına git — orada "canlı takip et" butonu olacak
      if (route.id) router.push(`/route/${route.id}`);
    });
  };

  const onMapReady = () => {
    if (polyCoords.length > 1) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(polyCoords, {
          edgePadding: { top: 24, right: 24, bottom: 24, left: 24 },
          animated: false,
        });
        setReady(true);
      }, 100);
    } else {
      setReady(true);
    }
  };

  return (
    <Animated.View style={[rc.wrapper, { transform: [{ scale: pressAnim }] }]}>
      <TouchableOpacity activeOpacity={0.95} onPress={handlePress} style={rc.card}>

        {/* ── Harita ── */}
        <View style={[rc.mapWrap, compact && rc.mapWrapCompact]}>
          {initialRegion ? (
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              initialRegion={initialRegion}
              onMapReady={onMapReady}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              pointerEvents="none"
              showsCompass={false}
              showsScale={false}
              showsBuildings={false}
              showsTraffic={false}
              provider="google"
            >
              {/* Trail çizgisi */}
              {polyCoords.length > 1 && (
                <Polyline
                  coordinates={polyCoords}
                  strokeColor={meta.color}
                  strokeWidth={compact ? 2.5 : 3.5}
                  lineJoin="round"
                  lineCap="round"
                />
              )}

              {/* Glow efekti — kalın şeffaf alt çizgi */}
              {polyCoords.length > 1 && (
                <Polyline
                  coordinates={polyCoords}
                  strokeColor={`${meta.color}33`}
                  strokeWidth={compact ? 6 : 9}
                  lineJoin="round"
                />
              )}

              {/* Başlangıç marker */}
              {polyCoords.length > 0 && (
                <Marker coordinate={polyCoords[0]} tracksViewChanges={false}>
                  <View style={[rc.startPin, { backgroundColor: meta.color }]}>
                    <Text style={rc.startPinTxt}>A</Text>
                  </View>
                </Marker>
              )}

              {/* Bitiş marker */}
              {polyCoords.length > 1 && (
                <Marker coordinate={polyCoords[polyCoords.length - 1]} tracksViewChanges={false}>
                  <View style={[rc.endPin, { borderColor: meta.color }]}>
                    <View style={[rc.endPinDot, { backgroundColor: meta.color }]} />
                  </View>
                </Marker>
              )}

              {/* Ara duraklar */}
              {stops.slice(1, -1).map((s, i) => (
                s.lat && s.lng ? (
                  <Marker
                    key={i}
                    coordinate={{ latitude: s.lat, longitude: s.lng }}
                    tracksViewChanges={false}
                  >
                    <View style={rc.midPin} />
                  </Marker>
                ) : null
              ))}
            </MapView>
          ) : (
            <View style={[StyleSheet.absoluteFill, rc.noMap]}>
              <Ionicons name="map-outline" size={32} color="#2A2A2A" />
            </View>
          )}

          {/* Gradient overlay */}
          <LinearGradient
            colors={['transparent', 'rgba(10,10,10,0.85)']}
            style={rc.mapGrad}
            pointerEvents="none"
          />

          {/* Transport badge */}
          <View style={rc.transportBadge}>
            <Text style={rc.transportIcon}>{meta.icon}</Text>
            <Text style={rc.transportLabel}>{meta.label}</Text>
          </View>

          {/* "Takip Et" butonu */}
          <TouchableOpacity
            style={rc.followBtn}
            onPress={() => route.id && router.push(`/route/walk/${route.id}`)}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate" size={14} color="#fff" />
            <Text style={rc.followTxt}>Takip Et</Text>
          </TouchableOpacity>

          {/* Durak sayısı */}
          {stops.length > 0 && (
            <View style={rc.stopsBadge}>
              <Ionicons name="pin" size={10} color="#22C55E" />
              <Text style={rc.stopsTxt}>{stops.length} durak</Text>
            </View>
          )}
        </View>

        {/* ── Alt bilgi ── */}
        <View style={rc.info}>
          <Text style={rc.routeTitle} numberOfLines={1}>
            {route.title || 'İsimsiz Rota'}
          </Text>
          <View style={rc.metaRow}>
            {fmtDist(route.distance_m) && (
              <View style={rc.metaChip}>
                <Ionicons name="resize-outline" size={11} color="#888" />
                <Text style={rc.metaVal}>{fmtDist(route.distance_m)}</Text>
              </View>
            )}
            {fmtDuration(route.duration_sec) && (
              <View style={rc.metaChip}>
                <Ionicons name="time-outline" size={11} color="#888" />
                <Text style={rc.metaVal}>{fmtDuration(route.duration_sec)}</Text>
              </View>
            )}
            {stops.length > 0 && (
              <View style={rc.metaChip}>
                <Ionicons name="location-outline" size={11} color="#888" />
                <Text style={rc.metaVal}>{stops.length} durak</Text>
              </View>
            )}
            <TouchableOpacity
              style={rc.detailBtn}
              onPress={() => route.id && router.push(`/route/${route.id}`)}
            >
              <Text style={rc.detailTxt}>Detay</Text>
              <Ionicons name="chevron-forward" size={12} color="#22C55E" />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Stiller ───────────────────────────────────────────────────────────────────
const rc = StyleSheet.create({
  wrapper:      { marginTop: 10, marginHorizontal: 0 },
  card:         { backgroundColor: '#111', borderRadius: 20, overflow: 'hidden', borderWidth: 0.5, borderColor: '#1C1C1C' },

  mapWrap:      { height: CARD_H, position: 'relative', backgroundColor: '#0A0A0A' },
  mapWrapCompact:{ height: CARD_H * 0.7 },
  noMap:        { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F0F0F' },
  mapGrad:      { position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%' },

  // Transport badge
  transportBadge: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.08)' },
  transportIcon:  { fontSize: 13 },
  transportLabel: { color: '#ddd', fontSize: 11, fontWeight: '600' },

  // Follow button
  followBtn:    { position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#22C55E', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, shadowColor: '#22C55E', shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  followTxt:    { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Stops badge
  stopsBadge:   { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  stopsTxt:     { color: '#22C55E', fontSize: 11, fontWeight: '600' },

  // Markers
  startPin:     { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  startPinTxt:  { color: '#fff', fontSize: 10, fontWeight: '800' },
  endPin:       { width: 18, height: 18, borderRadius: 9, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  endPinDot:    { width: 8, height: 8, borderRadius: 4 },
  midPin:       { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#555' },

  // Info section
  info:         { paddingHorizontal: 14, paddingVertical: 10 },
  routeTitle:   { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 6 },
  metaRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metaChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1A1A1A', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  metaVal:      { color: '#888', fontSize: 11 },
  detailBtn:    { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 'auto' },
  detailTxt:    { color: '#22C55E', fontSize: 12, fontWeight: '600' },
});