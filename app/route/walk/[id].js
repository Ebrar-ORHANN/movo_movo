// ── app/route/walk/[id].js ────────────────────────────────────────────────────
// Kayıtlı rota navigasyonu — OSRM ile adım adım yol tarifi
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Dimensions, Animated, Alert, Platform,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import * as ImagePicker from 'expo-image-picker';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import app, { auth } from '../../../src/firebase/config';
import { api } from '../../../services/api';

const storage = getStorage(app);

const { width, height } = Dimensions.get('window');
const OSRM  = 'https://router.project-osrm.org/route/v1';
const ARRIVE_DIST = 30; // metre — varış sayılma mesafesi

// ── Yardımcılar ──────────────────────────────────────────────────────────────
const haversineM = (lat1, lng1, lat2, lng2) => {
  const R = 6371000, r = Math.PI / 180;
  const dl = (lat2-lat1)*r, dg = (lng2-lng1)*r;
  const a  = Math.sin(dl/2)**2 + Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(dg/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

const fmtDist = (m) => m >= 1000 ? `${(m/1000).toFixed(1)} km` : `${Math.round(m)} m`;
const fmtTime = (s) => { const m=Math.round(s/60); return m<60?`${m} dk`:`${Math.floor(m/60)} sa ${m%60} dk`; };

// OSRM yön ikonu
const TURN_ICON = {
  'turn left':        'arrow-back',
  'turn right':       'arrow-forward',
  'turn sharp left':  'return-down-back',
  'turn sharp right': 'return-down-forward',
  'turn slight left': 'arrow-back',
  'turn slight right':'arrow-forward',
  'straight':         'arrow-up',
  'roundabout':       'refresh',
  'arrive':           'location',
  'depart':           'walk',
};

const turnIcon = (modifier, type) => {
  const key = type === 'arrive' ? 'arrive' : type === 'depart' ? 'depart' : `${type} ${modifier || ''}`.trim();
  return TURN_ICON[key] || 'arrow-up';
};

// OSRM'dan yol tarifi çek — userLoc verilirse oradan başlar
async function fetchOSRM(stops, mode = 'walking', userLoc = null) {
  const profile = { walking: 'foot', cycling: 'bike', driving: 'car' }[mode] || 'foot';

  // Başlangıç noktası: kullanıcı konumu varsa önce ekle
  const allPoints = userLoc
    ? [{ lat: userLoc.lat, lng: userLoc.lng }, ...stops]
    : stops;

  if (allPoints.length < 2) throw new Error('En az 2 nokta gerekli');

  const coords = allPoints.map(s => `${s.lng},${s.lat}`).join(';');
  const url    = `${OSRM}/${profile}/${coords}?steps=true&geometries=geojson&overview=full&annotations=false`;
  const res    = await fetch(url);
  const data   = await res.json();
  if (data.code !== 'Ok') throw new Error('OSRM rotası alınamadı');

  const route = data.routes[0];
  const steps = [];
  route.legs.forEach((leg, legIdx) => {
    leg.steps.forEach((step, stepIdx) => {
      const man = step.maneuver;
      steps.push({
        id:          `${legIdx}_${stepIdx}`,
        instruction: step.name
          ? `${_maneuverText(man.type, man.modifier)} — ${step.name}`
          : _maneuverText(man.type, man.modifier),
        distance_m:  Math.round(step.distance),
        duration_s:  Math.round(step.duration),
        icon:        turnIcon(man.modifier, man.type),
        lat:         man.location[1],
        lng:         man.location[0],
        type:        man.type,
        modifier:    man.modifier,
        leg:         legIdx,
      });
    });
  });

  const polyline = route.geometry.coordinates.map(c => ({ latitude: c[1], longitude: c[0] }));
  return { steps, polyline, distance_m: route.distance, duration_s: route.duration };
}

function _maneuverText(type, modifier) {
  const mod = modifier || '';
  const map = {
    depart:     'Başlayın',
    arrive:     'Varış noktanız',
    turn:       { left:'Sola dönün', right:'Sağa dönün', 'sharp left':'Keskin sola dönün',
                  'sharp right':'Keskin sağa dönün', 'slight left':'Hafif sola dönün',
                  'slight right':'Hafif sağa dönün', straight:'Düz devam edin' },
    'new name': 'Yola devam edin',
    roundabout: 'Dönel kavşakta devam edin',
    'rotary':   'Dönel kavşakta devam edin',
    fork:       { left:'Sol koldan devam edin', right:'Sağ koldan devam edin' },
    merge:      'Birleşin',
    'end of road': { left:'Sona gelince sola', right:'Sona gelince sağa' },
  };
  const entry = map[type];
  if (!entry) return 'Devam edin';
  if (typeof entry === 'string') return entry;
  return entry[mod] || entry['straight'] || 'Devam edin';
}

// ── Ana Ekran ─────────────────────────────────────────────────────────────────
export default function RouteWalkScreen() {
  const { id }  = useLocalSearchParams();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const mapRef  = useRef(null);

  const [route,   setRoute]   = useState(null);
  const [stops,   setStops]   = useState([]);
  const [nav,     setNav]     = useState(null);   // { steps, polyline, distance_m, duration_s }
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [stopIdx, setStopIdx] = useState(0);      // hangi durağa gidiyoruz
  const [userPos, setUserPos] = useState(null);
  const [distToNext, setDistToNext] = useState(null);
  const [eta,       setEta]     = useState(null);
  const [arrived,   setArrived] = useState(false);
  const [currentLoc, setCurrentLoc] = useState(null);
  const [muted,     setMuted]   = useState(false);
  const [photos,    setPhotos]  = useState([]); // { uri, stopName, lat, lng, uploading }
  const [showPhotoPanel, setShowPhotoPanel] = useState(false);
  const [showStops, setShowStops] = useState(false);
  const locWatcher = useRef(null);
  const slideAnim  = useRef(new Animated.Value(0)).current;

  // ── Rota yükle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const data = await api.get(`/routes/${id}`);
        setRoute(data);
        const s = (data.stops || []).sort((a,b) => a.seq - b.seq);
        setStops(s);
        if (s.length >= 2) {
          const navData = await fetchOSRM(s, data.transport_mode || 'walking');
          setNav(navData);
        }
      } catch(e) { Alert.alert('Hata', e.message); }
      finally { setLoading(false); }
    })();
    return () => { locWatcher.current?.remove(); Speech.stop(); };
  }, [id]);

  // Haritayı rotaya sığdır
  useEffect(() => {
    if (nav?.polyline?.length > 1) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(nav.polyline, {
          edgePadding: { top:100, right:40, bottom:220, left:40 }, animated:true,
        });
      }, 600);
    }
  }, [nav]);

  // ── Fotoğraf ekle ──────────────────────────────────────────────────────────
  const addPhoto = async (source) => {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') { Alert.alert('İzin gerekli'); return; }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.85, mediaTypes: ImagePicker.MediaTypeOptions.Images })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.85, mediaTypes: ImagePicker.MediaTypeOptions.Images });

    if (result.canceled || !result.assets?.[0]) return;

    const uri      = result.assets[0].uri;
    const stopName = stops[stopIdx]?.name || `Durak ${stopIdx + 1}`;
    const photoId  = Date.now();

    // Önce local göster
    setPhotos(prev => [...prev, { id: photoId, uri, stopName, lat: currentLoc?.lat, lng: currentLoc?.lng, uploading: true }]);
    setShowPhotoPanel(true);

    // Firebase'e yükle
    try {
      const ext      = uri.split('.').pop() || 'jpg';
      const path     = `route_photos/${route?.id || 'tmp'}/${photoId}.${ext}`;
      const blob     = await (await fetch(uri)).blob();
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, blob);
      const downloadUrl = await getDownloadURL(storageRef);

      // Post oluştur ve fotoğrafı ekle
      const post = await api.post('/social/posts', {
        user_note:    `${stopName} — ${route?.title || 'Rota'}`,
        lat:          currentLoc?.lat,
        lng:          currentLoc?.lng,
        route_id:     route?.id,
        visibility:   'private', // kullanıcı sonra paylaşabilir
      });

      await api.post(`/social/posts/${post.post_id}/attachments`, null, {
        params: {
          storage_path: path,
          media_type:   'image',
        }
      });

      setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, uploading: false, uploaded: true, postId: post.post_id } : p));
    } catch(e) {
      setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, uploading: false, error: true } : p));
    }
  };

  const removePhoto = (id) => setPhotos(prev => prev.filter(p => p.id !== id));
  const startNav = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Konum izni gerekli'); return; }

    // Anlık konum al
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude,
                  latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    setUserPos({ latitude: loc.lat, longitude: loc.lng });
    setCurrentLoc(loc);

    // Kullanıcı konumundan başlayarak OSRM yeniden hesapla
    if (stops.length >= 1) {
      try {
        const navData = await fetchOSRM(stops, route?.transport_mode || 'walking', loc);
        setNav(navData);
        // Haritayı rotaya sığdır
        mapRef.current?.fitToCoordinates(navData.polyline, {
          edgePadding: { top:100, right:40, bottom:220, left:40 }, animated:true,
        });
      } catch { /* mevcut nav ile devam et */ }
    }

    setStarted(true); setStepIdx(0); setStopIdx(0); setArrived(false);
    speak('Navigasyon başladı. ' + (nav?.steps?.[0]?.instruction || ''));

    locWatcher.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 5 },
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserPos({ latitude: lat, longitude: lng });
        setCurrentLoc({ lat, lng });
        mapRef.current?.animateCamera({ center: { latitude: lat, longitude: lng }, zoom: 17 }, { duration: 500 });
        updateProgress(lat, lng);
      }
    );

    Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true }).start();
  };

  // ── İlerleme takibi ───────────────────────────────────────────────────────
  const updateProgress = useCallback((lat, lng) => {
    if (!nav) return;
    const steps   = nav.steps;
    const curStep = steps[stepIdx];
    if (!curStep) return;

    // Mevcut adıma mesafe
    const dist = haversineM(lat, lng, curStep.lat, curStep.lng);
    setDistToNext(dist);

    // Kalan süre tahmini (kaba)
    const remaining = steps.slice(stepIdx).reduce((sum,s) => sum + s.duration_s, 0);
    setEta(remaining);

    // Sonraki adıma geç
    if (dist < ARRIVE_DIST && stepIdx < steps.length - 1) {
      const next = stepIdx + 1;
      setStepIdx(next);
      speak(steps[next]?.instruction || '');
    }

    // Durağa varış kontrolü
    if (stopIdx < stops.length) {
      const stop   = stops[stopIdx];
      const sDist  = haversineM(lat, lng, stop.lat, stop.lng);
      if (sDist < ARRIVE_DIST * 2) {
        if (stopIdx === stops.length - 1) {
          setArrived(true);
          speak('Varış noktanıza ulaştınız. Tebrikler!');
          locWatcher.current?.remove();
        } else {
          speak(`${stop.name || `${stopIdx+1}. durak`} yakınındasınız`);
          setStopIdx(i => i + 1);
        }
      }
    }
  }, [nav, stepIdx, stopIdx, stops]);

  const speak = (text) => {
    if (!muted && text) {
      Speech.stop();
      Speech.speak(text, { language: 'tr-TR', rate: 0.9 });
    }
  };

  const stopNav = () => {
    locWatcher.current?.remove();
    Speech.stop();
    setStarted(false);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
  };

  const goToStep = (i) => {
    setStepIdx(i);
    const step = nav.steps[i];
    if (step) {
      mapRef.current?.animateToRegion({ latitude: step.lat, longitude: step.lng, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 600);
    }
  };

  if (loading) return (
    <View style={s.center}><ActivityIndicator color="#22C55E" size="large"/><Text style={s.loadTxt}>Rota hesaplanıyor…</Text></View>
  );

  const curStep   = nav?.steps?.[stepIdx];
  const nextStep  = nav?.steps?.[stepIdx + 1];
  const progress  = nav?.steps?.length ? stepIdx / nav.steps.length : 0;

  return (
    <View style={s.container}>

      {/* ── HARİTA ── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapType="standard"
        showsUserLocation={started}
        followsUserLocation={started}
        showsCompass
        rotateEnabled={started}
      >
        
        {nav?.polyline && <Polyline coordinates={nav.polyline} strokeColor="#22C55E" strokeWidth={4} lineJoin="round"/>}
        {stops.map((stop, i) => (
          <Marker key={`s${i}`} coordinate={{ latitude: stop.lat, longitude: stop.lng }} tracksViewChanges={false}>
            <View style={[s.stopPin, i === stopIdx && started && s.stopPinActive, i < stopIdx && s.stopPinDone]}>
              {i < stopIdx ? <Ionicons name="checkmark" size={13} color="#fff"/> : <Text style={s.stopPinTxt}>{i+1}</Text>}
            </View>
          </Marker>
        ))}
      </MapView>

      {/* ── ÜSTTE GERİ + SESSIZ ── */}
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.iconBtn} onPress={() => { stopNav(); router.back(); }}>
          <Ionicons name="arrow-back" size={20} color="#fff"/>
        </TouchableOpacity>
        <View style={s.routeTitle}>
          <Text style={s.routeTitleTxt} numberOfLines={1}>{route?.title || 'Rota'}</Text>
          {nav && <Text style={s.routeInfo}>{fmtDist(nav.distance_m)} · {fmtTime(nav.duration_s)}</Text>}
        </View>
        {started && (
          <TouchableOpacity style={s.iconBtn} onPress={() => setMuted(m => !m)}>
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color="#fff"/>
          </TouchableOpacity>
        )}
      </View>

      {/* ── NAVIGASYON PANELI ── */}
      {started ? (
        <Animated.View style={[s.navPanel, { transform: [{ translateY: slideAnim.interpolate({ inputRange:[0,1], outputRange:[300,0] }) }] }]}>

          {arrived ? (
            /* Varış */
            <View style={s.arrivedBox}>
              <Text style={s.arrivedIcon}>🎉</Text>
              <Text style={s.arrivedTitle}>Hedefinize Ulaştınız!</Text>
              <Text style={s.arrivedSub}>{route?.title}</Text>
              {photos.length > 0 && (
                <TouchableOpacity style={s.sharePhotosBtn} onPress={async () => {
                  // Fotoğrafların visibility'sini public yap
                  try {
                    for (const p of photos.filter(ph => ph.postId)) {
                      await api.patch(`/social/posts/${p.postId}`, { visibility: 'public' });
                    }
                    Alert.alert('✅', `${photos.filter(p=>p.postId).length} fotoğraf paylaşıldı!`);
                  } catch(e) { Alert.alert('Hata', e.message); }
                }}>
                  <Ionicons name="share-social" size={16} color="#fff"/>
                  <Text style={s.sharePhotosBtnTxt}>{photos.length} Fotoğrafı Paylaş</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.finishBtn} onPress={() => { stopNav(); router.back(); }}>
                <Text style={s.finishBtnTxt}>Rotayı Tamamla</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Mevcut adım */}
              <View style={s.curStep}>
                <View style={[s.stepIconWrap, { backgroundColor: curStep?.type==='arrive'?'#22C55E':'#1A3A1A' }]}>
                  <Ionicons name={curStep?.icon || 'arrow-up'} size={28} color="#22C55E"/>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.stepInstruction}>{curStep?.instruction || 'Devam edin'}</Text>
                  <Text style={s.stepDist}>{distToNext ? fmtDist(distToNext) : (curStep ? fmtDist(curStep.distance_m) : '')}</Text>
                </View>
                {eta !== null && <Text style={s.eta}>{fmtTime(eta)}</Text>}
              </View>

              {/* Sonraki adım */}
              {nextStep && (
                <View style={s.nextStep}>
                  <Ionicons name={nextStep.icon || 'arrow-up'} size={14} color="#666"/>
                  <Text style={s.nextStepTxt}>Sonra: {nextStep.instruction}</Text>
                </View>
              )}

              {/* İlerleme çubuğu */}
              <View style={s.progressBar}>
                <View style={[s.progressFill, { width: `${Math.round(progress*100)}%` }]}/>
              </View>

              {/* Durak bilgisi */}
              {stops[stopIdx] && (
                <View style={s.stopInfo}>
                  <Ionicons name="location" size={13} color="#22C55E"/>
                  <Text style={s.stopInfoTxt}>Hedef: {stops[stopIdx].name || `${stopIdx+1}. durak`}</Text>
                  {stops[stopIdx].lat && userPos && (
                    <Text style={s.stopDist}>{fmtDist(haversineM(userPos.latitude, userPos.longitude, stops[stopIdx].lat, stops[stopIdx].lng))}</Text>
                  )}
                </View>
              )}

              {/* Durdur */}
              <TouchableOpacity style={s.stopBtn} onPress={stopNav}>
                <Ionicons name="stop-circle" size={16} color="#ef4444"/>
                <Text style={s.stopBtnTxt}>Navigasyonu Durdur</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>

      ) : (
        /* ── BAŞLAMADAN ÖNCE ── */
        <View style={[s.startPanel, { paddingBottom: insets.bottom + 10 }]}>

          {/* Durak listesi */}
          <TouchableOpacity style={s.stopsToggle} onPress={() => setShowStops(v => !v)}>
            <Text style={s.stopsToggleTxt}>{stops.length} Durak</Text>
            <Ionicons name={showStops ? 'chevron-down' : 'chevron-up'} size={16} color="#22C55E"/>
          </TouchableOpacity>

          {showStops && (
            <ScrollView style={s.stopsList} showsVerticalScrollIndicator={false}>
              {stops.map((stop, i) => (
                <View key={i} style={s.stopRow}>
                  <View style={s.stopNum}><Text style={s.stopNumTxt}>{i+1}</Text></View>
                  <View style={{ flex:1 }}>
                    <Text style={s.stopName}>{stop.name || `Durak ${i+1}`}</Text>
                    {stop.notes ? <Text style={s.stopNote} numberOfLines={1}>{stop.notes}</Text> : null}
                  </View>
                  {i < stops.length-1 && nav && (
                    <Text style={s.legDist}>{fmtDist(nav.steps.filter(s=>s.leg===i).reduce((a,s)=>a+s.distance_m,0))}</Text>
                  )}
                </View>
              ))}
            </ScrollView>
          )}

          {/* Özet */}
          {nav && (
            <View style={s.summary}>
              <View style={s.sumItem}><Ionicons name="navigate-outline" size={14} color="#22C55E"/><Text style={s.sumVal}>{fmtDist(nav.distance_m)}</Text></View>
              <View style={s.sumDiv}/>
              <View style={s.sumItem}><Ionicons name="time-outline" size={14} color="#22C55E"/><Text style={s.sumVal}>{fmtTime(nav.duration_s)}</Text></View>
              <View style={s.sumDiv}/>
              <View style={s.sumItem}><Ionicons name="pin-outline" size={14} color="#22C55E"/><Text style={s.sumVal}>{stops.length} durak</Text></View>
            </View>
          )}

          {/* Konumdan başlama notu */}
          <View style={s.fromLocNote}>
            <Ionicons name="location" size={14} color="#3B82F6"/>
            <Text style={s.fromLocTxt}>Navigasyon başlatılınca <Text style={{color:'#fff'}}>bulunduğun konumdan</Text> ilk durağa yol tarifi otomatik hesaplanır</Text>
          </View>

          <TouchableOpacity style={[s.startBtn, !nav && s.startBtnDis]} onPress={startNav} disabled={!nav}>
            <Ionicons name="navigate" size={20} color="#fff"/>
            <Text style={s.startBtnTxt}>Navigasyonu Başlat</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Adım listesi (navigasyon sırasında) */}
      {started && !arrived && (
        <TouchableOpacity style={s.stepsBtn} onPress={() => setShowStops(v => !v)}>
          <Ionicons name="list" size={18} color="#fff"/>
        </TouchableOpacity>
      )}

      {/* Fotoğraf butonu — navigasyon sırasında */}
      {started && !arrived && (
        <TouchableOpacity style={s.photoBtn} onPress={() => {
          Alert.alert('Fotoğraf Ekle', '', [
            { text: 'Kamera', onPress: () => addPhoto('camera') },
            { text: 'Galeri',  onPress: () => addPhoto('library') },
            { text: 'İptal', style: 'cancel' },
          ]);
        }}>
          <Ionicons name="camera" size={20} color="#fff"/>
          {photos.length > 0 && (
            <View style={s.photoBadge}><Text style={s.photoBadgeTxt}>{photos.length}</Text></View>
          )}
        </TouchableOpacity>
      )}

      {/* Fotoğraf panel */}
      {showPhotoPanel && photos.length > 0 && (
        <View style={ph.panel}>
          <View style={ph.panelHeader}>
            <Text style={ph.panelTitle}>📸 Rota Fotoğrafları ({photos.length})</Text>
            <TouchableOpacity onPress={() => setShowPhotoPanel(false)}>
              <Ionicons name="chevron-down" size={18} color="#666"/>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ph.scroll}>
            {photos.map(photo => (
              <View key={photo.id} style={ph.thumb}>
                <Image source={{ uri: photo.uri }} style={ph.img}/>
                {photo.uploading && (
                  <View style={ph.overlay}>
                    <ActivityIndicator color="#fff" size="small"/>
                  </View>
                )}
                {photo.uploaded && (
                  <View style={ph.uploadedBadge}>
                    <Ionicons name="checkmark" size={10} color="#fff"/>
                  </View>
                )}
                {photo.error && (
                  <View style={[ph.uploadedBadge, { backgroundColor:'#ef4444' }]}>
                    <Ionicons name="close" size={10} color="#fff"/>
                  </View>
                )}
                <Text style={ph.stopLabel} numberOfLines={1}>{photo.stopName}</Text>
                <TouchableOpacity style={ph.removeBtn} onPress={() => removePhoto(photo.id)}>
                  <Ionicons name="close-circle" size={16} color="#fff"/>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Kapalıysa mini gösterge */}
      {!showPhotoPanel && photos.length > 0 && started && (
        <TouchableOpacity style={ph.miniBar} onPress={() => setShowPhotoPanel(true)}>
          <Ionicons name="camera" size={13} color="#22C55E"/>
          <Text style={ph.miniTxt}>{photos.length} fotoğraf eklendi</Text>
          <Ionicons name="chevron-up" size={13} color="#666"/>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Stiller ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex:1, backgroundColor:'#0A0A0A' },
  center:       { flex:1, alignItems:'center', justifyContent:'center', backgroundColor:'#0A0A0A', gap:12 },
  loadTxt:      { color:'#666', fontSize:14 },
  topBar:       { position:'absolute', top:0, left:0, right:0, flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingBottom:10, gap:10, zIndex:10 },
  iconBtn:      { width:38, height:38, backgroundColor:'rgba(0,0,0,0.7)', borderRadius:19, alignItems:'center', justifyContent:'center', borderWidth:0.5, borderColor:'rgba(255,255,255,0.1)' },
  routeTitle:   { flex:1, backgroundColor:'rgba(0,0,0,0.6)', borderRadius:14, paddingHorizontal:12, paddingVertical:8 },
  routeTitleTxt:{ color:'#fff', fontSize:14, fontWeight:'700' },
  routeInfo:    { color:'#888', fontSize:11, marginTop:2 },

  // Durak pinleri
  stopPin:      { width:26, height:26, borderRadius:13, backgroundColor:'#1A3A1A', borderWidth:2, borderColor:'#22C55E', alignItems:'center', justifyContent:'center' },
  stopPinActive:{ backgroundColor:'#22C55E', borderColor:'#fff' },
  stopPinDone:  { backgroundColor:'#1A2A1A', borderColor:'#555' },
  stopPinTxt:   { color:'#22C55E', fontSize:11, fontWeight:'800' },

  // Başlamadan önce panel
  startPanel:   { position:'absolute', bottom:0, left:0, right:0, backgroundColor:'#111', borderTopLeftRadius:22, borderTopRightRadius:22, padding:16, borderTopWidth:0.5, borderTopColor:'#1C1C1C' },
  stopsToggle:  { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:8, marginBottom:4 },
  stopsToggleTxt:{ color:'#fff', fontSize:15, fontWeight:'700' },
  stopsList:    { maxHeight:200, marginBottom:10 },
  stopRow:      { flexDirection:'row', alignItems:'center', gap:10, paddingVertical:8, borderBottomWidth:0.5, borderBottomColor:'#1A1A1A' },
  stopNum:      { width:24, height:24, borderRadius:12, backgroundColor:'#1A3A1A', borderWidth:1.5, borderColor:'#22C55E', alignItems:'center', justifyContent:'center' },
  stopNumTxt:   { color:'#22C55E', fontSize:10, fontWeight:'800' },
  stopName:     { color:'#fff', fontSize:13, fontWeight:'600' },
  stopNote:     { color:'#666', fontSize:11, marginTop:2 },
  legDist:      { color:'#555', fontSize:11 },
  summary:      { flexDirection:'row', alignItems:'center', backgroundColor:'#0F0F0F', borderRadius:12, paddingVertical:10, paddingHorizontal:14, marginBottom:12, gap:12 },
  sumItem:      { flexDirection:'row', alignItems:'center', gap:5 },
  sumVal:       { color:'#ccc', fontSize:13, fontWeight:'600' },
  sumDiv:       { width:0.5, height:14, backgroundColor:'#2A2A2A' },
  startBtn:     { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:10, backgroundColor:'#22C55E', borderRadius:16, paddingVertical:15 },
  startBtnDis:  { opacity:0.4 },
  startBtnTxt:  { color:'#fff', fontWeight:'800', fontSize:16 },
  fromLocNote:  { flexDirection:'row', alignItems:'flex-start', gap:8, backgroundColor:'#0A0F1A', borderRadius:12, padding:10, marginBottom:10, borderWidth:0.5, borderColor:'#1A2A3A' },
  fromLocTxt:   { flex:1, color:'#555', fontSize:12, lineHeight:17 },

  // Navigasyon paneli
  navPanel:     { position:'absolute', bottom:0, left:0, right:0, backgroundColor:'#111', borderTopLeftRadius:22, borderTopRightRadius:22, padding:16, paddingBottom:30, borderTopWidth:0.5, borderTopColor:'#1C1C1C' },
  curStep:      { flexDirection:'row', alignItems:'center', gap:14, marginBottom:12 },
  stepIconWrap: { width:52, height:52, borderRadius:26, alignItems:'center', justifyContent:'center' },
  stepInstruction:{ color:'#fff', fontSize:16, fontWeight:'700', lineHeight:22 },
  stepDist:     { color:'#22C55E', fontSize:13, fontWeight:'600', marginTop:4 },
  eta:          { color:'#888', fontSize:13, fontWeight:'600' },
  nextStep:     { flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'#0F0F0F', borderRadius:10, padding:10, marginBottom:10 },
  nextStepTxt:  { color:'#666', fontSize:12, flex:1 },
  progressBar:  { height:3, backgroundColor:'#1C1C1C', borderRadius:2, marginBottom:10, overflow:'hidden' },
  progressFill: { height:'100%', backgroundColor:'#22C55E', borderRadius:2 },
  stopInfo:     { flexDirection:'row', alignItems:'center', gap:6, marginBottom:12 },
  stopInfoTxt:  { color:'#ccc', fontSize:13, flex:1 },
  stopDist:     { color:'#22C55E', fontSize:12, fontWeight:'600' },
  stopBtn:      { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, paddingVertical:12, backgroundColor:'#1A0A0A', borderRadius:14, borderWidth:0.5, borderColor:'#2A1A1A' },
  stopBtnTxt:   { color:'#ef4444', fontWeight:'600', fontSize:14 },
  stepsBtn:     { position:'absolute', right:16, bottom:220, width:44, height:44, borderRadius:22, backgroundColor:'rgba(0,0,0,0.8)', alignItems:'center', justifyContent:'center', borderWidth:0.5, borderColor:'#333' },

  // Fotoğraf
  photoBtn:      { position:'absolute', right:16, bottom:280, width:50, height:50, borderRadius:25, backgroundColor:'#22C55E', alignItems:'center', justifyContent:'center', elevation:6 },
  photoBadge:    { position:'absolute', top:-4, right:-4, width:18, height:18, borderRadius:9, backgroundColor:'#ef4444', alignItems:'center', justifyContent:'center', borderWidth:1.5, borderColor:'#0A0A0A' },
  photoBadgeTxt: { color:'#fff', fontSize:10, fontWeight:'800' },
  // Varış
  sharePhotosBtn:  { flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'#3B82F6', borderRadius:14, paddingHorizontal:20, paddingVertical:11, marginBottom:10 },
  sharePhotosBtnTxt:{ color:'#fff', fontWeight:'700', fontSize:14 },
  arrivedIcon:  { fontSize:44 },
  arrivedTitle: { color:'#fff', fontSize:22, fontWeight:'800' },
  arrivedSub:   { color:'#888', fontSize:14 },
  finishBtn:    { backgroundColor:'#22C55E', borderRadius:16, paddingHorizontal:32, paddingVertical:14, marginTop:8 },
  finishBtnTxt: { color:'#fff', fontWeight:'800', fontSize:16 },
});

// Fotoğraf panel stilleri
const ph = StyleSheet.create({
  panel:       { position:'absolute', bottom:90, left:0, right:0, backgroundColor:'#111', borderTopLeftRadius:18, borderTopRightRadius:18, paddingBottom:12, borderTopWidth:0.5, borderTopColor:'#1C1C1C' },
  panelHeader: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:14, paddingVertical:10 },
  panelTitle:  { color:'#fff', fontSize:13, fontWeight:'700' },
  scroll:      { paddingHorizontal:12, paddingBottom:6 },
  thumb:       { width:90, height:90, borderRadius:12, marginRight:8, position:'relative', overflow:'hidden' },
  img:         { width:'100%', height:'100%' },
  overlay:     { ...StyleSheet.absoluteFillObject, backgroundColor:'rgba(0,0,0,0.5)', alignItems:'center', justifyContent:'center' },
  uploadedBadge:{ position:'absolute', top:5, right:5, width:18, height:18, borderRadius:9, backgroundColor:'#22C55E', alignItems:'center', justifyContent:'center' },
  stopLabel:   { position:'absolute', bottom:0, left:0, right:0, backgroundColor:'rgba(0,0,0,0.6)', color:'#fff', fontSize:9, padding:3, textAlign:'center' },
  removeBtn:   { position:'absolute', top:3, left:3 },
  miniBar:     { position:'absolute', bottom:90, left:16, right:16, flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'rgba(10,10,10,0.9)', borderRadius:12, padding:10, borderWidth:0.5, borderColor:'#22C55E' },
  miniTxt:     { flex:1, color:'#22C55E', fontSize:12 },
});