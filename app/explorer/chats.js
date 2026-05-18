// ── app/explorer/chat.js ─────────────────────────────────────────────────────
import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, Modal, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { auth } from '../../src/firebase/config';
import { API_BASE } from '../../constants/api';
import useUserLocation from '../../hooks/useUserLocation';

const QUICK_QUESTIONS = [
  '📍 Yakınımda ne var?',
  '🏛️ Tarihi yerler',
  '☕ Kafe öner',
  '🥾 Yürüyüş rotası',
  '🌅 Manzara noktaları',
];

// ── Konum kartı ───────────────────────────────────────────────────────────────
function LocationCard({ loc, onPress }) {
  return (
    <TouchableOpacity style={lc.card} onPress={onPress} activeOpacity={0.8}>
      <View style={lc.left}>
        <View style={lc.iconWrap}>
          <Ionicons name="location" size={18} color="#22C55E" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={lc.name} numberOfLines={1}>{loc.name}</Text>
          {loc.description ? (
            <Text style={lc.desc} numberOfLines={2}>{loc.description}</Text>
          ) : null}
          {loc.best_time ? (
            <Text style={lc.time}>🕐 {loc.best_time}</Text>
          ) : null}
          {loc.tags?.length > 0 && (
            <View style={lc.tags}>
              {loc.tags.slice(0, 3).map((t, i) => (
                <View key={i} style={lc.tag}>
                  <Text style={lc.tagText}>{t}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
      <View style={lc.mapBtn}>
        <Ionicons name="map" size={14} color="#22C55E" />
        <Text style={lc.mapBtnText}>Harita</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Mesaj balonu ──────────────────────────────────────────────────────────────
function MessageBubble({ item, onLocationPress }) {
  const isUser = item.role === 'user';
  return (
    <View style={[mb.wrap, isUser && mb.wrapUser]}>
      {!isUser && (
        <View style={mb.avatar}>
          <Ionicons name="compass" size={14} color="#22C55E" />
        </View>
      )}
      <View style={[mb.bubble, isUser ? mb.bubbleUser : mb.bubbleBot]}>
        <Text style={[mb.text, isUser && mb.textUser]}>{item.content}</Text>

        {/* Konum kartları */}
        {item.locations?.length > 0 && (
          <View style={mb.locations}>
            {item.locations.map((loc, i) => (
              <LocationCard key={i} loc={loc} onPress={() => onLocationPress(loc)} />
            ))}
          </View>
        )}

        {/* Rota önerisi */}
        {item.route_suggestion && (
          <View style={mb.routeBox}>
            <Text style={mb.routeTitle}>🗺️ {item.route_suggestion.title}</Text>
            {item.route_suggestion.steps?.map((step, i) => (
              <Text key={i} style={mb.routeStep}>{step}</Text>
            ))}
            {(item.route_suggestion.duration || item.route_suggestion.distance) && (
              <Text style={mb.routeMeta}>
                {item.route_suggestion.duration && `⏱️ ${item.route_suggestion.duration}`}
                {item.route_suggestion.distance && `  📏 ${item.route_suggestion.distance}`}
              </Text>
            )}
          </View>
        )}

        {/* İpuçları */}
        {item.tips?.length > 0 && (
          <View style={mb.tipsBox}>
            {item.tips.map((tip, i) => (
              <Text key={i} style={mb.tip}>💡 {tip}</Text>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ── OSM Harita Modalı ─────────────────────────────────────────────────────────
function OSMMapModal({ location, onClose, insets }) {
  if (!location) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={map.container}>
        {/* Header */}
        <View style={[map.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onClose} style={map.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={map.title} numberOfLines={1}>{location.name}</Text>
            {location.description ? (
              <Text style={map.subtitle} numberOfLines={1}>{location.description}</Text>
            ) : null}
          </View>
        </View>

        {/* OpenStreetMap */}
        <MapView
          style={{ flex: 1 }}
          initialRegion={{
            latitude:       location.lat,
            longitude:      location.lng,
            latitudeDelta:  0.008,
            longitudeDelta: 0.008,
          }}
        >
          {/* OSM Tile katmanı — Google Maps kullanmaz */}
          <UrlTile
            urlTemplate="https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
            maximumZ={19}
            flipY={false}
            tileSize={256}
          />
          <Marker
            coordinate={{ latitude: location.lat, longitude: location.lng }}
            title={location.name}
            description={location.description}
          >
            <View style={map.pin}>
              <Ionicons name="location" size={32} color="#22C55E" />
            </View>
          </Marker>
        </MapView>

        {/* Alt bilgi şeridi */}
        <View style={[map.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={map.footerRow}>
            <Ionicons name="location-outline" size={14} color="#888" />
            <Text style={map.coords}>
              {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
            </Text>
          </View>
          {location.tags?.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              {location.tags.map((t, i) => (
                <View key={i} style={map.tag}>
                  <Text style={map.tagText}>{t}</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Ana Ekran ─────────────────────────────────────────────────────────────────
export default function ExplorerChatScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const listRef = useRef(null);
  const historyRef = useRef([]);
  const { location } = useUserLocation();

  const [messages, setMessages] = useState([{
    id: '0',
    role: 'assistant',
    content: 'Merhaba! Ben MOVO Kaşif Asistanı 🧭\n\nSana yakındaki yerler, rotalar ve seyahat önerileri konusunda yardımcı olabilirim. Ne keşfetmek istersin?',
    locations: [],
  }]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [mapLocation, setMapLocation] = useState(null);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || loading) return;

    const userMsg = { id: `u${Date.now()}`, role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE}/explorer/chat`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: text.trim(),
          lat:     location?.coords?.latitude  ?? null,
          lng:     location?.coords?.longitude ?? null,
          history: historyRef.current.slice(-6),
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Sunucu hatası (${res.status}): ${err.slice(0, 100)}`);
      }

      const data = await res.json();
      const botMsg = {
        id:              `b${Date.now()}`,
        role:            'assistant',
        content:         data.response || 'İşte önerilerim!',
        locations:       data.locations || [],
        tips:            data.tips || [],
        route_suggestion: data.route_suggestion || null,
      };

      setMessages(prev => [...prev, botMsg]);
      historyRef.current.push(
        { role: 'user',      content: text.trim() },
        { role: 'assistant', content: data.response || '' },
      );
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
    } catch (e) {
      setMessages(prev => [...prev, {
        id:        `e${Date.now()}`,
        role:      'assistant',
        content:   `⚠️ ${e.message}`,
        locations: [],
      }]);
    } finally {
      setLoading(false);
    }
  }, [loading, location]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="compass" size={18} color="#22C55E" />
          <Text style={styles.headerTitle}>Kaşif Asistan</Text>
          {location && (
            <View style={styles.locBadge}>
              <Ionicons name="location" size={10} color="#22C55E" />
              <Text style={styles.locBadgeText}>Konum aktif</Text>
            </View>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Mesaj listesi */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <MessageBubble item={item} onLocationPress={setMapLocation} />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Yükleniyor göstergesi */}
      {loading && (
        <View style={styles.loadingRow}>
          <View style={styles.loadingAvatar}>
            <Ionicons name="compass" size={14} color="#22C55E" />
          </View>
          <View style={styles.loadingBubble}>
            <ActivityIndicator color="#22C55E" size="small" />
            <Text style={styles.loadingText}>Düşünüyor...</Text>
          </View>
        </View>
      )}

      {/* Hızlı sorular — sadece başlangıçta */}
      {messages.length <= 1 && !loading && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickRow}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {QUICK_QUESTIONS.map((q, i) => (
            <TouchableOpacity key={i} style={styles.quickChip} onPress={() => sendMessage(q)}>
              <Text style={styles.quickText}>{q}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Input */}
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={styles.input}
          placeholder="Nereye gitmek istersin?"
          placeholderTextColor="#555"
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={300}
          returnKeyType="send"
          onSubmitEditing={() => sendMessage(input)}
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnOff]}
          onPress={() => sendMessage(input)}
          disabled={!input.trim() || loading}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* OSM Harita Modalı */}
      {mapLocation && (
        <OSMMapModal
          location={mapLocation}
          onClose={() => setMapLocation(null)}
          insets={insets}
        />
      )}
    </KeyboardAvoidingView>
  );
}

// ── Stiller ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#0A0A0A' },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: '#1C1C1C' },
  backBtn:       { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  locBadge:      { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#0A1F0A', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  locBadgeText:  { color: '#22C55E', fontSize: 9, fontWeight: '600' },
  listContent:   { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  loadingRow:    { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  loadingAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#0A1F0A', alignItems: 'center', justifyContent: 'center' },
  loadingBubble: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1A1A1A', borderRadius: 16, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 10 },
  loadingText:   { color: '#888', fontSize: 13 },
  quickRow:      { paddingVertical: 8 },
  quickChip:     { backgroundColor: '#1A1A1A', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 0.5, borderColor: '#2A2A2A' },
  quickText:     { color: '#ccc', fontSize: 13 },
  inputBar:      { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: '#1C1C1C', backgroundColor: '#0A0A0A' },
  input:         { flex: 1, backgroundColor: '#111', color: '#fff', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, maxHeight: 100, borderWidth: 0.5, borderColor: '#2A2A2A' },
  sendBtn:       { width: 42, height: 42, backgroundColor: '#22C55E', borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  sendBtnOff:    { backgroundColor: '#1A3A1A', opacity: 0.5 },
});

const mb = StyleSheet.create({
  wrap:       { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4 },
  wrapUser:   { flexDirection: 'row-reverse' },
  avatar:     { width: 28, height: 28, borderRadius: 14, backgroundColor: '#0A1F0A', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  bubble:     { maxWidth: '82%', borderRadius: 18, padding: 12 },
  bubbleBot:  { backgroundColor: '#1A1A1A', borderBottomLeftRadius: 4 },
  bubbleUser: { backgroundColor: '#22C55E', borderBottomRightRadius: 4 },
  text:       { color: '#ddd', fontSize: 14, lineHeight: 20 },
  textUser:   { color: '#fff' },
  locations:  { marginTop: 10, gap: 8 },
  routeBox:   { marginTop: 10, backgroundColor: '#0A1F0A', borderRadius: 10, padding: 10 },
  routeTitle: { color: '#22C55E', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  routeStep:  { color: '#ccc', fontSize: 12, lineHeight: 18, marginBottom: 2 },
  routeMeta:  { color: '#888', fontSize: 11, marginTop: 4 },
  tipsBox:    { marginTop: 8, gap: 4 },
  tip:        { color: '#aaa', fontSize: 12, lineHeight: 18 },
});

const lc = StyleSheet.create({
  card:       { backgroundColor: '#111', borderRadius: 12, padding: 10, borderWidth: 0.5, borderColor: '#2A2A2A', flexDirection: 'row', alignItems: 'center', gap: 10 },
  left:       { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  iconWrap:   { width: 30, height: 30, borderRadius: 15, backgroundColor: '#0A1F0A', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  name:       { color: '#fff', fontSize: 13, fontWeight: '600' },
  desc:       { color: '#888', fontSize: 11, marginTop: 2, lineHeight: 16 },
  time:       { color: '#555', fontSize: 11, marginTop: 3 },
  tags:       { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  tag:        { backgroundColor: '#1A2E1A', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  tagText:    { color: '#22C55E', fontSize: 10 },
  mapBtn:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#0A1F0A', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
  mapBtnText: { color: '#22C55E', fontSize: 11, fontWeight: '600' },
});

const map = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#0A0A0A' },
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#0A0A0A', borderBottomWidth: 0.5, borderBottomColor: '#1C1C1C' },
  backBtn:    { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title:      { color: '#fff', fontSize: 16, fontWeight: '700' },
  subtitle:   { color: '#888', fontSize: 12, marginTop: 2 },
  pin:        { alignItems: 'center' },
  footer:     { backgroundColor: '#0A0A0A', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: '#1C1C1C' },
  footerRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coords:     { color: '#555', fontSize: 12 },
  tag:        { backgroundColor: '#1A2E1A', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginRight: 6 },
  tagText:    { color: '#22C55E', fontSize: 11 },
});