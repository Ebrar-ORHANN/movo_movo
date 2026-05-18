// ── app/route/create.js ──────────────────────────────────────────────────────
// 3 yöntemli rota oluşturma: LLM | Manuel | Dinamik kayıt
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, FlatList, ActivityIndicator, Alert,
  Modal, Pressable, KeyboardAvoidingView, Platform,
  Dimensions,
} from 'react-native';
import MapView, { Marker, UrlTile, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { auth } from '../../src/firebase/config';
import { API_BASE } from '../../constants/api';

const { width, height } = Dimensions.get('window');

// ── Sabitler ──────────────────────────────────────────────────────────────────
const TRANSPORT_MODES = [
  { key: 'walking',  icon: 'walk-outline',    label: 'Yürüyüş' },
  { key: 'cycling',  icon: 'bicycle-outline', label: 'Bisiklet' },
  { key: 'driving',  icon: 'car-outline',     label: 'Araç' },
];
const CATEGORIES = ['doğa', 'kültür', 'yemek', 'tarih', 'macera', 'fotoğraf'];
const VISIBILITY  = [
  { key: 'public',    icon: 'earth-outline',       label: 'Herkese Açık' },
  { key: 'followers', icon: 'people-outline',      label: 'Takipçiler'   },
  { key: 'private',   icon: 'lock-closed-outline', label: 'Gizli'        },
];
const SHARE_TYPES = [
  { key: 'both',      label: 'Rota + Medya'  },
  { key: 'route',     label: 'Sadece Rota'   },
  { key: 'media',     label: 'Sadece Medya'  },
];

// ── POI Kartı ─────────────────────────────────────────────────────────────────
function StopCard({ stop, index, total, onUp, onDown, onDelete, onNote }) {
  return (
    <View style={sc.card}>
      <View style={sc.seqCol}>
        <View style={sc.seqBubble}>
          <Text style={sc.seqText}>{index + 1}</Text>
        </View>
        {index < total - 1 && <View style={sc.line} />}
      </View>

      <View style={sc.body}>
        <Text style={sc.name} numberOfLines={1}>{stop.name || stop.poi_name || 'İsimsiz durak'}</Text>
        {stop.llm_comment && (
          <View style={sc.aiComment}>
            <Ionicons name="sparkles-outline" size={11} color="#22C55E" />
            <Text style={sc.aiCommentText} numberOfLines={2}>{stop.llm_comment}</Text>
          </View>
        )}
        {stop.best_time && (
          <View style={sc.timeRow}>
            <Ionicons name="time-outline" size={11} color="#f59e0b" />
            <Text style={sc.timeText}>En iyi: {stop.best_time}</Text>
          </View>
        )}
        <TextInput
          style={sc.noteInput}
          placeholder="Not ekle…"
          placeholderTextColor="#333"
          value={stop.notes || ''}
          onChangeText={t => onNote(index, t)}
          multiline
        />
      </View>

      <View style={sc.actions}>
        <TouchableOpacity onPress={() => onUp(index)} disabled={index === 0} style={sc.btn}>
          <Ionicons name="chevron-up" size={18} color={index === 0 ? '#222' : '#888'} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onDown(index)} disabled={index === total - 1} style={sc.btn}>
          <Ionicons name="chevron-down" size={18} color={index === total - 1 ? '#222' : '#888'} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onDelete(index)} style={sc.btn}>
          <Ionicons name="trash-outline" size={16} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── POI Arama Modalı ──────────────────────────────────────────────────────────
function POISearchModal({ visible, onClose, onSelect, onCreate }) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const search = async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await api.get(`/pois/search?q=${encodeURIComponent(q)}&limit=15`);
      setResults(Array.isArray(data) ? data : data?.pois || []);
    } catch { setResults([]); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const t = setTimeout(() => search(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={mo.overlay} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={mo.sheet}>
        <View style={mo.handle} />
        <Text style={mo.title}>POI Ekle</Text>

        <View style={mo.searchBar}>
          <Ionicons name="search-outline" size={16} color="#555" />
          <TextInput
            style={mo.searchInput}
            placeholder="Yer ara…"
            placeholderTextColor="#444"
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        </View>

        {loading && <ActivityIndicator color="#22C55E" style={{ margin: 16 }} />}

        <FlatList
          data={results}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
          ListEmptyComponent={
            !loading && query.length > 1 ? (
              <TouchableOpacity style={mo.createBtn} onPress={() => { onClose(); onCreate(query); }}>
                <Ionicons name="add-circle-outline" size={20} color="#22C55E" />
                <Text style={mo.createText}>"{query}" adında yeni yer oluştur</Text>
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={mo.resultRow} onPress={() => { onSelect(item); onClose(); }}>
              <View style={mo.resultIcon}>
                <Ionicons name="location-outline" size={18} color="#22C55E" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={mo.resultName}>{item.name}</Text>
                <Text style={mo.resultMeta}>{item.category}{item.city_name ? ` · ${item.city_name}` : ''}</Text>
              </View>
              <Ionicons name="add" size={20} color="#22C55E" />
            </TouchableOpacity>
          )}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Yeni POI Oluştur Modalı ───────────────────────────────────────────────────
function NewPOIModal({ visible, initialName, onClose, onCreate }) {
  const [name, setName]     = useState(initialName || '');
  const [lat, setLat]       = useState('');
  const [lng, setLng]       = useState('');
  const [category, setCategory] = useState('other');
  const [desc, setDesc]     = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !lat || !lng) { Alert.alert('Hata', 'İsim ve koordinat gerekli'); return; }
    setSaving(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`${API_BASE}/pois/user-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim(), lat: parseFloat(lat), lng: parseFloat(lng), category, description: desc }),
      });
      if (!res.ok) throw new Error('POI oluşturulamadı');
      const data = await res.json();
      Alert.alert('Gönderildi', 'POI admin onayına gönderildi. Rotana şimdi eklendi.');
      onCreate({ ...data, pending: true });
      onClose();
    } catch (e) { Alert.alert('Hata', e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={mo.overlay} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={mo.sheet}>
        <View style={mo.handle} />
        <Text style={mo.title}>Yeni Yer Oluştur</Text>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          <View style={mo.infoBox}>
            <Ionicons name="information-circle-outline" size={16} color="#f59e0b" />
            <Text style={mo.infoText}>Admin onayından sonra herkesin erişimine açılır. Şimdilik sadece senin rotanda görünür.</Text>
          </View>
          <TextInput style={mo.field} placeholder="Yer adı *" placeholderTextColor="#444" value={name} onChangeText={setName} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput style={[mo.field, { flex: 1 }]} placeholder="Enlem (lat)" placeholderTextColor="#444" value={lat} onChangeText={setLat} keyboardType="numeric" />
            <TextInput style={[mo.field, { flex: 1 }]} placeholder="Boylam (lng)" placeholderTextColor="#444" value={lng} onChangeText={setLng} keyboardType="numeric" />
          </View>
          <TextInput style={[mo.field, { height: 80, textAlignVertical: 'top' }]} placeholder="Açıklama" placeholderTextColor="#444" value={desc} onChangeText={setDesc} multiline />
          <TouchableOpacity style={mo.saveBtn} onPress={handleCreate} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={mo.saveBtnText}>Oluştur & Rotaya Ekle</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Rota Ayarları ─────────────────────────────────────────────────────────────
function RouteSettings({ settings, onChange }) {
  return (
    <View style={rs.container}>
      <TextInput
        style={rs.titleInput}
        placeholder="Rota başlığı"
        placeholderTextColor="#444"
        value={settings.title}
        onChangeText={v => onChange({ ...settings, title: v })}
      />
      <TextInput
        style={rs.descInput}
        placeholder="Açıklama (opsiyonel)"
        placeholderTextColor="#444"
        value={settings.description}
        onChangeText={v => onChange({ ...settings, description: v })}
        multiline
      />

      {/* Ulaşım modu */}
      <Text style={rs.label}>Ulaşım</Text>
      <View style={rs.chipRow}>
        {TRANSPORT_MODES.map(m => (
          <TouchableOpacity
            key={m.key}
            style={[rs.chip, settings.transport_mode === m.key && rs.chipActive]}
            onPress={() => onChange({ ...settings, transport_mode: m.key })}
          >
            <Ionicons name={m.icon} size={16} color={settings.transport_mode === m.key ? '#22C55E' : '#666'} />
            <Text style={[rs.chipText, settings.transport_mode === m.key && rs.chipTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Gizlilik */}
      <Text style={rs.label}>Gizlilik</Text>
      <View style={rs.chipRow}>
        {VISIBILITY.map(v => (
          <TouchableOpacity
            key={v.key}
            style={[rs.chip, settings.visibility === v.key && rs.chipActive]}
            onPress={() => onChange({ ...settings, visibility: v.key })}
          >
            <Ionicons name={v.icon} size={14} color={settings.visibility === v.key ? '#22C55E' : '#666'} />
            <Text style={[rs.chipText, settings.visibility === v.key && rs.chipTextActive]}>{v.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Paylaşım türü */}
      <Text style={rs.label}>Ne paylaşılsın?</Text>
      <View style={rs.chipRow}>
        {SHARE_TYPES.map(s => (
          <TouchableOpacity
            key={s.key}
            style={[rs.chip, settings.share_type === s.key && rs.chipActive]}
            onPress={() => onChange({ ...settings, share_type: s.key })}
          >
            <Text style={[rs.chipText, settings.share_type === s.key && rs.chipTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Ana ekran ─────────────────────────────────────────────────────────────────
export default function RouteCreateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();

  const [method, setMethod]   = useState('llm');   // llm | manuel | dynamic
  const [stops, setStops]     = useState([]);
  const [settings, setSettings] = useState({
    title: '', description: '', transport_mode: 'walking',
    visibility: 'private', share_type: 'both',
  });

  // LLM
  const [llmQuery, setLlmQuery]   = useState('');
  const [llmLoading, setLlmLoading] = useState(false);
  const [cityId, setCityId]       = useState(null);

  // Manuel
  const [showSearch, setShowSearch]   = useState(false);
  const [showNewPOI, setShowNewPOI]   = useState(false);
  const [newPOIName, setNewPOIName]   = useState('');

  // Dinamik
  const [recording, setRecording]   = useState(false);
  const [trail, setTrail]           = useState([]);
  const [currentLoc, setCurrentLoc] = useState(null);
  const [dynRouteId, setDynRouteId] = useState(null);
  const locWatcher = useRef(null);
  const mapRef     = useRef(null);

  // Kaydet
  const [saving, setSaving] = useState(false);

  // ── Durak işlemleri ─────────────────────────────────────────────────────────
  const moveUp = (i) => {
    if (i === 0) return;
    const s = [...stops];
    [s[i - 1], s[i]] = [s[i], s[i - 1]];
    setStops(s.map((x, idx) => ({ ...x, seq: idx + 1 })));
  };
  const moveDown = (i) => {
    if (i === stops.length - 1) return;
    const s = [...stops];
    [s[i], s[i + 1]] = [s[i + 1], s[i]];
    setStops(s.map((x, idx) => ({ ...x, seq: idx + 1 })));
  };
  const deleteStop = (i) => setStops(prev => prev.filter((_, idx) => idx !== i).map((x, idx) => ({ ...x, seq: idx + 1 })));
  const updateNote = (i, note) => setStops(prev => prev.map((s, idx) => idx === i ? { ...s, notes: note } : s));

  const addPOI = (poi) => {
    setStops(prev => [...prev, {
      poi_id:    poi.id,
      poi_name:  poi.name,
      name:      poi.name,
      lat:       poi.lat || poi.latitude  || 0,
      lng:       poi.lng || poi.longitude || 0,
      seq:       prev.length + 1,
      notes:     '',
      pending:   poi.pending || false,
    }]);
  };

  // ── LLM rota üret ──────────────────────────────────────────────────────────
  const generateLLMRoute = async () => {
    if (!llmQuery.trim()) return;
    if (!cityId) { Alert.alert('Şehir gerekli', 'Lütfen önce bir şehir seçin.'); return; }
    setLlmLoading(true);
    try {
      const data = await api.post('/routes/generate/llm', {
        city_id:        cityId,
        preferences:    [llmQuery],
        duration_hours: 4,
        transport_mode: settings.transport_mode,
      });
      const plan = data.llm_plan;
      if (plan?.title) setSettings(s => ({ ...s, title: s.title || plan.title }));

      // LLM'in seçtiği durakları stops'a ekle
      const newStops = (plan?.stops || []).map((stop, i) => ({
        poi_id:      stop.poi_id,
        name:        stop.name || `Durak ${i + 1}`,
        lat:         stop.lat || 0,
        lng:         stop.lng || 0,
        seq:         i + 1,
        notes:       '',
        llm_comment: stop.comment || '',
        best_time:   stop.suggested_time || '',
      }));
      setStops(newStops);
      if (plan?.description) setSettings(s => ({ ...s, description: s.description || plan.description }));
    } catch (e) { Alert.alert('LLM Hatası', e.message); }
    finally { setLlmLoading(false); }
  };

  // ── Dinamik kayıt ──────────────────────────────────────────────────────────
  const startRecording = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Konum izni gerekli'); return; }

    // Backend'de boş rota oluştur
    try {
      const data = await api.post('/routes', {
        title:          'Kayıt ' + new Date().toLocaleTimeString('tr-TR'),
        visibility:     'private',
        transport_mode: settings.transport_mode,
        stops:          [],
      });
      setDynRouteId(data.route?.id || data.id);
      await api.patch(`/routes/${data.route?.id || data.id}/recording/start`);
    } catch { /* ilerle */ }

    setRecording(true);
    setTrail([]);

    locWatcher.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
      (pos) => {
        const coord = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setCurrentLoc(coord);
        setTrail(prev => [...prev, coord]);
        mapRef.current?.animateToRegion({ ...coord, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 500);
      }
    );
  };

  const stopRecording = async () => {
    locWatcher.current?.remove();
    locWatcher.current = null;
    setRecording(false);
    if (dynRouteId) {
      try { await api.patch(`/routes/${dynRouteId}/recording/stop`); } catch { /* devam */ }
    }
  };

  const addDynStop = () => {
    if (!currentLoc) { Alert.alert('Konum bekleniyor'); return; }
    setShowSearch(true);
  };

  // ── Rotayı kaydet ──────────────────────────────────────────────────────────
  const saveRoute = async (publish = false) => {
    if (!settings.title.trim()) { Alert.alert('Başlık gerekli'); return; }
    if (stops.length < 1) { Alert.alert('En az 1 durak gerekli'); return; }
    setSaving(true);
    try {
      const vis = publish ? settings.visibility : 'private';
      const body = {
        title:          settings.title,
        description:    settings.description,
        transport_mode: settings.transport_mode,
        visibility:     vis,
        share_type:     settings.share_type,
        stops:          stops.map(s => ({ poi_id: s.poi_id, seq: s.seq, lat: s.lat, lng: s.lng, name: s.name, notes: s.notes || '' })),
      };

      if (dynRouteId) {
        await api.patch(`/routes/${dynRouteId}`, body);
        router.replace(`/route/${dynRouteId}`);
      } else {
        const data = await api.post('/routes', body);
        const newId = data.route?.id || data.id;
        router.replace(`/route/${newId}`);
      }
    } catch (e) { Alert.alert('Kayıt hatası', e.message); }
    finally { setSaving(false); }
  };

  useEffect(() => () => { locWatcher.current?.remove(); }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={[s.container, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Rota Oluştur</Text>
        <TouchableOpacity
          style={s.draftBtn}
          onPress={() => saveRoute(false)}
          disabled={saving}
        >
          <Text style={s.draftText}>Taslak</Text>
        </TouchableOpacity>
      </View>

      {/* Yöntem seçimi */}
      <View style={s.methodBar}>
        {[
          { key: 'llm',     icon: 'sparkles-outline',  label: 'AI'       },
          { key: 'manuel',  icon: 'map-outline',        label: 'Manuel'   },
          { key: 'dynamic', icon: 'navigate-outline',   label: 'Dinamik'  },
        ].map(m => (
          <TouchableOpacity
            key={m.key}
            style={[s.methodBtn, method === m.key && s.methodBtnActive]}
            onPress={() => setMethod(m.key)}
          >
            <Ionicons name={m.icon} size={18} color={method === m.key ? '#22C55E' : '#555'} />
            <Text style={[s.methodText, method === m.key && s.methodTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 120 }}>

        {/* ── LLM YÖNTEMİ ────────────────────────────────────────────────── */}
        {method === 'llm' && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Rotanı Tarif Et</Text>
            <Text style={s.sectionSub}>
              "Ankara'da 4 saatlik tarihi yürüyüş rotası" gibi istediğini yaz
            </Text>
            <View style={s.llmInput}>
              <TextInput
                style={s.llmTextInput}
                placeholder="Nasıl bir rota istiyorsun?"
                placeholderTextColor="#444"
                value={llmQuery}
                onChangeText={setLlmQuery}
                multiline
                maxLength={300}
              />
              <TouchableOpacity
                style={[s.llmSendBtn, (!llmQuery.trim() || llmLoading) && s.llmSendBtnOff]}
                onPress={generateLLMRoute}
                disabled={!llmQuery.trim() || llmLoading}
              >
                {llmLoading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Ionicons name="arrow-forward" size={20} color="#fff" />
                }
              </TouchableOpacity>
            </View>
            {llmLoading && (
              <View style={s.llmLoading}>
                <ActivityIndicator color="#22C55E" />
                <Text style={s.llmLoadingText}>AI rotayı oluşturuyor…</Text>
              </View>
            )}
          </View>
        )}

        {/* ── MANUEL YÖNTEMİ ─────────────────────────────────────────────── */}
        {method === 'manuel' && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>POI Ara & Ekle</Text>
            <TouchableOpacity style={s.addPoiBtn} onPress={() => setShowSearch(true)}>
              <Ionicons name="search-outline" size={18} color="#22C55E" />
              <Text style={s.addPoiBtnText}>Yer ara ve ekle</Text>
              <Ionicons name="add" size={20} color="#22C55E" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── DİNAMİK YÖNTEMİ ────────────────────────────────────────────── */}
        {method === 'dynamic' && (
          <View>
            {/* Harita */}
            <MapView
              ref={mapRef}
              style={{ width, height: 260 }}
              initialRegion={currentLoc
                ? { ...currentLoc, latitudeDelta: 0.005, longitudeDelta: 0.005 }
                : { latitude: 39.92, longitude: 32.85, latitudeDelta: 0.1, longitudeDelta: 0.1 }
              }
            >
              <UrlTile urlTemplate="https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png" maximumZ={19} flipY={false} tileSize={256} />
              {trail.length > 1 && <Polyline coordinates={trail} strokeColor="#22C55E" strokeWidth={3} />}
              {currentLoc && (
                <Marker coordinate={currentLoc}>
                  <View style={s.userDot}><View style={s.userDotInner} /></View>
                </Marker>
              )}
              {stops.map((st, i) => st.lat && st.lng ? (
                <Marker key={i} coordinate={{ latitude: st.lat, longitude: st.lng }} title={st.name}>
                  <View style={s.stopPin}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{i + 1}</Text></View>
                </Marker>
              ) : null)}
            </MapView>

            <View style={s.dynControls}>
              {!recording ? (
                <TouchableOpacity style={s.startBtn} onPress={startRecording}>
                  <Ionicons name="radio-button-on" size={20} color="#fff" />
                  <Text style={s.startBtnText}>Kaydı Başlat</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={s.addStopBtn} onPress={addDynStop}>
                    <Ionicons name="add-circle-outline" size={18} color="#22C55E" />
                    <Text style={s.addStopText}>Durak Ekle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.stopBtn} onPress={stopRecording}>
                    <Ionicons name="stop-circle-outline" size={18} color="#fff" />
                    <Text style={s.stopBtnText}>Durdur</Text>
                  </TouchableOpacity>
                </View>
              )}
              {recording && (
                <View style={s.recIndicator}>
                  <View style={s.recDot} />
                  <Text style={s.recText}>Kayıt · {trail.length} nokta</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── DURAKLAR (tüm yöntemlerde) ─────────────────────────────────── */}
        {stops.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Duraklar ({stops.length})</Text>
              <TouchableOpacity style={s.addMoreBtn} onPress={() => setShowSearch(true)}>
                <Ionicons name="add" size={18} color="#22C55E" />
                <Text style={s.addMoreText}>Ekle</Text>
              </TouchableOpacity>
            </View>
            {stops.map((stop, i) => (
              <StopCard
                key={`${stop.poi_id || stop.name}-${i}`}
                stop={stop} index={i} total={stops.length}
                onUp={moveUp} onDown={moveDown} onDelete={deleteStop} onNote={updateNote}
              />
            ))}
          </View>
        )}

        {stops.length === 0 && method !== 'dynamic' && (
          <View style={s.emptyStops}>
            <Text style={s.emptyStopsIcon}>🗺️</Text>
            <Text style={s.emptyStopsText}>
              {method === 'llm' ? 'AI ile rota oluştur, duraklar buraya gelecek' : 'Yer arayarak durak ekle'}
            </Text>
          </View>
        )}

        {/* ── ROTA AYARLARI ─────────────────────────────────────────────── */}
        <RouteSettings settings={settings} onChange={setSettings} />
      </ScrollView>

      {/* Alt butonlar */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={s.publishBtn} onPress={() => saveRoute(true)} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
                <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                <Text style={s.publishText}>Yayınla</Text>
              </>
          }
        </TouchableOpacity>
        <TouchableOpacity style={s.saveOnlyBtn} onPress={() => saveRoute(false)} disabled={saving}>
          <Text style={s.saveOnlyText}>Taslak Kaydet</Text>
        </TouchableOpacity>
      </View>

      {/* POI Arama Modalı */}
      <POISearchModal
        visible={showSearch}
        onClose={() => setShowSearch(false)}
        onSelect={addPOI}
        onCreate={(name) => { setNewPOIName(name); setShowNewPOI(true); }}
      />

      {/* Yeni POI Oluştur Modalı */}
      <NewPOIModal
        visible={showNewPOI}
        initialName={newPOIName}
        onClose={() => setShowNewPOI(false)}
        onCreate={addPOI}
      />
    </KeyboardAvoidingView>
  );
}

// ── Stiller ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#0A0A0A' },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: '#1C1C1C' },
  backBtn:         { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle:     { color: '#fff', fontSize: 18, fontWeight: '700' },
  draftBtn:        { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#1A1A1A', borderRadius: 10, borderWidth: 0.5, borderColor: '#333' },
  draftText:       { color: '#888', fontSize: 13 },

  methodBar:       { flexDirection: 'row', margin: 16, backgroundColor: '#111', borderRadius: 14, padding: 4, borderWidth: 0.5, borderColor: '#1C1C1C' },
  methodBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12 },
  methodBtnActive: { backgroundColor: '#1A1A1A' },
  methodText:      { color: '#555', fontSize: 12 },
  methodTextActive:{ color: '#22C55E', fontWeight: '600' },

  section:         { paddingHorizontal: 16, marginBottom: 8 },
  sectionHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle:    { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  sectionSub:      { color: '#555', fontSize: 12, marginBottom: 12, lineHeight: 18 },

  llmInput:        { backgroundColor: '#111', borderRadius: 14, padding: 12, borderWidth: 0.5, borderColor: '#1C1C1C', flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  llmTextInput:    { flex: 1, color: '#fff', fontSize: 14, lineHeight: 20, maxHeight: 100 },
  llmSendBtn:      { width: 40, height: 40, backgroundColor: '#22C55E', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  llmSendBtnOff:   { backgroundColor: '#1A3A1A', opacity: 0.5 },
  llmLoading:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, padding: 14, backgroundColor: '#0A2A1A', borderRadius: 12 },
  llmLoadingText:  { color: '#22C55E', fontSize: 13 },

  addPoiBtn:       { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#111', borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: '#22C55E' },
  addPoiBtnText:   { flex: 1, color: '#22C55E', fontSize: 14, fontWeight: '500' },

  dynControls:     { padding: 16, gap: 10 },
  startBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#22C55E', borderRadius: 14, padding: 14 },
  startBtnText:    { color: '#fff', fontSize: 16, fontWeight: '700' },
  addStopBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#0A2A1A', borderRadius: 12, padding: 12, borderWidth: 0.5, borderColor: '#22C55E' },
  addStopText:     { color: '#22C55E', fontWeight: '600', fontSize: 13 },
  stopBtn:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#2A0A0A', borderRadius: 12, padding: 12 },
  stopBtnText:     { color: '#ef4444', fontWeight: '600', fontSize: 13 },
  recIndicator:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recDot:          { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  recText:         { color: '#888', fontSize: 12 },

  userDot:         { width: 20, height: 20, borderRadius: 10, backgroundColor: '#3b82f6', borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  userDotInner:    { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  stopPin:         { width: 26, height: 26, borderRadius: 13, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },

  addMoreBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addMoreText:     { color: '#22C55E', fontSize: 13, fontWeight: '600' },

  emptyStops:      { alignItems: 'center', padding: 40 },
  emptyStopsIcon:  { fontSize: 40, marginBottom: 10 },
  emptyStopsText:  { color: '#444', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  footer:          { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: '#0A0A0A', borderTopWidth: 0.5, borderTopColor: '#1C1C1C' },
  publishBtn:      { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#22C55E', borderRadius: 14, paddingVertical: 14 },
  publishText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
  saveOnlyBtn:     { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111', borderRadius: 14, paddingVertical: 14, borderWidth: 0.5, borderColor: '#333' },
  saveOnlyText:    { color: '#888', fontSize: 14 },
});

// StopCard stilleri
const sc = StyleSheet.create({
  card:        { flexDirection: 'row', marginBottom: 4, paddingHorizontal: 16 },
  seqCol:      { alignItems: 'center', width: 32, paddingTop: 14 },
  seqBubble:   { width: 24, height: 24, borderRadius: 12, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' },
  seqText:     { color: '#fff', fontSize: 11, fontWeight: '700' },
  line:        { flex: 1, width: 2, backgroundColor: '#1C1C1C', marginTop: 4, minHeight: 20 },
  body:        { flex: 1, backgroundColor: '#111', borderRadius: 12, padding: 10, marginLeft: 8, borderWidth: 0.5, borderColor: '#1C1C1C' },
  name:        { color: '#fff', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  aiComment:   { flexDirection: 'row', gap: 5, backgroundColor: '#0A1F0A', borderRadius: 8, padding: 6, marginBottom: 4 },
  aiCommentText:{ color: '#22C55E', fontSize: 11, lineHeight: 16, flex: 1 },
  timeRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  timeText:    { color: '#f59e0b', fontSize: 11 },
  noteInput:   { color: '#888', fontSize: 12, borderTopWidth: 0.5, borderTopColor: '#1C1C1C', marginTop: 6, paddingTop: 6 },
  actions:     { flexDirection: 'column', justifyContent: 'center', gap: 2, paddingLeft: 4 },
  btn:         { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});

// RouteSettings stilleri
const rs = StyleSheet.create({
  container:     { margin: 16, backgroundColor: '#111', borderRadius: 16, padding: 16, borderWidth: 0.5, borderColor: '#1C1C1C' },
  titleInput:    { color: '#fff', fontSize: 16, fontWeight: '600', borderBottomWidth: 0.5, borderBottomColor: '#1C1C1C', paddingBottom: 10, marginBottom: 10 },
  descInput:     { color: '#aaa', fontSize: 13, borderBottomWidth: 0.5, borderBottomColor: '#1C1C1C', paddingBottom: 10, marginBottom: 14, maxHeight: 80 },
  label:         { color: '#666', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  chipRow:       { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  chip:          { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1A1A1A', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 0.5, borderColor: '#2A2A2A' },
  chipActive:    { backgroundColor: '#0A2A1A', borderColor: '#22C55E' },
  chipText:      { color: '#666', fontSize: 12 },
  chipTextActive:{ color: '#22C55E', fontWeight: '600' },
});

// Modal stilleri
const mo = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:       { backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', paddingBottom: Platform.OS === 'ios' ? 30 : 16 },
  handle:      { width: 36, height: 4, backgroundColor: '#333', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  title:       { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center', paddingVertical: 12 },
  searchBar:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12, backgroundColor: '#1A1A1A', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput: { flex: 1, color: '#fff', fontSize: 14 },
  resultRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#1A1A1A' },
  resultIcon:  { width: 34, height: 34, backgroundColor: '#0A2A1A', borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  resultName:  { color: '#fff', fontSize: 14, fontWeight: '600' },
  resultMeta:  { color: '#666', fontSize: 12, marginTop: 2 },
  createBtn:   { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, backgroundColor: '#0A2A1A', borderRadius: 12, marginTop: 8 },
  createText:  { color: '#22C55E', fontSize: 13, fontWeight: '600', flex: 1 },
  infoBox:     { flexDirection: 'row', gap: 8, backgroundColor: '#1A1500', borderRadius: 10, padding: 10 },
  infoText:    { color: '#f59e0b', fontSize: 12, lineHeight: 18, flex: 1 },
  field:       { backgroundColor: '#1A1A1A', color: '#fff', borderRadius: 10, padding: 12, fontSize: 14, borderWidth: 0.5, borderColor: '#2A2A2A' },
  saveBtn:     { backgroundColor: '#22C55E', borderRadius: 14, padding: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});