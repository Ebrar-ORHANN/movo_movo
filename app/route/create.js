// ── app/route/create.js ──────────────────────────────────────────────────────
// 3 MOD:
//   1. AI  — LLM doğal dil → POI listesi + gün batımı/altın saat önerileri
//   2. ÇİZ — Haritaya dokun + yer ara (DB önce, Nominatim fallback)
//   3. CANLI — GPS takip, "Durak Ekle" → yakın DB POI veya yeni POI oluştur
//
// MEDYA PAYLAŞIM TÜRLERİ: Rota+Medya | Sadece Rota | Sadece Medya
// ONAYSIZ POI: rotada görünür, public paylaşımda gizlenir
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, FlatList, ActivityIndicator, Alert,
  Modal, Pressable, KeyboardAvoidingView, Platform,
  Dimensions, Animated,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

const { width, height } = Dimensions.get('window');
const MAP_H = height * 0.48;

// ── Sabitler ──────────────────────────────────────────────────────────────────
const TRANSPORT_MODES = [
  { key:'walking',  icon:'walk-outline',    label:'Yürüyüş', color:'#22C55E' },
  { key:'cycling',  icon:'bicycle-outline', label:'Bisiklet', color:'#3B82F6' },
  { key:'driving',  icon:'car-outline',     label:'Araç',     color:'#F97316' },
];
const VISIBILITY_OPTS = [
  { key:'public',    icon:'earth-outline',       label:'Herkese Açık' },
  { key:'followers', icon:'people-outline',      label:'Takipçiler'   },
  { key:'private',   icon:'lock-closed-outline', label:'Gizli'        },
];
const SHARE_TYPES = [
  { key:'both',  icon:'albums-outline',   label:'Rota + Medya'  },
  { key:'route', icon:'map-outline',      label:'Sadece Rota'   },
  { key:'media', icon:'images-outline',   label:'Sadece Medya'  },
];
const CATEGORY_CHIPS = [
  { q:'cafe',       icon:'☕', label:'Kafe'     },
  { q:'restaurant', icon:'🍽️', label:'Restoran' },
  { q:'museum',     icon:'🏛️', label:'Müze'    },
  { q:'park',       icon:'🌿', label:'Park'     },
  { q:'hotel',      icon:'🏨', label:'Otel'     },
  { q:'historic',   icon:'⚔️', label:'Tarihi'  },
];

