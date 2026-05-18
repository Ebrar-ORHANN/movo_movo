// ── app/(tabs)/explore.js ────────────────────────────────────────────────────
// KAŞİF MODU — AI keşif, yakında, etkinlikler, turist modu
// Not: LLM entegrasyonu için /explorer/chat endpoint'i kullanılır.
//      LLM çalışmasa bile diğer özellikler aktif kalır.
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, FlatList, ActivityIndicator, Dimensions,
  Platform, Alert, Modal, Pressable,
} from 'react-native';
import MapView, { Marker, UrlTile, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

const { width } = Dimensions.get('window');

const QUICK = [
  { icon:'🥾', text:'Yürüyüş rotası öner',     color:'#1A3A1A' },
  { icon:'⛺', text:'Kamp yapılacak yerler',     color:'#1A2A3A' },
  { icon:'🏛️', text:'Tarihi yerler',             color:'#2A1A3A' },
  { icon:'🍽️', text:'Yerel lezzetler',          color:'#3A1A1A' },
  { icon:'📸', text:'Fotoğraf noktaları',        color:'#1A3A2A' },
  { icon:'🌅', text:'Gün batımı yerleri',        color:'#3A2A1A' },
  { icon:'🏕️', text:'3 saatlik gezi planı yap', color:'#1A1A3A' },
  { icon:'🚴', text:'Bisiklet rotası',            color:'#2A3A1A' },
];
const EVENT_FILTERS = ['Tümü','Doğa','Kamp','Bisiklet','Kültür','Müzik','Yürüyüş'];
const TOURIST_PLANS = [
  { icon:'🌅', title:'3 Saatlik Sabah Turu',   query:'3 saatlik sabah yürüyüş planı yap, tarihi ve kültürel yerler' },
  { icon:'🍽️', title:'Yemek & Kültür Rotası', query:'Kahvaltıdan akşam yemeğine rota öner' },
  { icon:'📸', title:'Fotoğraf Rotası',         query:'En iyi fotoğraf noktaları ve çekim saatlerini söyle' },
  { icon:'🏛️', title:'Tarihi Tur',             query:'Tarihi yerleri kapsayan gün boyu tur planla' },
  { icon:'🌿', title:'Doğa & Huzur',           query:'Kalabalıktan uzak, huzurlu doğa yerleri öner' },
  { icon:'🚴', title:'Aktif Macera',            query:'Yürüyüş ve bisiklet rotaları öner' },
];

// ── OSRM Navigasyon ───────────────────────────────────────────────────────────
const OSRM_PROFILE = { walking:'foot', cycling:'bike', driving:'car' };

async function fetchRoute(fromLat, fromLng, toLat, toLng, mode='walking') {
  const p   = OSRM_PROFILE[mode] || 'foot';
  const url = `https://router.project-osrm.org/route/v1/${p}/${fromLng},${fromLat};${toLng},${toLat}?steps=true&geometries=geojson&overview=full`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Rota alınamadı');
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('Rota bulunamadı');
  const r     = data.routes[0];
  const coords = r.geometry.coordinates.map(([lng,lat]) => ({ latitude:lat, longitude:lng }));
  const steps  = (r.legs[0]?.steps || [])
    .filter(s => s.maneuver?.instruction || s.name)
    .map(s => {
      const d = s.distance > 0
        ? ` (${s.distance > 1000 ? `${(s.distance/1000).toFixed(1)} km` : `${Math.round(s.distance)} m`})`
        : '';
      return ((s.maneuver?.instruction || '') + (s.name ? ` "${s.name}"` : '') + d).trim();
    }).filter(Boolean);
  return { coords, steps, dist: r.distance, duration: r.duration };
}
const fmtDist = m => m > 1000 ? `${(m/1000).toFixed(1)} km` : `${Math.round(m)} m`;
const fmtTime = s => { const m=Math.round(s/60); return m<60?`${m} dk`:`${Math.floor(m/60)} sa ${m%60} dk`; };

// ── Navigasyon Haritası ───────────────────────────────────────────────────────
function NavModal({ dest, userLoc, visible, onClose }) {
  const insets  = useSafeAreaInsets();
  const mapRef  = useRef(null);
  const [mode, setMode]       = useState('walking');
  const [route, setRoute]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [steps, setSteps]     = useState(false);

  const load = useCallback(async (m=mode) => {
    if (!userLoc || !dest) return;
    setLoading(true); setError(null); setRoute(null);
    try {
      const r = await fetchRoute(userLoc.lat, userLoc.lng, dest.lat, dest.lng, m);
      setRoute(r);
      setTimeout(() => mapRef.current?.fitToCoordinates(r.coords, {
        edgePadding:{ top:80, right:40, bottom:220, left:40 }, animated:true,
      }), 400);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, [userLoc, dest, mode]);

  useEffect(() => { if (visible) load(mode); }, [visible]);
  if (!visible || !dest) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex:1, backgroundColor:'#0A0A0A' }}>
        <View style={[nm.header, { paddingTop: insets.top+8 }]}>
          <TouchableOpacity onPress={onClose} style={nm.back}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex:1 }}>
            <Text style={nm.name} numberOfLines={1}>{dest.name}</Text>
            {route && <Text style={nm.info}>{fmtDist(route.dist)} · {fmtTime(route.duration)}</Text>}
          </View>
          <TouchableOpacity style={nm.stepsBtn} onPress={() => setSteps(!steps)}>
            <Ionicons name={steps?'map-outline':'list-outline'} size={20} color="#22C55E" />
          </TouchableOpacity>
        </View>

        {/* Ulaşım modu */}
        <View style={nm.modeBar}>
          {[{key:'walking',icon:'walk-outline',label:'Yürüyüş'},{key:'cycling',icon:'bicycle-outline',label:'Bisiklet'},{key:'driving',icon:'car-outline',label:'Araç'}].map(m=>(
            <TouchableOpacity key={m.key} style={[nm.modeBtn, mode===m.key&&nm.modeBtnActive]}
              onPress={() => { setMode(m.key); load(m.key); }}>
              <Ionicons name={m.icon} size={15} color={mode===m.key?'#22C55E':'#555'} />
              <Text style={[nm.modeText, mode===m.key&&nm.modeTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {!steps ? (
          <MapView ref={mapRef} style={{ flex:1 }}
            initialRegion={userLoc ? { latitude:userLoc.lat, longitude:userLoc.lng, latitudeDelta:0.02, longitudeDelta:0.02 } : undefined}>
            <UrlTile urlTemplate="https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png" maximumZ={19} flipY={false} tileSize={256} />
            {route?.coords && <Polyline coordinates={route.coords} strokeColor="#22C55E" strokeWidth={4} />}
            {userLoc && (
              <Marker coordinate={{ latitude:userLoc.lat, longitude:userLoc.lng }}>
                <View style={nm.userPin}><View style={nm.userPinInner} /></View>
              </Marker>
            )}
            <Marker coordinate={{ latitude:dest.lat, longitude:dest.lng }} title={dest.name}>
              <View style={{ alignItems:'center' }}><Ionicons name="location" size={34} color="#ef4444" /></View>
            </Marker>
          </MapView>
        ) : (
          <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16 }}>
            {route?.steps?.length ? route.steps.map((s,i)=>(
              <View key={i} style={nm.stepRow}>
                <View style={nm.stepNum}><Text style={nm.stepNumText}>{i+1}</Text></View>
                <Text style={nm.stepText}>{s}</Text>
              </View>
            )) : <Text style={{ color:'#555', textAlign:'center', marginTop:40 }}>{loading?'Hesaplanıyor…':error||'Adım bulunamadı'}</Text>}
          </ScrollView>
        )}

        {loading && (
          <View style={nm.loadingBox}>
            <ActivityIndicator color="#22C55E" />
            <Text style={nm.loadingText}>Rota hesaplanıyor…</Text>
          </View>
        )}
        {error && !loading && (
          <View style={nm.errorBox}>
            <Ionicons name="warning-outline" size={15} color="#f59e0b" />
            <Text style={nm.errorText}>{error}</Text>
            <TouchableOpacity onPress={()=>load(mode)}><Text style={{ color:'#22C55E',fontSize:13 }}>Tekrar</Text></TouchableOpacity>
          </View>
        )}
        {route && !steps && (
          <View style={[nm.footer, { paddingBottom: insets.bottom+8 }]}>
            <View style={nm.footerRow}>
              <View style={nm.stat}><Ionicons name="navigate-outline" size={16} color="#22C55E" /><Text style={nm.statText}>{fmtDist(route.dist)}</Text></View>
              <View style={nm.divider} />
              <View style={nm.stat}><Ionicons name="time-outline" size={16} color="#22C55E" /><Text style={nm.statText}>{fmtTime(route.duration)}</Text></View>
            </View>
            <TouchableOpacity style={nm.stepsFullBtn} onPress={() => setSteps(true)}>
              <Ionicons name="list-outline" size={17} color="#fff" />
              <Text style={nm.stepsFullText}>Adım Adım Tarif</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ── AI Yanıt kartları ─────────────────────────────────────────────────────────
function LocCard({ item, onNav }) {
  const icons = { poi:'📍', restaurant:'🍽️', camp:'⛺', hotel:'🏨', route_point:'🗺️' };
  return (
    <View style={lc.card}>
      <View style={lc.row}>
        <Text style={lc.emoji}>{icons[item.type]||'📍'}</Text>
        <View style={{ flex:1 }}>
          <Text style={lc.name} numberOfLines={1}>{item.name}</Text>
          <Text style={lc.desc} numberOfLines={2}>{item.description}</Text>
        </View>
        <TouchableOpacity style={lc.navBtn} onPress={onNav}>
          <Ionicons name="navigate" size={15} color="#22C55E" />
          <Text style={lc.navText}>Git</Text>
        </TouchableOpacity>
      </View>
      {item.best_time && (
        <View style={lc.timeRow}>
          <Ionicons name="time-outline" size={11} color="#22C55E" />
          <Text style={lc.time}>En iyi: {item.best_time}</Text>
        </View>
      )}
      {item.tags?.length > 0 && (
        <View style={lc.tags}>
          {item.tags.slice(0,4).map((t,i)=><View key={i} style={lc.tag}><Text style={lc.tagText}>{t}</Text></View>)}
        </View>
      )}
    </View>
  );
}

function RouteCard({ route }) {
  const [exp, setExp] = useState(false);
  if (!route) return null;
  return (
    <View style={rc.card}>
      <TouchableOpacity style={rc.header} onPress={() => setExp(!exp)}>
        <View style={rc.headerLeft}>
          <View style={rc.icon}><Ionicons name="map" size={15} color="#22C55E" /></View>
          <View>
            <Text style={rc.title} numberOfLines={1}>{route.title}</Text>
            <View style={rc.chips}>
              {route.duration&&<Text style={rc.chip}>⏱ {route.duration}</Text>}
              {route.distance&&<Text style={rc.chip}>📏 {route.distance}</Text>}
            </View>
          </View>
        </View>
        <Ionicons name={exp?'chevron-up':'chevron-down'} size={15} color="#555" />
      </TouchableOpacity>
      {exp && route.steps?.map((s,i)=>(
        <View key={i} style={rc.step}>
          <View style={rc.stepNum}><Text style={rc.stepNumText}>{i+1}</Text></View>
          <Text style={rc.stepText}>{s}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Ana ekran ─────────────────────────────────────────────────────────────────
export default function ExploreScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { profile } = useAuth();

  const [tab, setTab]           = useState('ai');
  const [query, setQuery]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [history, setHistory]   = useState([]);
  const [userLoc, setUserLoc]   = useState(null);
  const [navDest, setNavDest]   = useState(null);
  const [events, setEvents]     = useState([]);
  const [evLoading, setEvLoading] = useState(false);
  const [evFilter, setEvFilter] = useState('Tümü');
  const [nearby, setNearby]     = useState({ pois:[], events:[] });
  const inputRef = useRef(null);

  // Konum
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLoc({ lat: p.coords.latitude, lng: p.coords.longitude });
      }
    })();
  }, []);

  // Nearby
  const loadNearby = useCallback(async () => {
    if (!userLoc) return;
    try {
      const d = await api.get(`/explorer/nearby?lat=${userLoc.lat}&lng=${userLoc.lng}&radius=3000`);
      setNearby(d);
    } catch {}
  }, [userLoc]);

  // Events
  const loadEvents = useCallback(async () => {
    setEvLoading(true);
    try {
      const p = userLoc ? `?lat=${userLoc.lat}&lng=${userLoc.lng}&radius=50000` : '';
      const d = await api.get(`/events/nearby/search${p}&limit=20`);
      setEvents(Array.isArray(d) ? d : d?.events || []);
    } catch { setEvents([]); }
    finally { setEvLoading(false); }
  }, [userLoc]);

  useFocusEffect(useCallback(() => {
    if (tab === 'nearby') loadNearby();
    if (tab === 'events') loadEvents();
  }, [tab, loadNearby, loadEvents]));

  const openNav = (loc) => {
    if (!userLoc) { Alert.alert('Konum bekleniyor', 'GPS konumun alınıyor.'); return; }
    setNavDest(loc); // NavModal visible olur
  };

  // LLM sorgu
  const send = async (text) => {
    const msg = (text || query).trim();
    if (!msg || loading) return;
    setQuery(''); inputRef.current?.blur();
    setLoading(true); setAiResult(null);
    const newHist = [...history, { role:'user', content:msg }];
    setHistory(newHist);
    try {
      const res = await api.post('/explorer/chat', {
        message: msg, lat: userLoc?.lat||null, lng: userLoc?.lng||null,
        history: history.slice(-4),
      });
      setAiResult(res);
      setHistory([...newHist, { role:'assistant', content:res.response }]);
    } catch(e) {
      setAiResult({ response:`⚠️ ${e.message}`, locations:[], tips:[], route_suggestion:null });
    } finally { setLoading(false); }
  };

  const filteredEv = evFilter==='Tümü' ? events
    : events.filter(e => e.categories?.includes(evFilter.toLowerCase()) || e.category===evFilter.toLowerCase());

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>🧭 Kaşif Modu</Text>
          <Text style={s.sub}>{userLoc ? '📍 Konum aktif' : 'AI destekli keşif'}</Text>
        </View>
        <TouchableOpacity style={s.routeBtn} onPress={() => router.push('/route/create')}>
          <Ionicons name="map-outline" size={16} color="#22C55E" />
          <Text style={s.routeBtnText}>Rota Oluştur</Text>
        </TouchableOpacity>
      </View>

      {/* Arama çubuğu */}
      <View style={s.searchBar}>
        <Ionicons name="search-outline" size={16} color="#555" />
        <TextInput
          ref={inputRef}
          style={s.searchInput}
          placeholder="Nereye gitmek istersin?"
          placeholderTextColor="#444"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          onSubmitEditing={() => send()}
          editable={!loading}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={15} color="#444" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.sendBtn, (!query.trim()||loading) && s.sendBtnOff]}
          onPress={() => send()} disabled={!query.trim()||loading}>
          {loading ? <ActivityIndicator color="#fff" size="small" />
            : <Ionicons name="arrow-forward" size={16} color="#fff" />}
        </TouchableOpacity>
      </View>

      {/* Sekmeler */}
      <View style={s.tabs}>
        {[
          { k:'ai',      icon:'sparkles-outline', label:'AI Keşif'    },
          { k:'nearby',  icon:'compass-outline',  label:'Yakında'     },
          { k:'events',  icon:'calendar-outline', label:'Etkinlikler' },
          { k:'tourist', icon:'globe-outline',    label:'Turist'      },
        ].map(t => (
          <TouchableOpacity key={t.k} style={[s.tab, tab===t.k&&s.tabActive]}
            onPress={() => setTab(t.k)}>
            <Ionicons name={t.icon} size={13} color={tab===t.k?'#22C55E':'#555'} />
            <Text style={[s.tabText, tab===t.k&&s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom:120 }}>

        {/* ── AI KEŞİF ──────────────────────────────────────────────────────── */}
        {tab === 'ai' && (
          <View>
            {loading && (
              <View style={s.loadBox}>
                <ActivityIndicator color="#22C55E" />
                <Text style={s.loadText}>AI analiz ediyor…</Text>
              </View>
            )}
            {aiResult && !loading && (
              <View style={{ margin:16 }}>
                {/* AI yanıt balonu */}
                <View style={s.aiBubble}>
                  <View style={s.aiAvatar}><Text style={{ fontSize:15 }}>🧭</Text></View>
                  <View style={s.aiTextBox}>
                    <Text style={s.aiText}>{aiResult.response}</Text>
                  </View>
                </View>
                {/* Yer kartları */}
                {aiResult.locations?.map((loc,i)=>(
                  <LocCard key={i} item={loc} onNav={()=>openNav(loc)} />
                ))}
                {/* Rota önerisi */}
                {aiResult.route_suggestion && <RouteCard route={aiResult.route_suggestion} />}
                {/* İpuçları */}
                {aiResult.tips?.length > 0 && (
                  <View style={s.tips}>
                    <Text style={s.tipsTitle}>💡 İpuçları</Text>
                    {aiResult.tips.map((t,i)=>(
                      <View key={i} style={s.tipRow}>
                        <Text style={s.tipDot}>•</Text>
                        <Text style={s.tipText}>{t}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <TouchableOpacity style={s.resetBtn} onPress={() => { setAiResult(null); setHistory([]); }}>
                  <Ionicons name="refresh-outline" size={15} color="#22C55E" />
                  <Text style={s.resetText}>Yeni Keşif</Text>
                </TouchableOpacity>
              </View>
            )}
            {!aiResult && !loading && (
              <>
                <Text style={s.secTitle}>Hızlı Keşif</Text>
                <View style={s.quickGrid}>
                  {QUICK.map((q,i)=>(
                    <TouchableOpacity key={i} style={[s.quickCard,{backgroundColor:q.color}]}
                      onPress={()=>send(q.text)} activeOpacity={0.8}>
                      <Text style={s.quickEmoji}>{q.icon}</Text>
                      <Text style={s.quickText}>{q.text}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={s.secTitle}>Örnek Sorular</Text>
                {[
                  '"Ankara\'da tarihi yürüyüş rotası öner"',
                  '"Gün batımında en güzel manzara noktaları"',
                  '"Kalabalık olmayan doğa yerleri"',
                ].map((q,i)=>(
                  <TouchableOpacity key={i} style={s.exQ} onPress={()=>send(q.replace(/"/g,''))}>
                    <Ionicons name="chatbubble-outline" size={12} color="#22C55E" />
                    <Text style={s.exQText}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        )}

        {/* ── YAKINIMDA ──────────────────────────────────────────────────────── */}
        {tab === 'nearby' && (
          <View style={{ padding:16 }}>
            {!userLoc ? (
              <View style={s.empty}><Text style={s.emptyIcon}>📍</Text><Text style={s.emptyText}>Konum izni gerekli</Text></View>
            ) : (
              <>
                {nearby.pois.length > 0 ? (
                  <>
                    <Text style={s.secTitle}>İlgi Noktaları</Text>
                    {nearby.pois.map(p=>(
                      <TouchableOpacity key={p.id} style={s.nearbyCard}
                        onPress={()=>openNav({ name:p.name, lat:p.lat, lng:p.lng, description:p.category })}
                        activeOpacity={0.8}>
                        <View style={s.nearbyIcon}><Ionicons name="location-outline" size={19} color="#22C55E" /></View>
                        <View style={{ flex:1 }}>
                          <Text style={s.nearbyName}>{p.name}</Text>
                          <Text style={s.nearbyMeta}>{p.category} · {p.dist?`${(p.dist/1000).toFixed(1)} km`:''}</Text>
                        </View>
                        <View style={s.goChip}><Ionicons name="navigate-outline" size={13} color="#22C55E" /><Text style={s.goText}>Git</Text></View>
                      </TouchableOpacity>
                    ))}
                  </>
                ) : (
                  <View style={s.empty}>
                    <Text style={s.emptyIcon}>🔍</Text>
                    <Text style={s.emptyText}>Yakında kayıtlı yer yok</Text>
                    <TouchableOpacity style={s.aiChip} onPress={()=>{setTab('ai');send('Yakınımda gezilecek yerler öner');}}>
                      <Text style={s.aiChipText}>AI'dan Öneri Al</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* ── ETKİNLİKLER ───────────────────────────────────────────────────── */}
        {tab === 'events' && (
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll}>
              {EVENT_FILTERS.map(f=>(
                <TouchableOpacity key={f} style={[s.fChip,evFilter===f&&s.fChipActive]} onPress={()=>setEvFilter(f)}>
                  <Text style={[s.fText,evFilter===f&&s.fTextActive]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={s.aiBanner} onPress={()=>{setTab('ai');send('Bu hafta etkinlik öner');}}>
              <Ionicons name="sparkles-outline" size={15} color="#22C55E" />
              <Text style={s.aiBannerText}>AI ile Etkinlik Bul</Text>
              <Ionicons name="arrow-forward" size={13} color="#22C55E" />
            </TouchableOpacity>
            {evLoading ? <ActivityIndicator color="#22C55E" style={{ margin:30 }} /> :
              filteredEv.length === 0 ? (
                <View style={s.empty}><Text style={s.emptyIcon}>📅</Text><Text style={s.emptyText}>Etkinlik bulunamadı</Text></View>
              ) : filteredEv.map(ev=>(
                <TouchableOpacity key={ev.id} style={s.evCard} onPress={()=>router.push(`/events/${ev.id}`)} activeOpacity={0.8}>
                  <View style={s.evLeft}><Text style={{ fontSize:20 }}>🗓️</Text></View>
                  <View style={{ flex:1 }}>
                    <Text style={s.evTitle}>{ev.title}</Text>
                    <Text style={s.evMeta}>{ev.status}{ev.start_time?` · ${new Date(ev.start_time).toLocaleDateString('tr-TR')}`:''}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={15} color="#333" />
                </TouchableOpacity>
              ))
            }
            <TouchableOpacity style={s.createBtn} onPress={()=>router.push('/events/index')}>
              <Ionicons name="add-circle-outline" size={17} color="#22C55E" />
              <Text style={s.createBtnText}>Etkinlik Oluştur</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── TURİST MODU ───────────────────────────────────────────────────── */}
        {tab === 'tourist' && (
          <View>
            <View style={s.touristHeader}>
              <Text style={{ fontSize:28 }}>🌍</Text>
              <View style={{ flex:1 }}>
                <Text style={s.touristTitle}>Turist Modu</Text>
                <Text style={s.touristSub}>Hazır gezi planları ve AI önerileri</Text>
              </View>
            </View>
            <Text style={s.secTitle}>Hazır Planlar</Text>
            {TOURIST_PLANS.map((p,i)=>(
              <TouchableOpacity key={i} style={s.tCard} onPress={()=>{setTab('ai');send(p.query);}} activeOpacity={0.8}>
                <View style={s.tLeft}><Text style={{ fontSize:24 }}>{p.icon}</Text></View>
                <View style={{ flex:1 }}>
                  <Text style={s.tTitle}>{p.title}</Text>
                  <Text style={s.tSub} numberOfLines={1}>{p.query}</Text>
                </View>
                <View style={s.aiBadge}><Ionicons name="sparkles-outline" size={10} color="#22C55E" /><Text style={s.aiBadgeText}>AI</Text></View>
              </TouchableOpacity>
            ))}
            <Text style={[s.secTitle,{marginTop:8}]}>Diğer</Text>
            {[
              { icon:'🗺️', text:'Rota Oluştur',        onPress:()=>router.push('/route/create') },
              { icon:'📷', text:'Görsel Tanıma',        onPress:()=>Alert.alert('Yakında','') },
              { icon:'🎙️', text:'Sesli Asistan',        onPress:()=>Alert.alert('Yakında','') },
              { icon:'👥', text:'Beraber Gez',           onPress:()=>Alert.alert('Yakında','') },
            ].map((item,i)=>(
              <TouchableOpacity key={i} style={s.featRow} onPress={item.onPress}>
                <Text style={{ fontSize:20, width:32, textAlign:'center' }}>{item.icon}</Text>
                <Text style={s.featText}>{item.text}</Text>
                {item.onPress===undefined&&<View style={s.soonBadge}><Text style={s.soonText}>Yakında</Text></View>}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Navigasyon modalı */}
      <NavModal dest={navDest} userLoc={userLoc} visible={!!navDest} onClose={()=>setNavDest(null)} />
    </View>
  );
}

// ── Stiller ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex:1, backgroundColor:'#0A0A0A' },
  header:       { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, paddingBottom:12 },
  title:        { color:'#fff', fontSize:18, fontWeight:'800' },
  sub:          { color:'#555', fontSize:11, marginTop:1 },
  routeBtn:     { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:'#0A2A1A', borderRadius:18, paddingHorizontal:12, paddingVertical:7 },
  routeBtnText: { color:'#22C55E', fontSize:12, fontWeight:'600' },
  searchBar:    { flexDirection:'row', alignItems:'center', marginHorizontal:16, marginBottom:10, backgroundColor:'#111', borderRadius:14, paddingHorizontal:12, paddingVertical:4, borderWidth:0.5, borderColor:'#1C1C1C', gap:8 },
  searchInput:  { flex:1, color:'#fff', fontSize:14, paddingVertical:9 },
  sendBtn:      { width:34, height:34, backgroundColor:'#22C55E', borderRadius:10, alignItems:'center', justifyContent:'center' },
  sendBtnOff:   { backgroundColor:'#1A3A1A', opacity:0.5 },
  tabs:         { flexDirection:'row', marginHorizontal:16, backgroundColor:'#111', borderRadius:12, padding:4, marginBottom:10 },
  tab:          { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:4, paddingVertical:8, borderRadius:10 },
  tabActive:    { backgroundColor:'#1A1A1A' },
  tabText:      { color:'#555', fontSize:11 },
  tabTextActive:{ color:'#22C55E', fontWeight:'600' },
  loadBox:      { flexDirection:'row', alignItems:'center', gap:10, margin:16, backgroundColor:'#111', borderRadius:12, padding:14 },
  loadText:     { color:'#888', fontSize:13 },
  aiBubble:     { flexDirection:'row', gap:8, marginBottom:12 },
  aiAvatar:     { width:30, height:30, backgroundColor:'#0A2A1A', borderRadius:15, alignItems:'center', justifyContent:'center', flexShrink:0 },
  aiTextBox:    { flex:1, backgroundColor:'#111', borderRadius:14, borderBottomLeftRadius:4, padding:11 },
  aiText:       { color:'#ddd', fontSize:14, lineHeight:21 },
  tips:         { backgroundColor:'#0A2A1A', borderRadius:12, padding:12, marginTop:4 },
  tipsTitle:    { color:'#22C55E', fontWeight:'700', fontSize:12, marginBottom:6 },
  tipRow:       { flexDirection:'row', gap:6, marginBottom:4 },
  tipDot:       { color:'#22C55E', fontSize:14 },
  tipText:      { color:'#ccc', fontSize:12, lineHeight:18, flex:1 },
  resetBtn:     { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:7, marginTop:12, backgroundColor:'#0A2A1A', borderRadius:12, padding:11, borderWidth:0.5, borderColor:'#22C55E' },
  resetText:    { color:'#22C55E', fontWeight:'600', fontSize:13 },
  secTitle:     { color:'#888', fontSize:11, fontWeight:'700', letterSpacing:0.8, textTransform:'uppercase', marginHorizontal:16, marginTop:14, marginBottom:8 },
  quickGrid:    { flexDirection:'row', flexWrap:'wrap', paddingHorizontal:12, gap:10, marginBottom:4 },
  quickCard:    { width:(width-44)/2, borderRadius:16, padding:14, gap:8 },
  quickEmoji:   { fontSize:24 },
  quickText:    { color:'#fff', fontSize:13, fontWeight:'600', lineHeight:18 },
  exQ:          { flexDirection:'row', alignItems:'center', gap:8, marginHorizontal:16, marginBottom:6, backgroundColor:'#111', borderRadius:10, padding:11, borderWidth:0.5, borderColor:'#1C1C1C' },
  exQText:      { color:'#aaa', fontSize:12, flex:1, lineHeight:17 },
  nearbyCard:   { flexDirection:'row', alignItems:'center', gap:10, backgroundColor:'#111', borderRadius:12, padding:12, marginBottom:8, borderWidth:0.5, borderColor:'#1C1C1C' },
  nearbyIcon:   { width:36, height:36, backgroundColor:'#0A2A1A', borderRadius:10, alignItems:'center', justifyContent:'center' },
  nearbyName:   { color:'#fff', fontSize:13, fontWeight:'600' },
  nearbyMeta:   { color:'#666', fontSize:12, marginTop:2 },
  goChip:       { flexDirection:'row', alignItems:'center', gap:3, backgroundColor:'#0A2A1A', borderRadius:9, paddingHorizontal:8, paddingVertical:5 },
  goText:       { color:'#22C55E', fontSize:11, fontWeight:'600' },
  filterScroll: { paddingHorizontal:16, marginBottom:10 },
  fChip:        { backgroundColor:'#111', borderRadius:18, paddingHorizontal:14, paddingVertical:7, marginRight:8, borderWidth:0.5, borderColor:'#1C1C1C' },
  fChipActive:  { backgroundColor:'#0A2A1A', borderColor:'#22C55E' },
  fText:        { color:'#666', fontSize:12 },
  fTextActive:  { color:'#22C55E', fontWeight:'600' },
  aiBanner:     { flexDirection:'row', alignItems:'center', gap:10, marginHorizontal:16, marginBottom:12, backgroundColor:'#0A2A1A', borderRadius:12, padding:12, borderWidth:0.5, borderColor:'#22C55E' },
  aiBannerText: { flex:1, color:'#22C55E', fontWeight:'600', fontSize:13 },
  evCard:       { flexDirection:'row', alignItems:'center', gap:10, marginHorizontal:16, marginBottom:8, backgroundColor:'#111', borderRadius:12, padding:12, borderWidth:0.5, borderColor:'#1C1C1C' },
  evLeft:       { width:40, height:40, backgroundColor:'#1A1A1A', borderRadius:10, alignItems:'center', justifyContent:'center' },
  evTitle:      { color:'#fff', fontSize:13, fontWeight:'600' },
  evMeta:       { color:'#666', fontSize:12, marginTop:2 },
  createBtn:    { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, margin:16, backgroundColor:'#111', borderRadius:12, padding:12, borderWidth:0.5, borderColor:'#1C1C1C' },
  createBtnText:{ color:'#22C55E', fontWeight:'600', fontSize:13 },
  touristHeader:{ flexDirection:'row', alignItems:'center', gap:12, marginHorizontal:16, marginBottom:4, backgroundColor:'#0A1A2A', borderRadius:14, padding:14 },
  touristTitle: { color:'#fff', fontSize:15, fontWeight:'700' },
  touristSub:   { color:'#555', fontSize:11, marginTop:2 },
  tCard:        { flexDirection:'row', alignItems:'center', gap:12, marginHorizontal:16, marginBottom:8, backgroundColor:'#111', borderRadius:12, padding:12, borderWidth:0.5, borderColor:'#1C1C1C' },
  tLeft:        { width:44, height:44, backgroundColor:'#1A1A1A', borderRadius:12, alignItems:'center', justifyContent:'center' },
  tTitle:       { color:'#fff', fontSize:13, fontWeight:'700', marginBottom:2 },
  tSub:         { color:'#555', fontSize:11 },
  aiBadge:      { flexDirection:'row', alignItems:'center', gap:3, backgroundColor:'#0A2A1A', borderRadius:8, paddingHorizontal:6, paddingVertical:3 },
  aiBadgeText:  { color:'#22C55E', fontSize:10, fontWeight:'700' },
  featRow:      { flexDirection:'row', alignItems:'center', gap:10, marginHorizontal:16, marginBottom:6, backgroundColor:'#111', borderRadius:10, padding:12, borderWidth:0.5, borderColor:'#1C1C1C' },
  featText:     { flex:1, color:'#ccc', fontSize:13 },
  soonBadge:    { backgroundColor:'#1A1A2A', borderRadius:6, paddingHorizontal:7, paddingVertical:3 },
  soonText:     { color:'#555', fontSize:10 },
  empty:        { alignItems:'center', paddingVertical:50 },
  emptyIcon:    { fontSize:36, marginBottom:10 },
  emptyText:    { color:'#555', fontSize:13, textAlign:'center' },
  aiChip:       { marginTop:14, backgroundColor:'#0A2A1A', borderRadius:18, paddingHorizontal:18, paddingVertical:8 },
  aiChipText:   { color:'#22C55E', fontWeight:'600', fontSize:13 },
});

const nm = StyleSheet.create({
  header:       { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:16, paddingBottom:12, backgroundColor:'#0A0A0A', borderBottomWidth:0.5, borderBottomColor:'#1C1C1C' },
  back:         { width:40, height:40, alignItems:'center', justifyContent:'center' },
  name:         { color:'#fff', fontSize:15, fontWeight:'700' },
  info:         { color:'#22C55E', fontSize:12, marginTop:2 },
  stepsBtn:     { width:36, height:36, backgroundColor:'#0A2A1A', borderRadius:10, alignItems:'center', justifyContent:'center' },
  modeBar:      { flexDirection:'row', backgroundColor:'#111', padding:4, gap:4 },
  modeBtn:      { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:5, paddingVertical:8, borderRadius:8 },
  modeBtnActive:{ backgroundColor:'#1A1A1A' },
  modeText:     { color:'#555', fontSize:12 },
  modeTextActive:{ color:'#22C55E', fontWeight:'600' },
  userPin:      { width:16, height:16, borderRadius:8, backgroundColor:'#3b82f6', borderWidth:3, borderColor:'#fff' },
  userPinInner: { width:4, height:4, borderRadius:2, backgroundColor:'#fff', margin:3 },
  stepRow:      { flexDirection:'row', gap:10, alignItems:'flex-start', paddingVertical:10, borderBottomWidth:0.5, borderBottomColor:'#1C1C1C' },
  stepNum:      { width:24, height:24, backgroundColor:'#22C55E', borderRadius:12, alignItems:'center', justifyContent:'center', flexShrink:0 },
  stepNumText:  { color:'#fff', fontSize:10, fontWeight:'700' },
  stepText:     { color:'#ccc', fontSize:13, lineHeight:19, flex:1 },
  loadingBox:   { position:'absolute', bottom:100, left:0, right:0, alignItems:'center', gap:6, backgroundColor:'rgba(10,10,10,0.9)', padding:14 },
  loadingText:  { color:'#22C55E', fontSize:13 },
  errorBox:     { flexDirection:'row', alignItems:'center', gap:8, margin:16, backgroundColor:'#1A1000', borderRadius:10, padding:12 },
  errorText:    { flex:1, color:'#f59e0b', fontSize:12 },
  footer:       { backgroundColor:'#0A0A0A', paddingHorizontal:16, paddingTop:12, borderTopWidth:0.5, borderTopColor:'#1C1C1C' },
  footerRow:    { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:20, marginBottom:10 },
  stat:         { flexDirection:'row', alignItems:'center', gap:6 },
  statText:     { color:'#fff', fontSize:16, fontWeight:'700' },
  divider:      { width:1, height:18, backgroundColor:'#1C1C1C' },
  stepsFullBtn: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:'#22C55E', borderRadius:14, paddingVertical:12 },
  stepsFullText:{ color:'#fff', fontWeight:'700', fontSize:14 },
});
const lc = StyleSheet.create({
  card:   { backgroundColor:'#111', borderRadius:12, padding:11, marginBottom:7, borderWidth:0.5, borderColor:'#1C1C1C' },
  row:    { flexDirection:'row', alignItems:'flex-start', gap:8 },
  emoji:  { fontSize:21, width:28, textAlign:'center' },
  name:   { color:'#fff', fontSize:13, fontWeight:'700', marginBottom:3 },
  desc:   { color:'#888', fontSize:12, lineHeight:16 },
  navBtn: { flexDirection:'row', alignItems:'center', gap:4, backgroundColor:'#0A2A1A', borderRadius:9, paddingHorizontal:8, paddingVertical:5 },
  navText:{ color:'#22C55E', fontSize:11, fontWeight:'700' },
  timeRow:{ flexDirection:'row', alignItems:'center', gap:4, marginTop:6 },
  time:   { color:'#22C55E', fontSize:11 },
  tags:   { flexDirection:'row', flexWrap:'wrap', gap:5, marginTop:6 },
  tag:    { backgroundColor:'#1A2A1A', borderRadius:8, paddingHorizontal:7, paddingVertical:3 },
  tagText:{ color:'#22C55E', fontSize:10 },
});
const rc = StyleSheet.create({
  card:       { backgroundColor:'#0A2A1A', borderRadius:12, padding:12, marginBottom:7, borderWidth:0.5, borderColor:'#22C55E' },
  header:     { flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  headerLeft: { flexDirection:'row', alignItems:'center', gap:8, flex:1 },
  icon:       { width:28, height:28, backgroundColor:'#111', borderRadius:14, alignItems:'center', justifyContent:'center' },
  title:      { color:'#fff', fontSize:13, fontWeight:'700' },
  chips:      { flexDirection:'row', gap:8, marginTop:2 },
  chip:       { color:'#888', fontSize:11 },
  step:       { flexDirection:'row', gap:8, alignItems:'flex-start', marginTop:8 },
  stepNum:    { width:20, height:20, backgroundColor:'#22C55E', borderRadius:10, alignItems:'center', justifyContent:'center', flexShrink:0 },
  stepNumText:{ color:'#fff', fontSize:10, fontWeight:'700' },
  stepText:   { color:'#ccc', fontSize:12, lineHeight:18, flex:1 },
});