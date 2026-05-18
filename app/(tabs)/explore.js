// ── app/(tabs)/explore.js ────────────────────────────────────────────────────
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, FlatList, ActivityIndicator, Dimensions,
  KeyboardAvoidingView, Platform, Alert, Modal, Pressable,
} from 'react-native';
import MapView, { Marker, UrlTile, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

const { width, height } = Dimensions.get('window');

const QUICK = [
  { icon: '🥾', text: 'Yürüyüş rotası öner',     color: '#1A3A1A' },
  { icon: '⛺', text: 'Kamp yapılacak yerler',     color: '#1A2A3A' },
  { icon: '🏛️', text: 'Tarihi yerler',             color: '#2A1A3A' },
  { icon: '🍽️', text: 'Yerel lezzetler',          color: '#3A1A1A' },
  { icon: '📸', text: 'Fotoğraf noktaları',        color: '#1A3A2A' },
  { icon: '🌅', text: 'Gün batımı yerleri',        color: '#3A2A1A' },
  { icon: '🏕️', text: '3 saatlik gezi planı yap', color: '#1A1A3A' },
  { icon: '🚴', text: 'Bisiklet rotası',            color: '#2A3A1A' },
];
const EVENT_FILTERS = ['Tümü', 'Doğa', 'Kamp', 'Bisiklet', 'Kültür', 'Müzik', 'Yürüyüş'];
const TOURIST_PLANS = [
  { icon: '🌅', title: '3 Saatlik Sabah Turu',   query: '3 saatlik sabah yürüyüş planı yap, tarihi ve kültürel yerler' },
  { icon: '🍽️', title: 'Yemek & Kültür Rotası', query: 'Kahvaltıdan akşam yemeğine rota öner' },
  { icon: '📸', title: 'Fotoğraf Rotası',         query: 'En iyi fotoğraf noktaları, en iyi çekim saatlerini söyle' },
  { icon: '🏛️', title: 'Tarihi Tur',             query: 'Tarihi yerleri kapsayan gün boyu tur planla' },
  { icon: '🌿', title: 'Doğa & Huzur',           query: 'Kalabalıktan uzak, huzurlu doğa yerleri öner' },
  { icon: '🚴', title: 'Aktif Macera',            query: 'Yürüyüş ve bisiklet rotaları öner' },
];

// ── OSRM Yol tarifi ───────────────────────────────────────────────────────────
const OSRM_PROFILES = { walking: 'foot', cycling: 'bike', driving: 'car' };

async function fetchOSRMRoute(fromLat, fromLng, toLat, toLng, mode = 'walking') {
  const profile = OSRM_PROFILES[mode] || 'foot';
  const url = `https://router.project-osrm.org/route/v1/${profile}/${fromLng},${fromLat};${toLng},${toLat}?steps=true&geometries=geojson&overview=full`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error('Rota alınamadı');
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('Rota bulunamadı');

  const route    = data.routes[0];
  const coords   = route.geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
  const steps    = route.legs[0]?.steps || [];
  const dist     = route.distance;
  const duration = route.duration;

  const stepsFormatted = steps
    .filter(s => s.maneuver?.instruction || s.name)
    .map(s => {
      const instr = s.maneuver?.instruction || '';
      const name  = s.name ? `"${s.name}"` : '';
      const d     = s.distance > 0 ? ` (${s.distance > 1000 ? `${(s.distance/1000).toFixed(1)} km` : `${Math.round(s.distance)} m`})` : '';
      return (instr + (name ? ' ' + name : '') + d).trim();
    })
    .filter(Boolean);

  return { coords, steps: stepsFormatted, dist, duration };
}

function formatDist(m) { return m > 1000 ? `${(m/1000).toFixed(1)} km` : `${Math.round(m)} m`; }
function formatTime(s) {
  const m = Math.round(s / 60);
  return m < 60 ? `${m} dk` : `${Math.floor(m/60)} sa ${m%60} dk`;
}

// ── Navigasyon Haritası ───────────────────────────────────────────────────────
function NavMapModal({ destination, userLoc, visible, onClose }) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const [mode, setMode]         = useState('walking');
  const [route, setRoute]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [showSteps, setShowSteps] = useState(false);

  const fetchRoute = useCallback(async (m = mode) => {
    if (!userLoc || !destination) return;
    setLoading(true); setError(null); setRoute(null);
    try {
      const r = await fetchOSRMRoute(
        userLoc.lat, userLoc.lng,
        destination.lat, destination.lng, m
      );
      setRoute(r);
      // Haritayı rotayı görecek şekilde ayarla
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(r.coords, {
          edgePadding: { top: 80, right: 40, bottom: 200, left: 40 },
          animated: true,
        });
      }, 500);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [userLoc, destination, mode]);

  useEffect(() => {
    if (visible && userLoc && destination) fetchRoute(mode);
  }, [visible, userLoc, destination]);

  if (!visible || !destination) return null;

  const MODES = [
    { key: 'walking',  icon: 'walk-outline',    label: 'Yürüyüş' },
    { key: 'cycling',  icon: 'bicycle-outline', label: 'Bisiklet' },
    { key: 'driving',  icon: 'car-outline',      label: 'Araç'    },
  ];

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
        {/* Header */}
        <View style={[nm.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onClose} style={nm.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={nm.destName} numberOfLines={1}>{destination.name}</Text>
            {route && (
              <Text style={nm.routeInfo}>
                {formatDist(route.dist)} · {formatTime(route.duration)}
              </Text>
            )}
          </View>
          <TouchableOpacity style={nm.stepsBtn} onPress={() => setShowSteps(!showSteps)}>
            <Ionicons name={showSteps ? 'map-outline' : 'list-outline'} size={20} color="#22C55E" />
          </TouchableOpacity>
        </View>

        {/* Ulaşım modu seçimi */}
        <View style={nm.modeBar}>
          {MODES.map(m => (
            <TouchableOpacity
              key={m.key}
              style={[nm.modeBtn, mode === m.key && nm.modeBtnActive]}
              onPress={() => { setMode(m.key); fetchRoute(m.key); }}
            >
              <Ionicons name={m.icon} size={16} color={mode === m.key ? '#22C55E' : '#555'} />
              <Text style={[nm.modeText, mode === m.key && nm.modeTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Harita veya Adımlar */}
        {!showSteps ? (
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            initialRegion={userLoc ? {
              latitude:       userLoc.lat,
              longitude:      userLoc.lng,
              latitudeDelta:  0.02,
              longitudeDelta: 0.02,
            } : undefined}
          >
            <UrlTile
              urlTemplate="https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
              maximumZ={19} flipY={false} tileSize={256}
            />
            {/* Rota çizgisi */}
            {route?.coords && (
              <Polyline
                coordinates={route.coords}
                strokeColor="#22C55E"
                strokeWidth={4}
                lineDashPattern={[1]}
              />
            )}
            {/* Mevcut konum */}
            {userLoc && (
              <Marker coordinate={{ latitude: userLoc.lat, longitude: userLoc.lng }} title="Buradasın">
                <View style={nm.userPin}>
                  <View style={nm.userPinInner} />
                </View>
              </Marker>
            )}
            {/* Hedef */}
            <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} title={destination.name}>
              <View style={nm.destPin}>
                <Ionicons name="location" size={32} color="#ef4444" />
              </View>
            </Marker>
          </MapView>
        ) : (
          /* Adım adım talimatlar */
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            {route?.steps?.length ? (
              route.steps.map((step, i) => (
                <View key={i} style={nm.stepRow}>
                  <View style={nm.stepNumWrap}>
                    <Text style={nm.stepNum}>{i + 1}</Text>
                  </View>
                  <Text style={nm.stepText}>{step}</Text>
                </View>
              ))
            ) : (
              <Text style={{ color: '#555', textAlign: 'center', marginTop: 40 }}>
                {loading ? 'Rota hesaplanıyor…' : error || 'Adım bulunamadı'}
              </Text>
            )}
          </ScrollView>
        )}

        {/* Loading overlay */}
        {loading && (
          <View style={nm.loadingOverlay}>
            <ActivityIndicator color="#22C55E" size="large" />
            <Text style={nm.loadingText}>Rota hesaplanıyor…</Text>
          </View>
        )}

        {/* Hata */}
        {error && !loading && (
          <View style={nm.errorBanner}>
            <Ionicons name="warning-outline" size={16} color="#f59e0b" />
            <Text style={nm.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => fetchRoute(mode)}>
              <Text style={{ color: '#22C55E', fontSize: 13 }}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Alt bilgi */}
        {route && !showSteps && (
          <View style={[nm.footer, { paddingBottom: insets.bottom + 8 }]}>
            <View style={nm.footerInfo}>
              <View style={nm.footerStat}>
                <Ionicons name="navigate-outline" size={16} color="#22C55E" />
                <Text style={nm.footerStatText}>{formatDist(route.dist)}</Text>
              </View>
              <View style={nm.footerDivider} />
              <View style={nm.footerStat}>
                <Ionicons name="time-outline" size={16} color="#22C55E" />
                <Text style={nm.footerStatText}>{formatTime(route.duration)}</Text>
              </View>
            </View>
            <TouchableOpacity style={nm.startNavBtn} onPress={() => setShowSteps(true)}>
              <Ionicons name="list-outline" size={18} color="#fff" />
              <Text style={nm.startNavText}>Adım Adım Tarif</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ── Yer kartı ─────────────────────────────────────────────────────────────────
function LocationCard({ item, onNavigate }) {
  const icons = { poi:'📍', restaurant:'🍽️', camp:'⛺', hotel:'🏨', route_point:'🗺️' };
  return (
    <View style={lc.card}>
      <View style={lc.top}>
        <Text style={lc.emoji}>{icons[item.type] || '📍'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={lc.name} numberOfLines={1}>{item.name}</Text>
          <Text style={lc.desc} numberOfLines={2}>{item.description}</Text>
        </View>
        <TouchableOpacity style={lc.navBtn} onPress={onNavigate}>
          <Ionicons name="navigate" size={16} color="#22C55E" />
          <Text style={lc.navText}>Git</Text>
        </TouchableOpacity>
      </View>
      {item.best_time && (
        <View style={lc.timeRow}>
          <Ionicons name="time-outline" size={11} color="#22C55E" />
          <Text style={lc.time}>En iyi zaman: {item.best_time}</Text>
        </View>
      )}
      {item.tags?.length > 0 && (
        <View style={lc.tags}>
          {item.tags.slice(0, 4).map((t, i) => (
            <View key={i} style={lc.tag}><Text style={lc.tagText}>{t}</Text></View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Rota kartı ────────────────────────────────────────────────────────────────
function RouteCard({ route }) {
  const [expanded, setExpanded] = useState(false);
  if (!route) return null;
  return (
    <View style={rc.card}>
      <TouchableOpacity style={rc.header} onPress={() => setExpanded(!expanded)}>
        <View style={rc.headerLeft}>
          <View style={rc.icon}><Ionicons name="map" size={16} color="#22C55E" /></View>
          <View>
            <Text style={rc.title} numberOfLines={1}>{route.title}</Text>
            <View style={rc.chips}>
              {route.duration && <Text style={rc.chip}>⏱ {route.duration}</Text>}
              {route.distance && <Text style={rc.chip}>📏 {route.distance}</Text>}
            </View>
          </View>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#555" />
      </TouchableOpacity>
      {expanded && route.steps?.map((step, i) => (
        <View key={i} style={rc.step}>
          <View style={rc.stepNum}><Text style={rc.stepNumText}>{i + 1}</Text></View>
          <Text style={rc.stepText}>{step}</Text>
        </View>
      ))}
    </View>
  );
}

// ── AI Yanıt ─────────────────────────────────────────────────────────────────
function AIResponse({ data, onNavigate }) {
  if (!data) return null;
  return (
    <View style={ai.container}>
      <View style={ai.bubble}>
        <View style={ai.avatar}><Text style={{ fontSize: 16 }}>🧭</Text></View>
        <View style={ai.text}><Text style={ai.textContent}>{data.response}</Text></View>
      </View>
      {data.locations?.map((loc, i) => (
        <LocationCard key={i} item={loc} onNavigate={() => onNavigate(loc)} />
      ))}
      {data.route_suggestion && <RouteCard route={data.route_suggestion} />}
      {data.tips?.length > 0 && (
        <View style={ai.tips}>
          <Text style={ai.tipsTitle}>💡 İpuçları</Text>
          {data.tips.map((tip, i) => (
            <View key={i} style={ai.tipRow}>
              <Text style={ai.tipDot}>•</Text>
              <Text style={ai.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Ana ekran ─────────────────────────────────────────────────────────────────
export default function ExploreScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { profile } = useAuth();

  const [activeTab, setActiveTab] = useState('ai');
  const [query, setQuery]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [aiResult, setAiResult]   = useState(null);
  const [history, setHistory]     = useState([]);
  const [userLoc, setUserLoc]     = useState(null);
  const [navDest, setNavDest]     = useState(null);   // navigasyon hedefi
  const [showNav, setShowNav]     = useState(false);
  const [events, setEvents]       = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [activeFilter, setActiveFilter]   = useState('Tümü');
  const [nearby, setNearby]       = useState({ pois: [], events: [] });

  const inputRef  = useRef(null);
  const scrollRef = useRef(null);

  // Konum al
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      }
    })();
  }, []);

  // Etkinlikleri yükle
  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const params = userLoc ? `?lat=${userLoc.lat}&lng=${userLoc.lng}&radius=50000` : '';
      const data = await api.get(`/events/nearby/search${params}&limit=20`);
      setEvents(Array.isArray(data) ? data : data?.events || []);
    } catch { setEvents([]); }
    finally { setEventsLoading(false); }
  }, [userLoc]);

  useFocusEffect(useCallback(() => {
    if (activeTab === 'nearby') {
      (async () => {
        if (!userLoc) return;
        try {
          const data = await api.get(`/explorer/nearby?lat=${userLoc.lat}&lng=${userLoc.lng}&radius=3000`);
          setNearby(data);
        } catch { }
      })();
    }
    if (activeTab === 'events') loadEvents();
  }, [activeTab, userLoc, loadEvents]));

  // Navigasyonu aç
  const openNav = (loc) => {
    if (!userLoc) { Alert.alert('Konum gerekli', 'GPS konumun alınıyor, biraz bekle.'); return; }
    setNavDest(loc);
    setShowNav(true);
  };

  // LLM sorgusu
  const handleSend = async (text) => {
    const msg = (text || query).trim();
    if (!msg || loading) return;
    setQuery('');
    inputRef.current?.blur();
    setLoading(true);
    setAiResult(null);
    const newHistory = [...history, { role: 'user', content: msg }];
    setHistory(newHistory);
    try {
      const res = await api.post('/explorer/chat', {
        message: msg,
        lat: userLoc?.lat || null,
        lng: userLoc?.lng || null,
        history: history.slice(-4),
      });
      setAiResult(res);
      setHistory([...newHistory, { role: 'assistant', content: res.response }]);
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 200);
    } catch (e) {
      setAiResult({ response: `⚠️ ${e.message}`, locations: [], tips: [], route_suggestion: null });
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = activeFilter === 'Tümü'
    ? events
    : events.filter(e => e.categories?.includes(activeFilter.toLowerCase()) || e.category === activeFilter.toLowerCase());

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>🧭 Kaşif Modu</Text>
          <Text style={s.headerSub}>{userLoc ? '📍 Konum aktif · AI destekli' : 'AI destekli keşif'}</Text>
        </View>
        <TouchableOpacity style={s.chatBtn} onPress={() => router.push('/explorer/chat')}>
          <Ionicons name="chatbubbles-outline" size={20} color="#22C55E" />
          <Text style={s.chatBtnText}>Sohbet</Text>
        </TouchableOpacity>
      </View>

      {/* Arama */}
      <View style={s.searchWrap}>
        <Ionicons name="search-outline" size={17} color="#555" />
        <TextInput
          ref={inputRef}
          style={s.searchInput}
          placeholder="Nereye gitmek istersin?"
          placeholderTextColor="#444"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          onSubmitEditing={() => handleSend()}
          editable={!loading}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={16} color="#444" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.sendBtn, (!query.trim() || loading) && s.sendBtnOff]}
          onPress={() => handleSend()}
          disabled={!query.trim() || loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Ionicons name="arrow-forward" size={17} color="#fff" />
          }
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {[
          { key: 'ai',      icon: 'sparkles-outline', label: 'AI Keşif'   },
          { key: 'nearby',  icon: 'compass-outline',  label: 'Yakında'    },
          { key: 'events',  icon: 'calendar-outline', label: 'Etkinlikler'},
          { key: 'tourist', icon: 'globe-outline',    label: 'Turist'     },
        ].map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[s.tab, activeTab === tab.key && s.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons name={tab.icon} size={14} color={activeTab === tab.key ? '#22C55E' : '#555'} />
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 120 }}>

        {/* ── AI KEŞİF ─────────────────────────────────────────────────────── */}
        {activeTab === 'ai' && (
          <View>
            {loading && (
              <View style={s.loadingBox}>
                <ActivityIndicator color="#22C55E" />
                <Text style={s.loadingText}>AI analiz ediyor…</Text>
              </View>
            )}
            {aiResult && !loading && (
              <>
                <AIResponse data={aiResult} onNavigate={openNav} />
                <TouchableOpacity style={s.newBtn} onPress={() => { setAiResult(null); setHistory([]); }}>
                  <Ionicons name="refresh-outline" size={16} color="#22C55E" />
                  <Text style={s.newBtnText}>Yeni Keşif Başlat</Text>
                </TouchableOpacity>
              </>
            )}
            {!aiResult && !loading && (
              <>
                <Text style={s.secTitle}>Hızlı Keşif</Text>
                <View style={s.quickGrid}>
                  {QUICK.map((q, i) => (
                    <TouchableOpacity key={i} style={[s.quickCard, { backgroundColor: q.color }]}
                      onPress={() => handleSend(q.text)} activeOpacity={0.8}>
                      <Text style={s.quickEmoji}>{q.icon}</Text>
                      <Text style={s.quickText}>{q.text}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={s.secTitle}>Örnek Sorular</Text>
                {[
                  '"Ankara\'da tarihi yürüyüş rotası öner, kalabalık olmasın"',
                  '"Gün batımında en güzel manzara noktaları"',
                  '"Karavanla gidebileceğim şehir rotası"',
                ].map((q, i) => (
                  <TouchableOpacity key={i} style={s.exampleQ} onPress={() => handleSend(q.replace(/"/g, ''))}>
                    <Ionicons name="chatbubble-outline" size={13} color="#22C55E" />
                    <Text style={s.exampleQText}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        )}

        {/* ── YAKINIMDA ─────────────────────────────────────────────────────── */}
        {activeTab === 'nearby' && (
          <View style={{ padding: 16 }}>
            {!userLoc ? (
              <View style={s.empty}><Text style={s.emptyIcon}>📍</Text><Text style={s.emptyText}>Konum izni gerekli</Text></View>
            ) : (
              <>
                {nearby.pois.length > 0 && (
                  <>
                    <Text style={s.nearbyTitle}>İlgi Noktaları</Text>
                    {nearby.pois.map(poi => (
                      <TouchableOpacity key={poi.id} style={s.nearbyCard}
                        onPress={() => openNav({ name: poi.name, lat: poi.lat, lng: poi.lng, description: poi.category })}
                        activeOpacity={0.8}>
                        <View style={s.nearbyIcon}><Ionicons name="location-outline" size={20} color="#22C55E" /></View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.nearbyName}>{poi.name}</Text>
                          <Text style={s.nearbyMeta}>{poi.category} · {poi.dist ? `${(poi.dist/1000).toFixed(1)} km` : ''}</Text>
                        </View>
                        <View style={s.navChip}>
                          <Ionicons name="navigate-outline" size={14} color="#22C55E" />
                          <Text style={s.navChipText}>Git</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
                {nearby.pois.length === 0 && (
                  <View style={s.empty}>
                    <Text style={s.emptyIcon}>🔍</Text>
                    <Text style={s.emptyText}>Yakında kayıtlı yer yok</Text>
                    <TouchableOpacity style={s.aiBtn} onPress={() => { setActiveTab('ai'); handleSend('Yakınımda gezilecek yerler öner'); }}>
                      <Text style={s.aiBtnText}>AI'dan Öneri Al</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* ── ETKİNLİKLER ──────────────────────────────────────────────────── */}
        {activeTab === 'events' && (
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll}>
              {EVENT_FILTERS.map(f => (
                <TouchableOpacity key={f} style={[s.filterChip, activeFilter === f && s.filterChipActive]} onPress={() => setActiveFilter(f)}>
                  <Text style={[s.filterText, activeFilter === f && s.filterTextActive]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={s.aiBanner} onPress={() => { setActiveTab('ai'); handleSend('Bu hafta etkinlik öner'); }}>
              <Ionicons name="sparkles-outline" size={16} color="#22C55E" />
              <Text style={s.aiBannerText}>AI ile Etkinlik Bul</Text>
              <Ionicons name="arrow-forward" size={14} color="#22C55E" />
            </TouchableOpacity>
            {eventsLoading ? <ActivityIndicator color="#22C55E" style={{ marginTop: 30 }} /> :
              filteredEvents.length === 0 ? (
                <View style={s.empty}>
                  <Text style={s.emptyIcon}>📅</Text>
                  <Text style={s.emptyText}>Etkinlik bulunamadı</Text>
                </View>
              ) : filteredEvents.map(ev => (
                <TouchableOpacity key={ev.id} style={s.eventCard} onPress={() => router.push(`/events/${ev.id}`)} activeOpacity={0.8}>
                  <View style={s.eventLeft}><Text style={{ fontSize: 22 }}>🗓️</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.eventTitle}>{ev.title}</Text>
                    <Text style={s.eventMeta}>{ev.status}{ev.start_time ? ` · ${new Date(ev.start_time).toLocaleDateString('tr-TR')}` : ''}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#333" />
                </TouchableOpacity>
              ))
            }
            <TouchableOpacity style={s.createBtn} onPress={() => router.push('/events/index')}>
              <Ionicons name="add-circle-outline" size={18} color="#22C55E" />
              <Text style={s.createBtnText}>Etkinlik Oluştur</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── TURİST MODU ──────────────────────────────────────────────────── */}
        {activeTab === 'tourist' && (
          <View>
            <View style={s.touristBanner}>
              <Text style={{ fontSize: 30 }}>🌍</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.touristTitle}>Turist Modu</Text>
                <Text style={s.touristSub}>Hazır gezi planları</Text>
              </View>
            </View>
            <Text style={s.secTitle}>Hazır Planlar</Text>
            {TOURIST_PLANS.map((plan, i) => (
              <TouchableOpacity key={i} style={s.touristCard} onPress={() => { setActiveTab('ai'); handleSend(plan.query); }} activeOpacity={0.8}>
                <View style={s.touristLeft}><Text style={{ fontSize: 26 }}>{plan.icon}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.touristCardTitle}>{plan.title}</Text>
                  <Text style={s.touristCardSub} numberOfLines={1}>{plan.query}</Text>
                </View>
                <View style={s.aiBadge}><Ionicons name="sparkles-outline" size={11} color="#22C55E" /><Text style={s.aiBadgeText}>AI</Text></View>
              </TouchableOpacity>
            ))}
            <Text style={[s.secTitle, { marginTop: 8 }]}>Diğer Özellikler</Text>
            {[
              { icon: '📷', text: 'Görsel tanıma (yakında)' },
              { icon: '🎙️', text: 'Sesli asistan (yakında)' },
              { icon: '🗺️', text: 'Rota oluştur', action: () => router.push('/route/create') },
              { icon: '👥', text: 'Beraber Gez (yakında)' },
            ].map((item, i) => (
              <TouchableOpacity key={i} style={s.featureRow} onPress={item.action || (() => Alert.alert('Yakında', ''))}>
                <Text style={{ fontSize: 20, width: 32, textAlign: 'center' }}>{item.icon}</Text>
                <Text style={s.featureText}>{item.text}</Text>
                {!item.action && <View style={s.soonBadge}><Text style={s.soonText}>Yakında</Text></View>}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Navigasyon Haritası */}
      <NavMapModal
        destination={navDest}
        userLoc={userLoc}
        visible={showNav}
        onClose={() => { setShowNav(false); setNavDest(null); }}
      />
    </View>
  );
}

// ── Stiller ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0A0A0A' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  headerTitle: { color: '#fff', fontSize: 19, fontWeight: '800' },
  headerSub:   { color: '#555', fontSize: 11, marginTop: 1 },
  chatBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#0A2A1A', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6 },
  chatBtnText: { color: '#22C55E', fontSize: 12, fontWeight: '600' },
  searchWrap:  { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10, backgroundColor: '#111', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 0.5, borderColor: '#1C1C1C', gap: 8 },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 9 },
  sendBtn:     { width: 36, height: 36, backgroundColor: '#22C55E', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sendBtnOff:  { backgroundColor: '#1A3A1A', opacity: 0.5 },
  tabs:        { flexDirection: 'row', marginHorizontal: 16, backgroundColor: '#111', borderRadius: 12, padding: 4, marginBottom: 10 },
  tab:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 10 },
  tabActive:   { backgroundColor: '#1A1A1A' },
  tabText:     { color: '#555', fontSize: 11 },
  tabTextActive:{ color: '#22C55E', fontWeight: '600' },
  loadingBox:  { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, backgroundColor: '#111', borderRadius: 12, padding: 14 },
  loadingText: { color: '#888', fontSize: 13 },
  newBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 16, backgroundColor: '#0A2A1A', borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: '#22C55E' },
  newBtnText:  { color: '#22C55E', fontWeight: '600', fontSize: 13 },
  secTitle:    { color: '#888', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginHorizontal: 16, marginTop: 14, marginBottom: 8 },
  quickGrid:   { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 10, marginBottom: 4 },
  quickCard:   { width: (width - 44) / 2, borderRadius: 16, padding: 14, gap: 8 },
  quickEmoji:  { fontSize: 24 },
  quickText:   { color: '#fff', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  exampleQ:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 6, backgroundColor: '#111', borderRadius: 10, padding: 11, borderWidth: 0.5, borderColor: '#1C1C1C' },
  exampleQText:{ color: '#aaa', fontSize: 12, flex: 1, lineHeight: 17 },
  nearbyTitle: { color: '#888', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },
  nearbyCard:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#111', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 0.5, borderColor: '#1C1C1C' },
  nearbyIcon:  { width: 38, height: 38, backgroundColor: '#0A2A1A', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  nearbyName:  { color: '#fff', fontSize: 13, fontWeight: '600' },
  nearbyMeta:  { color: '#666', fontSize: 12, marginTop: 2 },
  navChip:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#0A2A1A', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  navChipText: { color: '#22C55E', fontSize: 11, fontWeight: '600' },
  filterScroll:{ paddingHorizontal: 16, marginBottom: 10 },
  filterChip:  { backgroundColor: '#111', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8, borderWidth: 0.5, borderColor: '#1C1C1C' },
  filterChipActive:{ backgroundColor: '#0A2A1A', borderColor: '#22C55E' },
  filterText:  { color: '#666', fontSize: 12 },
  filterTextActive:{ color: '#22C55E', fontWeight: '600' },
  aiBanner:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 12, backgroundColor: '#0A2A1A', borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: '#22C55E' },
  aiBannerText:{ flex: 1, color: '#22C55E', fontWeight: '600', fontSize: 13 },
  eventCard:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 8, backgroundColor: '#111', borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: '#1C1C1C' },
  eventLeft:   { width: 42, height: 42, backgroundColor: '#1A1A1A', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  eventTitle:  { color: '#fff', fontSize: 13, fontWeight: '600' },
  eventMeta:   { color: '#666', fontSize: 12, marginTop: 2 },
  createBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 16, backgroundColor: '#111', borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: '#1C1C1C' },
  createBtnText:{ color: '#22C55E', fontWeight: '600', fontSize: 13 },
  touristBanner:{ flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 4, backgroundColor: '#0A1A2A', borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: '#1C2A3A' },
  touristTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  touristSub:   { color: '#555', fontSize: 11, marginTop: 2 },
  touristCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 8, backgroundColor: '#111', borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: '#1C1C1C' },
  touristLeft:  { width: 46, height: 46, backgroundColor: '#1A1A1A', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  touristCardTitle:{ color: '#fff', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  touristCardSub:{ color: '#555', fontSize: 11 },
  aiBadge:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#0A2A1A', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  aiBadgeText: { color: '#22C55E', fontSize: 10, fontWeight: '700' },
  featureRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 6, backgroundColor: '#111', borderRadius: 10, padding: 12, borderWidth: 0.5, borderColor: '#1C1C1C' },
  featureText: { flex: 1, color: '#ccc', fontSize: 13 },
  soonBadge:   { backgroundColor: '#1A1A2A', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  soonText:    { color: '#555', fontSize: 10 },
  empty:       { alignItems: 'center', paddingVertical: 50 },
  emptyIcon:   { fontSize: 38, marginBottom: 10 },
  emptyText:   { color: '#555', fontSize: 13, textAlign: 'center' },
  aiBtn:       { marginTop: 14, backgroundColor: '#0A2A1A', borderRadius: 18, paddingHorizontal: 18, paddingVertical: 8 },
  aiBtnText:   { color: '#22C55E', fontWeight: '600', fontSize: 13 },
});

const ai = StyleSheet.create({
  container: { margin: 16 },
  bubble:    { flexDirection: 'row', gap: 10, marginBottom: 12 },
  avatar:    { width: 32, height: 32, backgroundColor: '#0A2A1A', borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  text:      { flex: 1, backgroundColor: '#111', borderRadius: 16, borderBottomLeftRadius: 4, padding: 12 },
  textContent:{ color: '#ddd', fontSize: 14, lineHeight: 21 },
  tips:      { backgroundColor: '#0A2A1A', borderRadius: 12, padding: 12, marginTop: 4 },
  tipsTitle: { color: '#22C55E', fontWeight: '700', fontSize: 12, marginBottom: 6 },
  tipRow:    { flexDirection: 'row', gap: 6, marginBottom: 4 },
  tipDot:    { color: '#22C55E', fontSize: 14 },
  tipText:   { color: '#ccc', fontSize: 12, lineHeight: 18, flex: 1 },
});

const lc = StyleSheet.create({
  card:    { backgroundColor: '#111', borderRadius: 12, padding: 11, marginBottom: 7, borderWidth: 0.5, borderColor: '#1C1C1C' },
  top:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  emoji:   { fontSize: 22, width: 30, textAlign: 'center' },
  name:    { color: '#fff', fontSize: 13, fontWeight: '700', marginBottom: 3 },
  desc:    { color: '#888', fontSize: 12, lineHeight: 16 },
  navBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#0A2A1A', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  navText: { color: '#22C55E', fontSize: 12, fontWeight: '700' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  time:    { color: '#22C55E', fontSize: 11 },
  tags:    { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  tag:     { backgroundColor: '#1A2A1A', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  tagText: { color: '#22C55E', fontSize: 10 },
});

const rc = StyleSheet.create({
  card:       { backgroundColor: '#0A2A1A', borderRadius: 12, padding: 12, marginBottom: 7, borderWidth: 0.5, borderColor: '#22C55E' },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  icon:       { width: 30, height: 30, backgroundColor: '#111', borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  title:      { color: '#fff', fontSize: 13, fontWeight: '700' },
  chips:      { flexDirection: 'row', gap: 8, marginTop: 2 },
  chip:       { color: '#888', fontSize: 11 },
  step:       { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 8 },
  stepNum:    { width: 20, height: 20, backgroundColor: '#22C55E', borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNumText:{ color: '#fff', fontSize: 10, fontWeight: '700' },
  stepText:   { color: '#ccc', fontSize: 12, lineHeight: 18, flex: 1 },
});

// Navigasyon harita stilleri
const nm = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#0A0A0A', borderBottomWidth: 0.5, borderBottomColor: '#1C1C1C' },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  destName:    { color: '#fff', fontSize: 15, fontWeight: '700' },
  routeInfo:   { color: '#22C55E', fontSize: 12, marginTop: 2 },
  stepsBtn:    { width: 38, height: 38, backgroundColor: '#0A2A1A', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modeBar:     { flexDirection: 'row', backgroundColor: '#111', padding: 4, gap: 4 },
  modeBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8 },
  modeBtnActive:{ backgroundColor: '#1A1A1A' },
  modeText:    { color: '#555', fontSize: 12 },
  modeTextActive:{ color: '#22C55E', fontWeight: '600' },
  userPin:     { width: 18, height: 18, borderRadius: 9, backgroundColor: '#3b82f6', borderWidth: 3, borderColor: '#fff' },
  userPinInner:{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#fff', margin: 4 },
  destPin:     { alignItems: 'center' },
  stepRow:     { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#1C1C1C' },
  stepNumWrap: { width: 26, height: 26, backgroundColor: '#22C55E', borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNum:     { color: '#fff', fontSize: 11, fontWeight: '700' },
  stepText:    { color: '#ccc', fontSize: 13, lineHeight: 20, flex: 1 },
  loadingOverlay:{ position: 'absolute', bottom: 100, left: 0, right: 0, alignItems: 'center', gap: 8, backgroundColor: 'rgba(10,10,10,0.85)', padding: 16 },
  loadingText: { color: '#22C55E', fontSize: 13 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, backgroundColor: '#1A1000', borderRadius: 10, padding: 12 },
  errorText:   { flex: 1, color: '#f59e0b', fontSize: 12 },
  footer:      { backgroundColor: '#0A0A0A', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: '#1C1C1C' },
  footerInfo:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 12 },
  footerStat:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerStatText:{ color: '#fff', fontSize: 16, fontWeight: '700' },
  footerDivider:{ width: 1, height: 20, backgroundColor: '#1C1C1C' },
  startNavBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#22C55E', borderRadius: 14, paddingVertical: 13 },
  startNavText:{ color: '#fff', fontWeight: '700', fontSize: 15 },
});