// ── Yardımcılar ───────────────────────────────────────────────────────────────
const haversineM = (a,b,c,d) => {
  const R=6371000, r=Math.PI/180;
  const dl=(c-a)*r, dg=(d-b)*r;
  const x=Math.sin(dl/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(dg/2)**2;
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
};
const fmtDist = m => m>1000?`${(m/1000).toFixed(1)} km`:`${Math.round(m)} m`;
const fmtTime = s => { const m=Math.round(s/60); return m<60?`${m} dk`:`${Math.floor(m/60)} sa ${m%60} dk`; };

// Nominatim yer arama — konuma göre filtreli
async function searchNominatim(q, lat, lng) {
  let params = `q=${encodeURIComponent(q)}&format=json&limit=10&addressdetails=1&accept-language=tr`;
  if (lat && lng) {
    const d = 0.9; // ~100km — şehir seçilmişse geniş alan
    params += `&viewbox=${lng-d},${lat-d},${lng+d},${lat+d}&bounded=1`;
    params += `&lat=${lat}&lon=${lng}`;
  }
  params += `&countrycodes=tr`;
  const url = `https://nominatim.openstreetmap.org/search?${params}`;
  const res = await fetch(url, { headers:{'Accept-Language':'tr','User-Agent':'MOVO-App/1.0'} });
  const data = await res.json();
  return data.map(p=>({
    id:`nom_${p.place_id}`,
    name:p.name||p.display_name.split(',')[0],
    address:p.display_name.split(',').slice(1,3).join(', '),
    lat:parseFloat(p.lat),
    lng:parseFloat(p.lon),
    source:'nominatim'
  }));
}

// DB POI arama — seçili şehre veya konuma göre
async function searchDBPois(q, lat, lng, radius=5000) {
  try {
    const params = new URLSearchParams({ q, limit:'15' });
    if (lat && lng) {
      params.append('lat', lat);
      params.append('lng', lng);
      params.append('radius', radius); // şehir seçilmişse daha geniş
    }
    const data = await api.get(`/pois/search?${params}`);
    return (Array.isArray(data)?data:data?.pois||[]).map(p=>({
      ...p,
      source: 'db',
      lat: p.lat || p.latitude,
      lng: p.lng || p.longitude
    }));
  } catch { return []; }
}

// ── Waypoint Pin ──────────────────────────────────────────────────────────────
function WPin({ index, total, color, pending }) {
  const bg = pending?'#f59e0b':index===0?'#22C55E':index===total-1?'#3B82F6':(color||'#8B5CF6');
  return (
    <View style={{ alignItems:'center' }}>
      <View style={[pin.b, { backgroundColor:bg }]}>
        <Text style={pin.t}>{index+1}</Text>
      </View>
      <View style={[pin.tail, { borderTopColor:bg }]} />
      {pending && <View style={pin.pendingDot}/>}
    </View>
  );
}
const pin = StyleSheet.create({
  b:          { width:28, height:28, borderRadius:14, alignItems:'center', justifyContent:'center', borderWidth:2, borderColor:'#fff', elevation:5 },
  t:          { color:'#fff', fontSize:11, fontWeight:'800' },
  tail:       { width:0, height:0, borderLeftWidth:5, borderRightWidth:5, borderTopWidth:7, borderLeftColor:'transparent', borderRightColor:'transparent', marginTop:-1 },
  pendingDot: { width:6, height:6, borderRadius:3, backgroundColor:'#f59e0b', marginTop:2 },
});

// ── Waypoint Satırı ───────────────────────────────────────────────────────────
function WRow({ item, index, total, onUp, onDown, onDelete, onEdit, onFocus }) {
  const dotColor = item.pending?'#f59e0b':index===0?'#22C55E':index===total-1?'#3B82F6':'#8B5CF6';
  return (
    <TouchableOpacity style={wr.row} onPress={()=>onFocus(index)} activeOpacity={0.75}>
      <View style={wr.lineCol}>
        <View style={[wr.dot, { backgroundColor:dotColor }]}/>
        {index<total-1&&<View style={wr.line}/>}
      </View>
      <View style={wr.body}>
        <View style={wr.nameRow}>
          <View style={{ flex:1 }}>
            <Text style={wr.name} numberOfLines={1}>{item.name||`Durak ${index+1}`}</Text>
            {item.pending&&<View style={wr.pendingBadge}><Text style={wr.pendingTxt}>⏳ Onay bekliyor</Text></View>}
            {item.aiComment&&<View style={wr.aiRow}><Ionicons name="sparkles-outline" size={11} color="#22C55E"/><Text style={wr.aiTxt} numberOfLines={2}>{item.aiComment}</Text></View>}
            {item.bestTime&&<View style={wr.timeRow}><Ionicons name="time-outline" size={11} color="#f59e0b"/><Text style={wr.timeTxt}>En iyi: {item.bestTime}</Text></View>}
          </View>
          <View style={wr.acts}>
            <TouchableOpacity style={wr.btn} onPress={()=>onUp(index)} disabled={index===0}>
              <Ionicons name="chevron-up" size={16} color={index===0?'#222':'#888'}/>
            </TouchableOpacity>
            <TouchableOpacity style={wr.btn} onPress={()=>onDown(index)} disabled={index===total-1}>
              <Ionicons name="chevron-down" size={16} color={index===total-1?'#222':'#888'}/>
            </TouchableOpacity>
            <TouchableOpacity style={wr.btn} onPress={()=>onDelete(index)}>
              <Ionicons name="trash-outline" size={14} color="#ef4444"/>
            </TouchableOpacity>
          </View>
        </View>
        {item.note?<Text style={wr.note} numberOfLines={1}>{item.note}</Text>:null}
      </View>
    </TouchableOpacity>
  );
}
const wr = StyleSheet.create({
  row:          { flexDirection:'row', gap:10, marginBottom:4 },
  lineCol:      { alignItems:'center', width:18, paddingTop:4 },
  dot:          { width:12, height:12, borderRadius:6, borderWidth:2, borderColor:'#0A0A0A' },
  line:         { flex:1, width:2, backgroundColor:'#1C1C1C', marginTop:2, minHeight:16 },
  body:         { flex:1, backgroundColor:'#111', borderRadius:12, padding:10, borderWidth:0.5, borderColor:'#1C1C1C' },
  nameRow:      { flexDirection:'row', alignItems:'flex-start', gap:6 },
  name:         { color:'#fff', fontSize:13, fontWeight:'600' },
  pendingBadge: { flexDirection:'row', alignItems:'center', backgroundColor:'#2A1A00', borderRadius:6, paddingHorizontal:6, paddingVertical:2, marginTop:3, alignSelf:'flex-start' },
  pendingTxt:   { color:'#f59e0b', fontSize:10 },
  aiRow:        { flexDirection:'row', alignItems:'flex-start', gap:4, marginTop:4, backgroundColor:'#0A1A0A', borderRadius:6, padding:5 },
  aiTxt:        { color:'#22C55E', fontSize:11, lineHeight:15, flex:1 },
  timeRow:      { flexDirection:'row', alignItems:'center', gap:4, marginTop:3 },
  timeTxt:      { color:'#f59e0b', fontSize:11 },
  note:         { color:'#555', fontSize:11, marginTop:4 },
  acts:         { flexDirection:'column', gap:2 },
  btn:          { width:28, height:28, alignItems:'center', justifyContent:'center', backgroundColor:'#1A1A1A', borderRadius:8 },
});

// ── POI Arama Modalı (DB + Nominatim + Yeni Oluştur) ─────────────────────────
function POISearchModal({ visible, userLoc, onSelect, onCreateNew, onClose }) {
  const [q, setQ]           = useState('');
  const [results, setRes]   = useState([]);
  const [loading, setLoad]  = useState(false);
  const [selCat, setSelCat] = useState(null);
  const timerRef = useRef(null);

  const doSearch = useCallback(async (query, cat=null) => {
    const sq = cat ? cat : query;
    if (!sq.trim()) { setRes([]); return; }
    setLoad(true);
    try {
      // Şehir seçilmişse 20km, yoksa 5km
      const isCity = userLoc && !userLoc.latitude; // selectedCity lat/lng formatı
      const radius = isCity ? 20000 : 5000;
      const lat = userLoc?.lat || userLoc?.latitude;
      const lng = userLoc?.lng || userLoc?.longitude;

      const [dbR, nomR] = await Promise.all([
        searchDBPois(sq, lat, lng, radius),
        searchNominatim(sq, lat, lng),
      ]);
      const merged = [...dbR];
      nomR.forEach(n => {
        if (!merged.some(d=>Math.abs(d.lat-n.lat)<0.001&&Math.abs(d.lng-n.lng)<0.001))
          merged.push(n);
      });
      setRes(merged.slice(0,15));
    } catch { setRes([]); }
    finally { setLoad(false); }
  }, [userLoc]);

  useEffect(()=>{
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(()=>doSearch(q), 450);
    return ()=>clearTimeout(timerRef.current);
  },[q, doSearch]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={sm.overlay} onPress={onClose}/>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={sm.sheet}>
        <View style={sm.handle}/>
        <Text style={sm.title}>Durak Ekle</Text>

        {/* Arama */}
        <View style={sm.searchBar}>
          <Ionicons name="search-outline" size={15} color="#555"/>
          <TextInput style={sm.searchInput} placeholder="Yer ara…" placeholderTextColor="#444"
            value={q} onChangeText={setQ} autoFocus/>
          {loading&&<ActivityIndicator color="#22C55E" size="small"/>}
          {q.length>0&&!loading&&<TouchableOpacity onPress={()=>{setQ('');setRes([]);}}><Ionicons name="close-circle" size={15} color="#444"/></TouchableOpacity>}
        </View>

        {/* Kategori chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={sm.catScroll}>
          {CATEGORY_CHIPS.map((c,i)=>(
            <TouchableOpacity key={i} style={[sm.cat, selCat===c.q&&sm.catActive]} onPress={()=>{ const nc=selCat===c.q?null:c.q; setSelCat(nc); if(nc)doSearch('',nc); else setRes([]); }}>
              <Text style={{fontSize:13}}>{c.icon}</Text>
              <Text style={[sm.catTxt, selCat===c.q&&sm.catTxtActive]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Sonuçlar */}
        <FlatList
          data={results}
          keyExtractor={r=>String(r.id)}
          style={sm.list}
          ListEmptyComponent={
            !loading&&(q.length>1||selCat)?(
              <TouchableOpacity style={sm.createRow} onPress={()=>{ onClose(); onCreateNew(q||selCat||''); }}>
                <Ionicons name="add-circle-outline" size={20} color="#22C55E"/>
                <Text style={sm.createTxt}>"{q||selCat}" adında yeni yer oluştur</Text>
              </TouchableOpacity>
            ):null
          }
          renderItem={({item})=>(
            <TouchableOpacity style={sm.result} onPress={()=>{ onSelect(item); onClose(); }} activeOpacity={0.75}>
              <View style={[sm.resIcon, { backgroundColor:item.source==='db'?'#0A2A1A':'#1A1A2A' }]}>
                <Ionicons name={item.source==='db'?'location':'search'} size={17} color={item.source==='db'?'#22C55E':'#3B82F6'}/>
              </View>
              <View style={{flex:1}}>
                <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                  <Text style={sm.resName} numberOfLines={1}>{item.name}</Text>
                  {item.source==='db'&&<View style={sm.dbBadge}><Text style={sm.dbBadgeTxt}>DB</Text></View>}
                </View>
                <Text style={sm.resAddr} numberOfLines={1}>{item.address||item.category||''}</Text>
              </View>
              <Ionicons name="add" size={20} color="#22C55E"/>
            </TouchableOpacity>
          )}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Şehir / İlçe Seçici ──────────────────────────────────────────────────────
function CityPicker({ onSelect, onClose, visible }) {
  const [q, setQ]         = useState('');
  const [results, setRes] = useState([]);
  const [loading, setLoad] = useState(false);
  const timerRef = useRef(null);

  const search = async (query) => {
    if (query.length < 2) { setRes([]); return; }
    setLoad(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&countrycodes=tr&limit=10&addressdetails=1&featuretype=city,town,village,suburb,district`;
      const res = await fetch(url, { headers:{'Accept-Language':'tr','User-Agent':'MOVO-App/1.0'} });
      const data = await res.json();
      const filtered = data.filter(p => ['city','town','village','suburb','administrative','municipality'].includes(p.type) || p.addresstype === 'province');
      setRes(filtered.slice(0, 8));
    } catch { setRes([]); }
    finally { setLoad(false); }
  };

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(q), 400);
    return () => clearTimeout(timerRef.current);
  }, [q]);

  // Popüler şehirler
  const POPULAR = [
    { name:'İstanbul',  lat:41.0082, lng:28.9784 },
    { name:'Ankara',    lat:39.9208, lng:32.8541 },
    { name:'İzmir',     lat:38.4192, lng:27.1287 },
    { name:'Antalya',   lat:36.8969, lng:30.7133 },
    { name:'Bursa',     lat:40.1826, lng:29.0665 },
    { name:'Trabzon',   lat:41.0015, lng:39.7178 },
    { name:'Kapadokya', lat:38.6430, lng:34.8289 },
    { name:'Bodrum',    lat:37.0344, lng:27.4305 },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={sm.overlay} onPress={onClose}/>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={sm.sheet}>
        <View style={sm.handle}/>
        <Text style={sm.title}>Şehir / İlçe Seç</Text>

        <View style={sm.searchBar}>
          <Ionicons name="location-outline" size={15} color="#555"/>
          <TextInput style={sm.searchInput} placeholder="İl veya ilçe ara… (Ankara, Kadıköy…)"
            placeholderTextColor="#444" value={q} onChangeText={setQ} autoFocus/>
          {loading&&<ActivityIndicator color="#22C55E" size="small"/>}
          {q.length>0&&!loading&&<TouchableOpacity onPress={()=>{setQ('');setRes([]);}}>
            <Ionicons name="close-circle" size={15} color="#444"/></TouchableOpacity>}
        </View>

        {/* Sonuçlar */}
        {results.length > 0 ? (
          <FlatList
            data={results}
            keyExtractor={r=>r.place_id}
            style={sm.list}
            renderItem={({item})=>{
              const name = item.name || item.display_name.split(',')[0];
              const sub  = item.display_name.split(',').slice(1,3).join(',').trim();
              return (
                <TouchableOpacity style={sm.result} onPress={()=>{ onSelect({ name, lat:parseFloat(item.lat), lng:parseFloat(item.lon) }); onClose(); }}>
                  <View style={[sm.resIcon,{backgroundColor:'#0A1A2A'}]}>
                    <Ionicons name="location-outline" size={17} color="#3B82F6"/>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={sm.resName}>{name}</Text>
                    <Text style={sm.resAddr} numberOfLines={1}>{sub}</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color="#22C55E"/>
                </TouchableOpacity>
              );
            }}
          />
        ) : (
          /* Popüler şehirler */
          <View style={{padding:16}}>
            <Text style={{color:'#555',fontSize:11,fontWeight:'700',letterSpacing:1,marginBottom:10}}>POPÜLER ŞEHİRLER</Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
              {POPULAR.map((c,i)=>(
                <TouchableOpacity key={i} style={cp.cityChip} onPress={()=>{ onSelect(c); onClose(); }}>
                  <Ionicons name="location-outline" size={12} color="#22C55E"/>
                  <Text style={cp.cityChipTxt}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
const cp = StyleSheet.create({
  cityChip:    { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:'#111', borderRadius:18, paddingHorizontal:12, paddingVertical:8, borderWidth:0.5, borderColor:'#1C1C1C' },
  cityChipTxt: { color:'#ccc', fontSize:13 },
});
function NewPOIModal({ visible, initName, userLoc, onCreated, onClose }) {
  const [name, setName]   = useState(initName||'');
  const [lat, setLat]     = useState(userLoc?.lat?.toFixed(6)||'');
  const [lng, setLng]     = useState(userLoc?.lng?.toFixed(6)||'');
  const [cat, setCat]     = useState('other');
  const [desc, setDesc]   = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(()=>{ setName(initName||''); setLat(userLoc?.lat?.toFixed(6)||''); setLng(userLoc?.lng?.toFixed(6)||''); }, [visible]);

  const handleCreate = async () => {
    if (!name.trim()||!lat||!lng) { Alert.alert('Hata','İsim ve koordinat gerekli'); return; }
    setSaving(true);
    try {
      const data = await api.post('/pois/user-create', { name:name.trim(), lat:parseFloat(lat), lng:parseFloat(lng), category:cat, description:desc });
      onCreated({ ...data, lat:parseFloat(lat), lng:parseFloat(lng), name:name.trim(), pending:true });
      onClose();
    } catch(e) { Alert.alert('Hata', e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={sm.overlay} onPress={onClose}/>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={sm.sheet}>
        <View style={sm.handle}/>
        <Text style={sm.title}>Yeni Yer Oluştur</Text>
        <ScrollView contentContainerStyle={{padding:16,gap:10}}>
          <View style={np.infoBox}>
            <Ionicons name="information-circle-outline" size={15} color="#f59e0b"/>
            <Text style={np.infoTxt}>Admin onayına gönderilir. Onaylanana kadar sadece senin rotanda görünür. Public rotanda gizli kalır.</Text>
          </View>
          <TextInput style={np.field} placeholder="Yer adı *" placeholderTextColor="#444" value={name} onChangeText={setName}/>
          <View style={{flexDirection:'row',gap:10}}>
            <TextInput style={[np.field,{flex:1}]} placeholder="Enlem" placeholderTextColor="#444" value={lat} onChangeText={setLat} keyboardType="numeric"/>
            <TextInput style={[np.field,{flex:1}]} placeholder="Boylam" placeholderTextColor="#444" value={lng} onChangeText={setLng} keyboardType="numeric"/>
          </View>
          <TextInput style={[np.field,{height:70,textAlignVertical:'top'}]} placeholder="Açıklama (opsiyonel)" placeholderTextColor="#444" value={desc} onChangeText={setDesc} multiline/>
          <TouchableOpacity style={np.saveBtn} onPress={handleCreate} disabled={saving}>
            {saving?<ActivityIndicator color="#fff" size="small"/>:<Text style={np.saveTxt}>Oluştur & Rotaya Ekle</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const np = StyleSheet.create({
  infoBox:  { flexDirection:'row', gap:8, backgroundColor:'#1A1000', borderRadius:10, padding:10 },
  infoTxt:  { color:'#f59e0b', fontSize:12, lineHeight:18, flex:1 },
  field:    { backgroundColor:'#1A1A1A', color:'#fff', borderRadius:10, padding:12, fontSize:14, borderWidth:0.5, borderColor:'#2A2A2A' },
  saveBtn:  { backgroundColor:'#22C55E', borderRadius:14, padding:14, alignItems:'center' },
  saveTxt:  { color:'#fff', fontWeight:'700', fontSize:15 },
});

// ── Waypoint Düzenleme Modalı ─────────────────────────────────────────────────
function EditWPModal({ visible, wp, index, onSave, onClose }) {
  const [name, setName] = useState(wp?.name||'');
  const [note, setNote] = useState(wp?.note||'');
  useEffect(()=>{ if(wp){ setName(wp.name||''); setNote(wp.note||''); } },[wp]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sm.overlay} onPress={onClose}/>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={sm.sheet}>
        <View style={sm.handle}/>
        <Text style={sm.title}>Durak {(index??0)+1} Düzenle</Text>
        <View style={{padding:16,gap:12}}>
          <TextInput style={np.field} value={name} onChangeText={setName} placeholder="Durak adı" placeholderTextColor="#444" autoFocus maxLength={60}/>
          <TextInput style={[np.field,{height:80,textAlignVertical:'top'}]} value={note} onChangeText={setNote} placeholder="Not (opsiyonel)" placeholderTextColor="#444" multiline maxLength={200}/>
          <TouchableOpacity style={np.saveBtn} onPress={()=>{ onSave(index,{name:name.trim()||`Durak ${(index??0)+1}`,note:note.trim()}); onClose(); }}>
            <Text style={np.saveTxt}>Kaydet</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Ana Ekran ─────────────────────────────────────────────────────────────────
export default function RouteCreateScreen() {
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const { profile } = useAuth();
  const mapRef   = useRef(null);

  const [mode, setMode]       = useState('draw'); // draw | live | ai
  const [waypoints, setWP]    = useState([]);
  const [editIdx, setEditIdx] = useState(null);
  const [showEdit, setShowEdit]     = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showNewPOI, setShowNewPOI] = useState(false);
  const [newPOIName, setNewPOIName] = useState('');
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [selectedCity, setSelectedCity]     = useState(null);
  const [drawMode, setDrawMode]     = useState(false);

  // Konum
  const [currentLoc, setCurrentLoc] = useState(null);

  // Canlı kayıt
  const [recording, setRecording]   = useState(false);
  const [trail, setTrail]           = useState([]);
  const [elapsed, setElapsed]       = useState(0);
  const [distM, setDistM]           = useState(0);
  const locWatcher  = useRef(null);
  const timerRef    = useRef(null);
  const startTimeRef = useRef(null);
  const pulseAnim   = useRef(new Animated.Value(1)).current;

  // AI
  const [aiQ, setAiQ]           = useState('');
  const [aiLoading, setAiLoad]  = useState(false);
  const [aiResponse, setAiResp] = useState('');
  const [radiusKm, setRadiusKm] = useState(5); // AI arama yarıçapı (km)
  const [navPoly, setNavPoly]   = useState([]);   // OSRM yol tarifi polyline
  const [navPanel, setNavPanel] = useState(null); // { steps, dist, dur }

  // Rota ayarları
  const [title, setTitle]         = useState('');
  const [desc, setDesc]           = useState('');
  const [transport, setTransport] = useState('walking');
  const [visibility, setVis]      = useState('public');
  const [shareType, setShareType] = useState('both');
  const [showSettings, setShowSettings] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [mapPois, setMapPois]     = useState([]);   // haritadaki DB POI'ları
  const [selPoi, setSelPoi]       = useState(null); // tıklanan POI popup
  const bboxTimer = useRef(null);

  // ── Canlı modda konuma göre POI yükle ───────────────────────────────────────
  const loadNearbyPois = useCallback(async (lat, lng, radiusM) => {
    try {
      const data = await api.get(`/pois/nearby?lat=${lat}&lng=${lng}&radius=${radiusM}&limit=100`);
      setMapPois(Array.isArray(data) ? data.slice(0,100) : []);
    } catch {}
  }, []);

  // Harita bbox değişince DB'den POI çek (çiz modu)
  const onRegionChange = useCallback((region) => {
    if (mode === 'live') return; // canlı modda radius ile yükleniyor
    clearTimeout(bboxTimer.current);
    bboxTimer.current = setTimeout(async () => {
      const { latitude: lat, longitude: lng, latitudeDelta: dlat, longitudeDelta: dlng } = region;
      if (dlat > 0.5) { setMapPois([]); return; }
      try {
        const minLng = lng - dlng/2, maxLng = lng + dlng/2;
        const minLat = lat - dlat/2, maxLat = lat + dlat/2;
        const data = await api.get(`/pois/bbox?min_lng=${minLng}&min_lat=${minLat}&max_lng=${maxLng}&max_lat=${maxLat}`);
        setMapPois(Array.isArray(data) ? data.slice(0, 100) : []);
      } catch { setMapPois([]); }
    }, 600);
  }, [mode]);

  // ── Konum al ────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setCurrentLoc(loc);
      setTimeout(() => mapRef.current?.animateToRegion({ latitude:loc.lat, longitude:loc.lng, latitudeDelta:0.015, longitudeDelta:0.015 }, 800), 400);
    })();
    return () => { locWatcher.current?.remove(); clearInterval(timerRef.current); };
  }, []);

  // Canlı moda geçince haritayı konuma götür
  useEffect(() => {
    if (mode==='live'&&currentLoc) {
      setTimeout(() => mapRef.current?.animateToRegion({ latitude:currentLoc.lat, longitude:currentLoc.lng, latitudeDelta:0.008, longitudeDelta:0.008 }, 600), 200);
    }
  }, [mode]);

  // Pulse animasyonu
  useEffect(() => {
    if (!recording) { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue:1.4, duration:600, useNativeDriver:true }),
      Animated.timing(pulseAnim, { toValue:1,   duration:600, useNativeDriver:true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [recording]);

  // ── Canlı kayıt ─────────────────────────────────────────────────────────────
  const startLive = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Konum izni gerekli'); return; }
    setTrail([]); setDistM(0); setElapsed(0);
    startTimeRef.current = Date.now();
    setRecording(true);
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now()-startTimeRef.current)/1000)), 1000);
    locWatcher.current = await Location.watchPositionAsync(
      { accuracy:Location.Accuracy.High, timeInterval:3000, distanceInterval:5 },
      pos => {
        const coord = { latitude:pos.coords.latitude, longitude:pos.coords.longitude };
        setCurrentLoc({ lat:pos.coords.latitude, lng:pos.coords.longitude, ...coord });
        setTrail(prev => {
          if (prev.length>0) {
            const last = prev[prev.length-1];
            setDistM(m => m + haversineM(last.latitude,last.longitude,coord.latitude,coord.longitude));
          }
          return [...prev, coord];
        });
        // Canlı modda radius bazlı POI yükle
        loadNearbyPois(pos.coords.latitude, pos.coords.longitude, radiusKm * 1000);
        mapRef.current?.animateToRegion({ ...coord, latitudeDelta:0.005, longitudeDelta:0.005 }, 800);
      }
    );
  };

  const stopLive = () => {
    locWatcher.current?.remove(); locWatcher.current = null;
    clearInterval(timerRef.current);
    setRecording(false);
  };

  // Canlı modda durak ekle — yakın DB POI bul
  const dropMarkerLive = () => {
    if (!currentLoc) { Alert.alert('Konum bekleniyor'); return; }
    setShowSearch(true); // POI arama modalını aç, kullanıcı seçer
  };

  // ── Waypoint işlemleri ───────────────────────────────────────────────────────
  const addWP = useCallback((wp) => setWP(prev => [...prev, { ...wp, timestamp:Date.now() }]), []);

  const moveUp = (i) => {
    setWP(prev => { const a=[...prev]; [a[i-1],a[i]]=[a[i],a[i-1]]; return a; });
  };
  const moveDown = (i) => {
    setWP(prev => { const a=[...prev]; [a[i],a[i+1]]=[a[i+1],a[i]]; return a; });
  };
  const deleteWP = (i) => setWP(prev => prev.filter((_,idx)=>idx!==i));
  const editWP   = (i,data) => setWP(prev => prev.map((w,idx)=>idx===i?{...w,...data}:w));
  const focusWP  = (i) => {
    const wp = waypoints[i];
    if (!wp) return;
    mapRef.current?.animateToRegion({ latitude:wp.lat, longitude:wp.lng, latitudeDelta:0.01, longitudeDelta:0.01 }, 600);
  };

  const handleCitySelect = (city) => {
    setSelectedCity(city);
    mapRef.current?.animateToRegion({
      latitude:  city.lat,
      longitude: city.lng,
      latitudeDelta:  0.12,
      longitudeDelta: 0.12,
    }, 800);
  };

  const handleMapPress = (e) => {
    if (mode!=='draw'||!drawMode) return;
    const { latitude, longitude } = e.nativeEvent.coordinate;
    const newIdx = waypoints.length;
    addWP({ lat:latitude, lng:longitude, name:`Durak ${newIdx+1}`, note:'', source:'map' });
    // Hemen isim düzenleme modalını aç
    setTimeout(() => { setEditIdx(newIdx); setShowEdit(true); }, 100);
  };

  const handlePOISelect = (poi) => {
    addWP({ lat:poi.lat, lng:poi.lng, name:poi.name, note:poi.address||'', source:poi.source, poiId:poi.id, pending:false });
    mapRef.current?.animateToRegion({ latitude:poi.lat, longitude:poi.lng, latitudeDelta:0.01, longitudeDelta:0.01 }, 600);
  };

  const handleNewPOICreated = (poi) => {
    addWP({ lat:poi.lat, lng:poi.lng, name:poi.name, note:'', source:'user', poiId:poi.id, pending:true });
  };

  // ── AI rota ─────────────────────────────────────────────────────────────────
  const generateAI = async (prompt) => {
    const q = (prompt||aiQ).trim();
    if (!q) return;
    setAiLoad(true);
    setAiResp('');
    setNavPoly([]); setNavPanel(null);
    try {
      const res = await api.post('/explorer/chat', {
        message:  q,
        lat:      currentLoc?.lat || null,
        lng:      currentLoc?.lng || null,
        radius_m: radiusKm * 1000,
        history:  [],
      });
      // Yanıt metnini inline göster
      if (res?.response) setAiResp(res.response);

      if (res?.locations?.length) {
        const wps = res.locations.filter(l=>l.lat&&l.lng).map((l,i) => ({
          lat:l.lat, lng:l.lng, name:l.name||`Durak ${i+1}`,
          note:l.description||'', source:'ai', timestamp:Date.now()+i,
          aiComment: l.best_time ? `⏰ En iyi: ${l.best_time}` : (l.description||''),
          bestTime:  l.best_time||'',
          tags:      l.tags||[],
        }));
        setWP(wps);
        if (!title && res.route_suggestion?.title) setTitle(res.route_suggestion.title);
        if (wps.length>0) {
          mapRef.current?.fitToCoordinates(wps.map(w=>({latitude:w.lat,longitude:w.lng})), {
            edgePadding:{top:80,right:40,bottom:200,left:40}, animated:true,
          });
        }
      } else if (!res?.response) {
        setAiResp('Sonuç bulunamadı. Farklı bir şey dene.');
      }
    } catch(e) {
      setAiResp('AI şu an yanıt veremiyor. Tekrar dene.');
    }
    finally { setAiLoad(false); }
  };

  // ── Waypoint marker tıklama → OSRM yol tarifi ────────────────────────────────
  const handleWPMarkerPress = async (wp, i) => {
    setEditIdx(i); setShowEdit(true);
    // Eğer konum varsa OSRM ile yol tarifi getir
    if (!currentLoc) return;
    try {
      const profile = { walking:'foot', cycling:'bike', driving:'car' }[transport] || 'foot';
      const url = `https://router.project-osrm.org/route/v1/${profile}/${currentLoc.lng},${currentLoc.lat};${wp.lng},${wp.lat}?steps=true&geometries=geojson&overview=full`;
      const res  = await fetch(url);
      const data = await res.json();
      if (data.code !== 'Ok') return;
      const route = data.routes[0];
      const poly  = route.geometry.coordinates.map(c=>({latitude:c[1],longitude:c[0]}));
      setNavPoly(poly);
      const steps = [];
      route.legs[0]?.steps?.forEach(s => {
        const t = s.maneuver?.type; const m = s.maneuver?.modifier||'';
        const icons = { turn:{left:'↰',right:'↱',straight:'↑','sharp left':'↰','sharp right':'↱'},depart:{'':'🚶'},arrive:{'':'📍'} };
        const icon = icons[t]?.[m] || icons[t]?.[''] || '•';
        steps.push({ icon, text: s.name ? `${m} → ${s.name}` : m||t, dist: Math.round(s.distance) });
      });
      setNavPanel({
        steps,
        dist:  Math.round(route.distance),
        dur:   Math.round(route.duration / 60),
        name:  wp.name,
      });
      mapRef.current?.fitToCoordinates(poly, { edgePadding:{top:80,right:30,bottom:300,left:30}, animated:true });
    } catch { /* OSRM ulaşılamazsa sessizce geç */ }
  };
  const totalDist = useMemo(() => {
    let d=0;
    for(let i=1;i<waypoints.length;i++) d+=haversineM(waypoints[i-1].lat,waypoints[i-1].lng,waypoints[i].lat,waypoints[i].lng);
    return d;
  }, [waypoints]);

  // ── Kaydet & Paylaş ──────────────────────────────────────────────────────────
  // Onaysız POI'ları filtrele (public paylaşımda)
  const getPublicWaypoints = () => {
    const vis = visibility;
    if (vis==='private') return waypoints;
    return waypoints.filter(w => !w.pending); // onaysız POI'ları çıkar
  };

  const handleSave = async (publish=true) => {
    if (!title.trim()) { Alert.alert('Başlık gerekli'); return; }
    const wps = publish ? getPublicWaypoints() : waypoints;
    if (wps.length<1) { Alert.alert('En az 1 durak gerekli'); return; }
    if (publish && wps.length < waypoints.length) {
      const pendingCount = waypoints.length - wps.length;
      const confirmed = await new Promise(res => Alert.alert(
        'Onaysız POI\'lar',
        `${pendingCount} onaysız yer public rotada gizlenecek. Devam et?`,
        [{ text:'İptal', style:'cancel', onPress:()=>res(false) }, { text:'Devam', onPress:()=>res(true) }]
      ));
      if (!confirmed) return;
    }

    setSaving(true);
    try {
      const vis = publish ? visibility : 'private';
      const body = {
        title:          title.trim(),
        description:    desc.trim()||null,
        transport_mode: transport,
        visibility:     vis,
        share_type:     shareType,
        trail_coords:   trail.length>1 ? trail.map(c=>({lat:c.latitude,lng:c.longitude})) : null,
        distance_m:     Math.round(totalDist),
        stops:          wps.map((w,i) => ({
          lat:w.lat, lng:w.lng, name:w.name,
          notes:w.note||'', seq:i+1,
          poi_id: w.poiId||null,
        })),
      };

      const data = await api.post('/routes', body);
      const newId = data?.route?.id||data?.id;

      // Feed'e post oluştur (public/followers)
      if (publish && (vis==='public'||vis==='followers') && shareType!=='media') {
        try {
          await api.post('/social/posts', {
            content_type: 'route', route_id: newId,
            user_note: desc.trim()||title.trim(),
            visibility: vis,
          });
        } catch { /* route kaydedildi, post isteğe bağlı */ }
      }

      Alert.alert(
        publish ? '🗺️ Rota Paylaşıldı!' : '📥 Taslak Kaydedildi',
        publish && wps.length < waypoints.length ? `${waypoints.length-wps.length} onaysız yer gizlendi.` : '',
        [{ text:'Tamam', onPress:()=>router.replace(newId?`/route/${newId}`:'/(tabs)/profile') }]
      );
    } catch(e) { Alert.alert('Hata', e.message); }
    finally { setSaving(false); }
  };

  // ── Polyline ─────────────────────────────────────────────────────────────────
  const polyCoords = waypoints.map(w=>({latitude:w.lat,longitude:w.lng}));
  const trailColor = TRANSPORT_MODES.find(t=>t.key===transport)?.color||'#22C55E';

  // ── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>

      {/* ── HARİTA ── */}
      <View style={{height:MAP_H}}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          mapType="standard"
          onPress={handleMapPress}
          onRegionChangeComplete={onRegionChange}
          showsUserLocation={!!currentLoc}
          showsCompass={false}
          rotateEnabled={false}
          initialRegion={{ latitude:39.92, longitude:32.85, latitudeDelta:0.1, longitudeDelta:0.1 }}
        >

          {trail.length>1&&<Polyline coordinates={trail} strokeColor={`${trailColor}55`} strokeWidth={3} lineDashPattern={[6,4]}/>}
          {navPoly.length>1&&<Polyline coordinates={navPoly} strokeColor="#3B82F6" strokeWidth={4} lineJoin="round" lineDashPattern={[8,4]}/>}
          {polyCoords.length>1&&<Polyline coordinates={polyCoords} strokeColor={trailColor} strokeWidth={4} lineJoin="round"/>}

          {/* ── DB POI marker'ları ── */}
          {mapPois.map(poi=>{
            const added = waypoints.some(w=>w.poiId===poi.id);
            const catIcon = {cafe:'☕',restaurant:'🍽️',museum:'🏛️',park:'🌿',hotel:'🏨',pharmacy:'💊',historic:'⚔️'}[poi.category]||'📍';
            return (
              <Marker key={`mp_${poi.id}`} coordinate={{latitude:poi.lat,longitude:poi.lng}}
                onPress={()=>setSelPoi(poi)} tracksViewChanges={false}>
                <View style={[mpoi.dot, added&&mpoi.dotAdded]}>
                  <Text style={{fontSize:11}}>{catIcon}</Text>
                </View>
              </Marker>
            );
          })}

          {waypoints.map((wp,i)=>(
            <Marker key={`${wp.timestamp}-${i}`} coordinate={{latitude:wp.lat,longitude:wp.lng}}
              onPress={()=>handleWPMarkerPress(wp, i)} tracksViewChanges={false}>
              <WPin index={i} total={waypoints.length} color={trailColor} pending={wp.pending}/>
            </Marker>
          ))}
        </MapView>

        <LinearGradient colors={['rgba(0,0,0,0.65)','transparent']} style={s.topGrad} pointerEvents="none"/>
        <LinearGradient colors={['transparent','rgba(0,0,0,0.45)']} style={s.botGrad} pointerEvents="none"/>

        {/* Header */}
        <View style={[s.header,{paddingTop:insets.top+8}]}>
          <TouchableOpacity style={s.iconBtn} onPress={()=>router.back()}>
            <Ionicons name="arrow-back" size={21} color="#fff"/>
          </TouchableOpacity>
          <View style={s.modeTabs}>
            {[{key:'draw',icon:'finger-print-outline',label:'Çiz'},{key:'live',icon:'radio-button-on-outline',label:'Canlı'},{key:'ai',icon:'sparkles-outline',label:'AI'}].map(m=>(
              <TouchableOpacity key={m.key} style={[s.modeTab,mode===m.key&&s.modeTabOn]} onPress={()=>{ setMode(m.key); if(recording)stopLive(); }}>
                <Ionicons name={m.icon} size={12} color={mode===m.key?'#22C55E':'#888'}/>
                <Text style={[s.modeTabTxt,mode===m.key&&{color:'#22C55E'}]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={s.iconBtn} onPress={()=>setShowSettings(!showSettings)}>
            <Ionicons name="options-outline" size={20} color="#fff"/>
          </TouchableOpacity>
        </View>

        {/* Canlı HUD */}
        {mode==='live'&&recording&&(
          <View style={s.liveHud}>
            <Animated.View style={[s.recDot,{transform:[{scale:pulseAnim}]}]}/>
            <Text style={s.liveVal}>{fmtTime(elapsed)}</Text>
            <View style={s.hudDiv}/>
            <Text style={s.liveVal}>{fmtDist(distM)}</Text>
            <View style={s.hudDiv}/>
            <Text style={s.liveVal}>{trail.length} nokta</Text>
          </View>
        )}

        {/* Çiz ipucu */}
        {mode==='draw'&&drawMode&&(
          <View style={s.drawHint}>
            <Ionicons name="hand-left-outline" size={12} color="#22C55E"/>
            <Text style={s.drawHintTxt}>Haritaya dokun → marker ekle</Text>
          </View>
        )}

        {/* Sayaç */}
        {waypoints.length>0&&(
          <View style={s.counter}>
            <Text style={s.counterN}>{waypoints.length}</Text>
            <Text style={s.counterS}>durak</Text>
            {waypoints.some(w=>w.pending)&&<View style={s.pendingCount}><Text style={s.pendingCountTxt}>⏳{waypoints.filter(w=>w.pending).length}</Text></View>}
          </View>
        )}

        {/* Harita butonları */}
        <View style={s.mapBtns}>
          {mode==='draw'&&(
            <>
              <TouchableOpacity style={[s.mapBtn,{backgroundColor:'#1A1A3A'}]} onPress={()=>setShowSearch(true)}>
                <Ionicons name="search-outline" size={20} color="#3B82F6"/>
              </TouchableOpacity>
              <TouchableOpacity style={[s.mapBtn,drawMode&&{backgroundColor:'#22C55E'}]} onPress={()=>setDrawMode(!drawMode)}>
                <Ionicons name={drawMode?'checkmark':'add-outline'} size={21} color="#fff"/>
              </TouchableOpacity>
            </>
          )}
          {mode==='live'&&!recording&&(
            <TouchableOpacity style={[s.mapBtn,{backgroundColor:'#ef4444'}]} onPress={startLive}>
              <Ionicons name="radio-button-on" size={21} color="#fff"/>
            </TouchableOpacity>
          )}
          {mode==='live'&&recording&&(
            <>
              <TouchableOpacity style={[s.mapBtn,{backgroundColor:'#22C55E'}]} onPress={dropMarkerLive}>
                <Ionicons name="location" size={19} color="#fff"/>
              </TouchableOpacity>
              <TouchableOpacity style={[s.mapBtn,{backgroundColor:'#ef4444'}]} onPress={stopLive}>
                <Ionicons name="stop" size={19} color="#fff"/>
              </TouchableOpacity>
            </>
          )}
          {waypoints.length>0&&(
            <TouchableOpacity style={[s.mapBtn,{backgroundColor:'rgba(20,20,20,0.9)'}]} onPress={()=>setWP(prev=>prev.slice(0,-1))}>
              <Ionicons name="arrow-undo" size={18} color="#ccc"/>
            </TouchableOpacity>
          )}
          {polyCoords.length>1&&(
            <TouchableOpacity style={[s.mapBtn,{backgroundColor:'rgba(20,20,20,0.9)'}]} onPress={()=>mapRef.current?.fitToCoordinates(polyCoords,{edgePadding:{top:80,right:40,bottom:80,left:40},animated:true})}>
              <Ionicons name="expand-outline" size={18} color="#ccc"/>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── ALT PANEL ── */}
      <ScrollView style={s.panel} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:120}}>

        {/* AI bar */}
        {mode==='ai'&&(
          <View>
            <View style={s.aiBar}>
              <View style={s.aiInput}>
                <Ionicons name="sparkles-outline" size={15} color="#22C55E"/>
                <TextInput style={s.aiTextIn} placeholder="Nasıl bir rota oluşturayım?" placeholderTextColor="#444" value={aiQ} onChangeText={setAiQ} onSubmitEditing={()=>generateAI()} returnKeyType="search"/>
                {aiQ.length>0&&<TouchableOpacity onPress={()=>setAiQ('')}><Ionicons name="close-circle" size={14} color="#444"/></TouchableOpacity>}
              </View>
              <TouchableOpacity style={[s.aiSend,(!aiQ.trim()||aiLoading)&&{opacity:0.5}]} onPress={()=>generateAI()} disabled={!aiQ.trim()||aiLoading}>
                {aiLoading?<ActivityIndicator color="#fff" size="small"/>:<Ionicons name="arrow-forward" size={17} color="#fff"/>}
              </TouchableOpacity>
            </View>
            {aiLoading&&<View style={s.aiLoad}><ActivityIndicator color="#22C55E"/><Text style={s.aiLoadTxt}>AI rotanı hazırlıyor…</Text></View>}
            {!aiLoading&&waypoints.length===0&&(
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:8}}>
                {['3 saatlik tarihi yürüyüş','Kafe ve kültür turu','Fotoğraf noktaları','Gün batımı rotası'].map((p,i)=>(
                  <TouchableOpacity key={i} style={s.promptChip} onPress={()=>{setAiQ(p);generateAI(p);}}>
                    <Text style={s.promptTxt}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* AI inline yanıt */}
        {mode==='ai'&&aiResponse&&!aiLoading&&(
          <View style={air.box}>
            <Ionicons name="sparkles" size={14} color="#22C55E"/>
            <Text style={air.txt}>{aiResponse}</Text>
            <TouchableOpacity onPress={()=>setAiResp('')}>
              <Ionicons name="close" size={14} color="#444"/>
            </TouchableOpacity>
          </View>
        )}

        {/* OSRM yol tarifi paneli */}
        {navPanel&&(
          <View style={air.navBox}>
            <View style={air.navHeader}>
              <View style={{flex:1}}>
                <Text style={air.navTitle}>📍 {navPanel.name}</Text>
                <Text style={air.navSub}>{navPanel.dist>=1000?`${(navPanel.dist/1000).toFixed(1)} km`:`${navPanel.dist} m`} · ~{navPanel.dur} dk</Text>
              </View>
              <TouchableOpacity onPress={()=>{setNavPanel(null);setNavPoly([]);}}>
                <Ionicons name="close" size={18} color="#666"/>
              </TouchableOpacity>
            </View>
            <ScrollView style={{maxHeight:120}} showsVerticalScrollIndicator={false}>
              {navPanel.steps.map((s,i)=>(
                <View key={i} style={air.navStep}>
                  <Text style={air.navIcon}>{s.icon}</Text>
                  <Text style={air.navTxt} numberOfLines={1}>{s.text}</Text>
                  {s.dist>0&&<Text style={air.navDist}>{s.dist}m</Text>}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Canlı mod — radius slider */}
        {mode==='live'&&(
          <View style={{marginBottom:8}}>
            <View style={sl.wrap}>
              <View style={sl.labelRow}>
                <Ionicons name="radio-outline" size={13} color="#22C55E"/>
                <Text style={sl.label}>Yakın POI yarıçapı</Text>
                <Text style={sl.val}>{radiusKm < 1 ? `${radiusKm*1000}m` : `${radiusKm} km`}</Text>
              </View>
              <View style={sl.track}>
                {[0.5,1,2,5,10,20].map(v=>(
                  <TouchableOpacity
                    key={v}
                    style={[sl.step, radiusKm===v && sl.stepActive]}
                    onPress={()=>{
                      setRadiusKm(v);
                      if (currentLoc) loadNearbyPois(currentLoc.lat, currentLoc.lng, v*1000);
                    }}
                  >
                    <Text style={[sl.stepTxt, radiusKm===v && sl.stepTxtActive]}>
                      {v<1?`${v*1000}m`:v+'k'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={sl.scaleRow}>
                <Text style={sl.scaleTxt}>Yakın</Text>
                <Text style={sl.scaleTxt}>Uzak</Text>
              </View>
            </View>
            {!recording&&(
              <View style={sl.hint}>
                <Ionicons name="information-circle-outline" size={13} color="#555"/>
                <Text style={sl.hintTxt}>Kayıt başlayınca seçilen yarıçaptaki mekanlar haritada belirir</Text>
              </View>
            )}
          </View>
        )}

        {/* Çiz modu — şehir seçici + arama butonu */}
        {mode==='draw'&&waypoints.length===0&&(
          <View style={{gap:8, marginBottom:12}}>
            <TouchableOpacity style={s.cityBtn} onPress={()=>setShowCityPicker(true)}>
              <Ionicons name="location-outline" size={15} color={selectedCity?'#22C55E':'#888'}/>
              <Text style={[s.cityBtnTxt,selectedCity&&{color:'#22C55E'}]}>
                {selectedCity?`📍 ${selectedCity.name}`:'Şehir / İlçe Seç'}
              </Text>
              <Ionicons name="chevron-down" size={14} color={selectedCity?'#22C55E':'#555'}/>
            </TouchableOpacity>
            <TouchableOpacity style={s.searchBtn} onPress={()=>setShowSearch(true)}>
              <Ionicons name="search-outline" size={15} color="#22C55E"/>
              <Text style={s.searchBtnTxt}>Kafe, müze, restoran ara…</Text>
              <Ionicons name="arrow-forward" size={14} color="#22C55E"/>
            </TouchableOpacity>
          </View>
        )}

        {/* Özet */}
        {waypoints.length>=2&&(
          <View style={s.summary}>
            <View style={s.sumItem}><Ionicons name="navigate-outline" size={13} color="#22C55E"/><Text style={s.sumVal}>{fmtDist(totalDist)}</Text></View>
            <View style={s.sumDiv}/>
            <View style={s.sumItem}><Ionicons name="pin-outline" size={13} color="#22C55E"/><Text style={s.sumVal}>{waypoints.length} durak</Text></View>
            {waypoints.some(w=>w.pending)&&<><View style={s.sumDiv}/><View style={s.sumItem}><Ionicons name="time-outline" size={13} color="#f59e0b"/><Text style={[s.sumVal,{color:'#f59e0b'}]}>{waypoints.filter(w=>w.pending).length} onaysız</Text></View></>}
          </View>
        )}

        {/* Başlık */}
        <TextInput style={s.titleIn} placeholder="Rotana bir isim ver…" placeholderTextColor="#333" value={title} onChangeText={setTitle} maxLength={80}/>

        {/* Waypoint listesi */}
        {waypoints.length>0?(
          <View>
            <View style={s.listHeader}>
              <Text style={s.listTitle}>DURAKLAR</Text>
              <TouchableOpacity style={s.addMoreBtn} onPress={()=>setShowSearch(true)}>
                <Ionicons name="add" size={16} color="#22C55E"/>
                <Text style={s.addMoreTxt}>Ekle</Text>
              </TouchableOpacity>
            </View>
            {waypoints.map((wp,i)=>(
              <WRow key={`${wp.timestamp}-${i}`} item={wp} index={i} total={waypoints.length}
                onUp={moveUp} onDown={moveDown} onDelete={deleteWP}
                onEdit={(idx)=>{setEditIdx(idx);setShowEdit(true);}} onFocus={focusWP}/>
            ))}
          </View>
        ):(
          <View style={s.empty}>
            <Text style={s.emptyIcon}>{mode==='draw'?'👆':mode==='live'?'📡':'🤖'}</Text>
            <Text style={s.emptyTxt}>
              {mode==='draw'?(drawMode?'Haritaya dokunarak durak ekle':'"+" ile çizmeye başla veya yer ara')
               :mode==='live'?(recording?'📍 butonuyla durak ekle':'Kayıt başlat, gezerken durak ekle')
               :'Yukarıya rotanı tarif et'}
            </Text>
          </View>
        )}

        {/* Ayarlar paneli */}
        {showSettings&&(
          <View style={s.settings}>
            <Text style={s.setLabel}>ULAŞIM</Text>
            <View style={s.chips}>
              {TRANSPORT_MODES.map(m=>(
                <TouchableOpacity key={m.key} style={[s.chip,transport===m.key&&{borderColor:m.color,backgroundColor:`${m.color}18`}]} onPress={()=>setTransport(m.key)}>
                  <Ionicons name={m.icon} size={13} color={transport===m.key?m.color:'#666'}/>
                  <Text style={[s.chipTxt,transport===m.key&&{color:m.color}]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.setLabel}>KİMLER GÖREBİLİR</Text>
            <View style={s.chips}>
              {VISIBILITY_OPTS.map(v=>(
                <TouchableOpacity key={v.key} style={[s.chip,visibility===v.key&&{borderColor:'#22C55E',backgroundColor:'#0A2A1A'}]} onPress={()=>setVis(v.key)}>
                  <Ionicons name={v.icon} size={13} color={visibility===v.key?'#22C55E':'#666'}/>
                  <Text style={[s.chipTxt,visibility===v.key&&{color:'#22C55E'}]}>{v.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.setLabel}>NE PAYLAŞILSIN</Text>
            <View style={s.chips}>
              {SHARE_TYPES.map(st=>(
                <TouchableOpacity key={st.key} style={[s.chip,shareType===st.key&&{borderColor:'#22C55E',backgroundColor:'#0A2A1A'}]} onPress={()=>setShareType(st.key)}>
                  <Ionicons name={st.icon} size={13} color={shareType===st.key?'#22C55E':'#666'}/>
                  <Text style={[s.chipTxt,shareType===st.key&&{color:'#22C55E'}]}>{st.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.setLabel}>AÇIKLAMA</Text>
            <TextInput style={s.descIn} placeholder="Rota hakkında kısa bilgi…" placeholderTextColor="#333" value={desc} onChangeText={setDesc} multiline maxLength={300}/>
          </View>
        )}
      </ScrollView>

      {/* ── POI Popup ── */}
      {selPoi && (
        <View style={mpoi.popup}>
          <View style={{flex:1}}>
            <Text style={mpoi.popupName} numberOfLines={1}>{selPoi.name}</Text>
            <Text style={mpoi.popupCat}>{selPoi.category}{selPoi.rating>0?` · ⭐ ${selPoi.rating.toFixed(1)}`:''}</Text>
          </View>
          <TouchableOpacity style={mpoi.addBtn} onPress={()=>{ handlePOISelect(selPoi); setSelPoi(null); }}>
            <Ionicons name="add" size={16} color="#fff"/>
            <Text style={mpoi.addBtnTxt}>Ekle</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={()=>setSelPoi(null)} style={{padding:4}}>
            <Ionicons name="close" size={18} color="#666"/>
          </TouchableOpacity>
        </View>
      )}

      {/* ── ALT BUTONLAR ── */}
      <View style={[s.footer,{paddingBottom:insets.bottom+10}]}>
        <TouchableOpacity style={s.draftBtn} onPress={()=>handleSave(false)} disabled={saving}>
          <Ionicons name="save-outline" size={15} color="#888"/>
          <Text style={s.draftTxt}>Taslak</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.publishBtn,saving&&{opacity:0.6}]} onPress={()=>handleSave(true)} disabled={saving}>
          {saving?<ActivityIndicator color="#fff" size="small"/>:<>
            <Ionicons name="map" size={17} color="#fff"/>
            <Text style={s.publishTxt}>Paylaş</Text>
          </>}
        </TouchableOpacity>
      </View>

      {/* ── MODALLER ── */}
      <CityPicker
        visible={showCityPicker}
        onSelect={handleCitySelect}
        onClose={()=>setShowCityPicker(false)}
      />
      <POISearchModal
        visible={showSearch}
        userLoc={selectedCity || currentLoc}
        onSelect={handlePOISelect}
        onCreateNew={(name)=>{setNewPOIName(name);setShowSearch(false);setShowNewPOI(true);}}
        onClose={()=>setShowSearch(false)}
      />
      <NewPOIModal
        visible={showNewPOI}
        initName={newPOIName}
        userLoc={currentLoc}
        onCreated={handleNewPOICreated}
        onClose={()=>setShowNewPOI(false)}
      />
      <EditWPModal
        visible={showEdit}
        wp={editIdx!==null?waypoints[editIdx]:null}
        index={editIdx}
        onSave={editWP}
        onClose={()=>{setShowEdit(false);setEditIdx(null);}}
      />
    </View>
  );
}

// ── Stiller ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex:1, backgroundColor:'#0A0A0A' },
  topGrad:      { position:'absolute', top:0, left:0, right:0, height:130 },
  botGrad:      { position:'absolute', bottom:0, left:0, right:0, height:70 },
  header:       { position:'absolute', top:0, left:0, right:0, flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingBottom:10, gap:10, zIndex:10 },
  iconBtn:      { width:38, height:38, backgroundColor:'rgba(0,0,0,0.55)', borderRadius:19, alignItems:'center', justifyContent:'center', borderWidth:0.5, borderColor:'rgba(255,255,255,0.08)' },
  modeTabs:     { flex:1, flexDirection:'row', backgroundColor:'rgba(10,10,10,0.85)', borderRadius:14, padding:3, gap:2, borderWidth:0.5, borderColor:'rgba(255,255,255,0.07)' },
  modeTab:      { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:4, paddingVertical:8, borderRadius:11 },
  modeTabOn:    { backgroundColor:'rgba(34,197,94,0.15)' },
  modeTabTxt:   { color:'#888', fontSize:11, fontWeight:'600' },
  liveHud:      { position:'absolute', top:88, alignSelf:'center', flexDirection:'row', alignItems:'center', gap:10, backgroundColor:'rgba(0,0,0,0.75)', borderRadius:20, paddingHorizontal:16, paddingVertical:8, borderWidth:0.5, borderColor:'#22C55E' },
  recDot:       { width:8, height:8, borderRadius:4, backgroundColor:'#ef4444' },
  liveVal:      { color:'#fff', fontSize:13, fontWeight:'700' },
  hudDiv:       { width:0.5, height:14, backgroundColor:'#333' },
  drawHint:     { position:'absolute', top:98, alignSelf:'center', flexDirection:'row', alignItems:'center', gap:5, backgroundColor:'rgba(0,0,0,0.75)', borderRadius:16, paddingHorizontal:14, paddingVertical:7, borderWidth:0.5, borderColor:'#22C55E' },
  drawHintTxt:  { color:'#22C55E', fontSize:12, fontWeight:'600' },
  counter:      { position:'absolute', bottom:14, left:14, backgroundColor:'rgba(0,0,0,0.7)', borderRadius:13, paddingHorizontal:11, paddingVertical:6, alignItems:'center', borderWidth:0.5, borderColor:'#22C55E' },
  counterN:     { color:'#22C55E', fontSize:17, fontWeight:'800' },
  counterS:     { color:'#22C55E', fontSize:9, fontWeight:'600' },
  pendingCount: { backgroundColor:'#2A1A00', borderRadius:8, paddingHorizontal:5, paddingVertical:2, marginTop:2 },
  pendingCountTxt:{ color:'#f59e0b', fontSize:9 },
  mapBtns:      { position:'absolute', right:14, bottom:14, gap:8 },
  mapBtn:       { width:46, height:46, borderRadius:23, backgroundColor:'rgba(10,10,10,0.9)', alignItems:'center', justifyContent:'center', borderWidth:0.5, borderColor:'#333', elevation:5 },
  panel:        { flex:1, paddingHorizontal:16, paddingTop:12 },
  aiBar:        { flexDirection:'row', gap:8, marginBottom:8 },
  aiInput:      { flex:1, flexDirection:'row', alignItems:'center', gap:7, backgroundColor:'#111', borderRadius:13, paddingHorizontal:12, paddingVertical:10, borderWidth:0.5, borderColor:'#1C1C1C' },
  aiTextIn:     { flex:1, color:'#fff', fontSize:13 },
  aiSend:       { width:42, height:42, backgroundColor:'#22C55E', borderRadius:13, alignItems:'center', justifyContent:'center' },
  aiLoad:       { flexDirection:'row', alignItems:'center', gap:10, backgroundColor:'#0A1F0A', borderRadius:11, padding:11, marginBottom:10 },
  aiLoadTxt:    { color:'#22C55E', fontSize:13 },
  promptChip:   { backgroundColor:'#111', borderRadius:18, paddingHorizontal:13, paddingVertical:7, marginRight:8, borderWidth:0.5, borderColor:'#1C1C1C' },
  promptTxt:    { color:'#888', fontSize:12 },
  cityBtn:      { flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'#111', borderRadius:14, padding:12, borderWidth:0.5, borderColor:'#1C1C1C' },
  cityBtnTxt:   { flex:1, color:'#888', fontSize:13, fontWeight:'500' },
  searchBtn:    { flexDirection:'row', alignItems:'center', gap:10, backgroundColor:'#0A2A1A', borderRadius:14, padding:13, marginBottom:12, borderWidth:0.5, borderColor:'#22C55E' },
  searchBtnTxt: { flex:1, color:'#22C55E', fontSize:13, fontWeight:'500' },
  summary:      { flexDirection:'row', alignItems:'center', backgroundColor:'#111', borderRadius:11, paddingVertical:9, paddingHorizontal:13, marginBottom:10, borderWidth:0.5, borderColor:'#1C1C1C', gap:12 },
  sumItem:      { flexDirection:'row', alignItems:'center', gap:4 },
  sumVal:       { color:'#ccc', fontSize:12, fontWeight:'600' },
  sumDiv:       { width:0.5, height:14, backgroundColor:'#2A2A2A' },
  titleIn:      { color:'#fff', fontSize:16, fontWeight:'600', borderBottomWidth:0.5, borderBottomColor:'#1C1C1C', paddingBottom:10, marginBottom:10 },
  listHeader:   { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:8 },
  listTitle:    { color:'#555', fontSize:10, fontWeight:'700', letterSpacing:1 },
  addMoreBtn:   { flexDirection:'row', alignItems:'center', gap:4 },
  addMoreTxt:   { color:'#22C55E', fontSize:12, fontWeight:'600' },
  empty:        { alignItems:'center', paddingVertical:20, gap:8 },
  emptyIcon:    { fontSize:30 },
  emptyTxt:     { color:'#444', fontSize:13, textAlign:'center', lineHeight:20, maxWidth:240 },
  settings:     { backgroundColor:'#0F0F0F', borderRadius:15, padding:14, marginTop:8, borderWidth:0.5, borderColor:'#1C1C1C', gap:10 },
  setLabel:     { color:'#444', fontSize:10, fontWeight:'700', letterSpacing:1 },
  chips:        { flexDirection:'row', flexWrap:'wrap', gap:7 },
  chip:         { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:'#111', borderRadius:18, paddingHorizontal:12, paddingVertical:7, borderWidth:0.5, borderColor:'#2A2A2A' },
  chipTxt:      { color:'#666', fontSize:12 },
  descIn:       { backgroundColor:'#111', color:'#ccc', borderRadius:11, paddingHorizontal:12, paddingVertical:10, fontSize:13, borderWidth:0.5, borderColor:'#1C1C1C', minHeight:70, textAlignVertical:'top' },
  footer:       { flexDirection:'row', gap:10, paddingHorizontal:16, paddingTop:10, borderTopWidth:0.5, borderTopColor:'#1C1C1C', backgroundColor:'#0A0A0A' },
  draftBtn:     { flexDirection:'row', alignItems:'center', gap:6, paddingHorizontal:18, paddingVertical:14, backgroundColor:'#111', borderRadius:15, borderWidth:0.5, borderColor:'#1C1C1C' },
  draftTxt:     { color:'#888', fontSize:14 },
  publishBtn:   { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:'#22C55E', borderRadius:15, paddingVertical:14 },
  publishTxt:   { color:'#fff', fontWeight:'700', fontSize:15 },
});

// Modal stilleri (paylaşılan)
const sm = StyleSheet.create({
  overlay:     { flex:1, backgroundColor:'rgba(0,0,0,0.55)' },
  sheet:       { backgroundColor:'#111', borderTopLeftRadius:22, borderTopRightRadius:22, maxHeight:'82%', paddingBottom:Platform.OS==='ios'?30:16 },
  handle:      { width:36, height:4, backgroundColor:'#2A2A2A', borderRadius:2, alignSelf:'center', marginTop:10, marginBottom:4 },
  title:       { color:'#fff', fontSize:15, fontWeight:'700', textAlign:'center', paddingVertical:12 },
  searchBar:   { flexDirection:'row', alignItems:'center', gap:8, marginHorizontal:16, marginBottom:10, backgroundColor:'#1A1A1A', borderRadius:12, paddingHorizontal:12, paddingVertical:10, borderWidth:0.5, borderColor:'#2A2A2A' },
  searchInput: { flex:1, color:'#fff', fontSize:14 },
  catScroll:   { paddingHorizontal:16, marginBottom:8 },
  cat:         { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:'#1A1A1A', borderRadius:18, paddingHorizontal:12, paddingVertical:7, marginRight:8, borderWidth:0.5, borderColor:'#2A2A2A' },
  catActive:   { backgroundColor:'#0A2A1A', borderColor:'#22C55E' },
  catTxt:      { color:'#888', fontSize:12 },
  catTxtActive:{ color:'#22C55E', fontWeight:'600' },
  list:        { maxHeight:340 },
  result:      { flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal:16, paddingVertical:12, borderBottomWidth:0.5, borderBottomColor:'#1A1A1A' },
  resIcon:     { width:34, height:34, borderRadius:17, alignItems:'center', justifyContent:'center' },
  resName:     { color:'#fff', fontSize:14, fontWeight:'600' },
  resAddr:     { color:'#666', fontSize:11, marginTop:2 },
  dbBadge:     { backgroundColor:'#0A2A1A', borderRadius:6, paddingHorizontal:5, paddingVertical:2 },
  dbBadgeTxt:  { color:'#22C55E', fontSize:9, fontWeight:'700' },
  createRow:   { flexDirection:'row', alignItems:'center', gap:10, padding:16, backgroundColor:'#0A2A1A', margin:16, borderRadius:12 },
  createTxt:   { color:'#22C55E', fontSize:13, fontWeight:'600', flex:1 },
});

// DB POI marker stilleri
const mpoi = StyleSheet.create({
  dot:       { width:30, height:30, borderRadius:15, backgroundColor:'rgba(10,10,10,0.85)', alignItems:'center', justifyContent:'center', borderWidth:1.5, borderColor:'#22C55E', elevation:4 },
  dotAdded:  { borderColor:'#3B82F6', opacity:0.6 },
  popup:     { position:'absolute', bottom:90, left:16, right:16, flexDirection:'row', alignItems:'center', gap:10, backgroundColor:'#111', borderRadius:16, padding:14, borderWidth:0.5, borderColor:'#22C55E', elevation:8 },
  popupName: { color:'#fff', fontSize:14, fontWeight:'700' },
  popupCat:  { color:'#888', fontSize:11, marginTop:2 },
  addBtn:    { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:'#22C55E', borderRadius:12, paddingHorizontal:12, paddingVertical:8 },
  addBtnTxt: { color:'#fff', fontWeight:'700', fontSize:13 },
});

// AI yanıt + nav panel stilleri
const air = StyleSheet.create({
  box:      { flexDirection:'row', alignItems:'flex-start', gap:8, backgroundColor:'#0A1F0A', borderRadius:12, padding:11, marginBottom:8, borderWidth:0.5, borderColor:'#22C55E' },
  txt:      { flex:1, color:'#22C55E', fontSize:12, lineHeight:18 },
  navBox:   { backgroundColor:'#0A0F1A', borderRadius:14, padding:12, marginBottom:10, borderWidth:0.5, borderColor:'#3B82F6' },
  navHeader:{ flexDirection:'row', alignItems:'flex-start', marginBottom:8 },
  navTitle: { color:'#fff', fontSize:13, fontWeight:'700' },
  navSub:   { color:'#3B82F6', fontSize:11, marginTop:2 },
  navStep:  { flexDirection:'row', alignItems:'center', gap:8, paddingVertical:4, borderBottomWidth:0.5, borderBottomColor:'#1A1A2A' },
  navIcon:  { fontSize:14, width:20 },
  navTxt:   { flex:1, color:'#ccc', fontSize:12 },
  navDist:  { color:'#555', fontSize:11 },
});

// Radius slider stilleri
const sl = StyleSheet.create({
  wrap:        { backgroundColor:'#111', borderRadius:13, padding:12, marginBottom:8, borderWidth:0.5, borderColor:'#1C1C1C' },
  labelRow:    { flexDirection:'row', alignItems:'center', gap:6, marginBottom:10 },
  label:       { flex:1, color:'#888', fontSize:12 },
  val:         { color:'#22C55E', fontSize:13, fontWeight:'700' },
  track:       { flexDirection:'row', justifyContent:'space-between', gap:4 },
  step:        { flex:1, alignItems:'center', paddingVertical:8, borderRadius:10, backgroundColor:'#1A1A1A', borderWidth:0.5, borderColor:'#2A2A2A' },
  stepActive:  { backgroundColor:'#0A2A1A', borderColor:'#22C55E' },
  stepTxt:     { color:'#555', fontSize:12, fontWeight:'600' },
  stepTxtActive:{ color:'#22C55E', fontWeight:'700' },
  scaleRow:    { flexDirection:'row', justifyContent:'space-between', marginTop:5 },
  scaleTxt:    { color:'#333', fontSize:10 },
  hint:        { flexDirection:'row', alignItems:'center', gap:6, marginTop:6 },
  hintTxt:     { color:'#555', fontSize:11, flex:1 },
});