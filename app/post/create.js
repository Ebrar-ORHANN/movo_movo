// ── app/post/create.js ───────────────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Image, ActivityIndicator, Alert, Keyboard,
  Dimensions, FlatList, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import app, { auth } from '../../src/firebase/config';
import { useAuth } from '../../context/AuthContext';
import { createPost } from '../../services/feedService';
import { getUserRoutes } from '../../services/routeService';
import { API_BASE } from '../../constants/api';

const storage = getStorage(app);
const { width } = Dimensions.get('window');

const VISIBILITY_OPTIONS = [
  { value: 'public',    icon: 'earth-outline',       label: 'Herkese açık' },
  { value: 'followers', icon: 'people-outline',      label: 'Takipçiler' },
  { value: 'private',   icon: 'lock-closed-outline', label: 'Gizli' },
];

// ── Rota seçim modalı ─────────────────────────────────────────────────────────
function RoutePickerModal({ visible, userId, onSelect, onClose }) {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (!visible || !userId) return;
    setLoading(true);
    getUserRoutes(userId)
      .then(data => setRoutes(Array.isArray(data) ? data : []))
      .catch(() => setRoutes([]))
      .finally(() => setLoading(false));
  }, [visible, userId]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} />
        <View style={s.routeSheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Rota Seç</Text>
          {loading
            ? <ActivityIndicator color="#22C55E" style={{ margin: 20 }} />
            : (
              <FlatList
                data={routes}
                keyExtractor={r => r.id}
                ListEmptyComponent={<Text style={s.emptyText}>Henüz rota yok</Text>}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={s.routeItem}
                    onPress={() => { onSelect(item); onClose(); }}
                  >
                    <View style={s.routeIcon}>
                      <Ionicons name="map-outline" size={20} color="#22C55E" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.routeTitle}>{item.title || 'İsimsiz Rota'}</Text>
                      <Text style={s.routeMeta}>
                        {item.distance_m ? `${(item.distance_m / 1000).toFixed(1)} km` : ''}
                        {item.category ? ` · ${item.category}` : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#444" />
                  </TouchableOpacity>
                )}
              />
            )
          }
        </View>
      </View>
    </Modal>
  );
}

// ── Ana ekran ─────────────────────────────────────────────────────────────────
export default function CreatePostScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { profile } = useAuth();

  const [note, setNote]             = useState('');
  const [media, setMedia]           = useState([]);
  const [visibility, setVisibility] = useState('public');
  const [showVis, setShowVis]       = useState(false);
  const [posting, setPosting]       = useState(false);
  const [uploadPct, setUploadPct]   = useState(0);
  const [location, setLocation]     = useState(null);
  const [locLoading, setLocLoading] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [showRoutePicker, setShowRoutePicker] = useState(false);

  const charLeft = 500 - note.length;

  // ── Konum al ──────────────────────────────────────────────────────────────
  const handleLocation = async () => {
    if (location) { setLocation(null); return; }
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('İzin Gerekli', 'Konum erişimine izin verin.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = pos.coords;
      const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }).catch(() => []);
      const g = geo[0];
      const label = [g?.district, g?.city, g?.country].filter(Boolean).join(', ')
        || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      setLocation({ lat, lng, label });
    } catch {
      Alert.alert('Hata', 'Konum alınamadı.');
    } finally {
      setLocLoading(false);
    }
  };

  // ── Medya seç ─────────────────────────────────────────────────────────────
  const pickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('İzin Gerekli', 'Galeri erişimine izin verin.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      selectionLimit: 10 - media.length,
      quality: 0.85,
    });
    if (!result.canceled) setMedia(prev => [...prev, ...result.assets].slice(0, 10));
  };

  const removeMedia = (idx) => setMedia(prev => prev.filter((_, i) => i !== idx));

  // ── Attachment yükle ──────────────────────────────────────────────────────
  const uploadAndAttach = async (asset, postId, idx, total) => {
    const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `posts/${profile?.id}/${Date.now()}_${idx}.${ext}`;
    const blob = await (await fetch(asset.uri)).blob();
    await uploadBytes(ref(storage, path), blob);
    const url = await getDownloadURL(ref(storage, path));
    setUploadPct(Math.round(((idx + 1) / total) * 100));

    const token = await auth.currentUser?.getIdToken();
    const mediaType = asset.type === 'video' ? 'video' : 'image';
    const params = new URLSearchParams({ storage_path: url, media_type: mediaType });
    await fetch(`${API_BASE}/social/posts/${postId}/attachments?${params}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  };

  // ── Paylaş ────────────────────────────────────────────────────────────────
  const handlePost = async () => {
    if (!note.trim() && !media.length) {
      Alert.alert('Boş gönderi', 'Bir şeyler yaz veya fotoğraf ekle.');
      return;
    }
    Keyboard.dismiss();
    setPosting(true);
    setUploadPct(0);
    try {
      const postData = await createPost({
        user_note:  note.trim() || null,
        visibility,
        ...(location ? { lat: location.lat, lng: location.lng } : {}),
        ...(selectedRoute ? { route_id: selectedRoute.id } : {}),
      });
      const postId = postData?.post_id;
      if (media.length && postId) {
        for (let i = 0; i < media.length; i++) {
          await uploadAndAttach(media[i], postId, i, media.length);
        }
      }
      Alert.alert('✅ Paylaşıldı!', 'Gönderiniz yayında.', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert('Hata', e.message || 'Gönderi paylaşılamadı.');
    } finally {
      setPosting(false);
      setUploadPct(0);
    }
  };

  const visOpt  = VISIBILITY_OPTIONS.find(v => v.value === visibility);
  const canPost = (note.trim().length > 0 || media.length > 0) && !posting;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} disabled={posting}>
          <Ionicons name="close" size={26} color={posting ? '#444' : '#fff'} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Yeni Gönderi</Text>
        <TouchableOpacity style={[s.postBtn, !canPost && s.postBtnDisabled]} onPress={handlePost} disabled={!canPost}>
          {posting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.postBtnText}>Paylaş</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
        {/* Compose */}
        <View style={s.compose}>
          {profile?.avatar_url
            ? <Image source={{ uri: profile.avatar_url }} style={s.avatar} />
            : <View style={[s.avatar, s.avatarFallback]}><Text style={s.avatarText}>{(profile?.display_name || '?').slice(0, 1).toUpperCase()}</Text></View>
          }
          <View style={s.textArea}>
            <Text style={s.username}>{profile?.display_name || profile?.username}</Text>
            <TextInput
              style={s.noteInput}
              placeholder="Ne keşfettin? Paylaş…"
              placeholderTextColor="#444"
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={500}
              autoFocus
            />
            {note.length > 400 && (
              <Text style={[s.charCount, charLeft < 20 && { color: '#ef4444' }]}>{charLeft}</Text>
            )}
          </View>
        </View>

        {/* Medya önizleme */}
        {media.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.mediaScroll}>
            {media.map((m, i) => (
              <View key={i} style={s.mediaThumbnail}>
                <Image source={{ uri: m.uri }} style={s.thumbImg} />
                {m.type === 'video' && (
                  <View style={s.videoTag}><Ionicons name="videocam" size={12} color="#fff" /></View>
                )}
                <TouchableOpacity style={s.thumbRemove} onPress={() => removeMedia(i)}>
                  <Ionicons name="close-circle" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Progress */}
        {posting && media.length > 0 && (
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${uploadPct}%` }]} />
          </View>
        )}

        {/* Konum etiketi */}
        {location && (
          <TouchableOpacity style={s.tagRow} onPress={() => setLocation(null)}>
            <Ionicons name="location" size={16} color="#22C55E" />
            <Text style={s.tagText} numberOfLines={1}>{location.label}</Text>
            <Ionicons name="close" size={14} color="#555" />
          </TouchableOpacity>
        )}

        {/* Rota etiketi */}
        {selectedRoute && (
          <TouchableOpacity style={s.tagRow} onPress={() => setSelectedRoute(null)}>
            <Ionicons name="map" size={16} color="#22C55E" />
            <Text style={s.tagText} numberOfLines={1}>{selectedRoute.title || 'Rota'}</Text>
            <Ionicons name="close" size={14} color="#555" />
          </TouchableOpacity>
        )}

        {/* Görünürlük */}
        <TouchableOpacity style={s.visRow} onPress={() => setShowVis(!showVis)}>
          <Ionicons name={visOpt.icon} size={18} color="#22C55E" />
          <Text style={s.visLabel}>{visOpt.label}</Text>
          <Ionicons name={showVis ? 'chevron-up' : 'chevron-down'} size={16} color="#555" />
        </TouchableOpacity>
        {showVis && (
          <View style={s.visOptions}>
            {VISIBILITY_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[s.visOption, visibility === opt.value && s.visOptionActive]}
                onPress={() => { setVisibility(opt.value); setShowVis(false); }}
              >
                <Ionicons name={opt.icon} size={18} color={visibility === opt.value ? '#22C55E' : '#888'} />
                <Text style={[s.visOptionText, visibility === opt.value && { color: '#fff' }]}>{opt.label}</Text>
                {visibility === opt.value && <Ionicons name="checkmark" size={18} color="#22C55E" style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Toolbar */}
      <View style={[s.toolbar, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity style={s.toolBtn} onPress={pickMedia} disabled={posting || media.length >= 10}>
          <Ionicons name="images-outline" size={24} color={media.length > 0 ? '#22C55E' : '#888'} />
          <Text style={[s.toolLabel, { color: media.length > 0 ? '#22C55E' : '#888' }]}>
            {media.length > 0 ? `Fotoğraf (${media.length})` : 'Fotoğraf'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.toolBtn} onPress={handleLocation} disabled={posting || locLoading}>
          {locLoading
            ? <ActivityIndicator color="#22C55E" size="small" />
            : <Ionicons name={location ? 'location' : 'location-outline'} size={24} color={location ? '#22C55E' : '#888'} />
          }
          <Text style={[s.toolLabel, { color: location ? '#22C55E' : '#888' }]}>
            {location ? 'Konumlu' : 'Konum'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.toolBtn} onPress={() => setShowRoutePicker(true)} disabled={posting}>
          <Ionicons name={selectedRoute ? 'map' : 'map-outline'} size={24} color={selectedRoute ? '#22C55E' : '#888'} />
          <Text style={[s.toolLabel, { color: selectedRoute ? '#22C55E' : '#888' }]}>
            {selectedRoute ? 'Rotalı' : 'Rota'}
          </Text>
        </TouchableOpacity>
      </View>

      <RoutePickerModal
        visible={showRoutePicker}
        userId={profile?.id}
        onSelect={setSelectedRoute}
        onClose={() => setShowRoutePicker(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#0A0A0A' },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#1C1C1C' },
  headerBtn:       { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  postBtn:         { backgroundColor: '#22C55E', paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20 },
  postBtnDisabled: { backgroundColor: '#1A3A1A', opacity: 0.5 },
  postBtnText:     { color: '#fff', fontWeight: '700', fontSize: 14 },
  compose:         { flexDirection: 'row', padding: 14, gap: 12 },
  avatar:          { width: 42, height: 42, borderRadius: 21 },
  avatarFallback:  { backgroundColor: '#1A3A1A', alignItems: 'center', justifyContent: 'center' },
  avatarText:      { color: '#22C55E', fontSize: 18, fontWeight: '700' },
  textArea:        { flex: 1 },
  username:        { color: '#22C55E', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  noteInput:       { color: '#fff', fontSize: 16, lineHeight: 24, minHeight: 100 },
  charCount:       { color: '#555', fontSize: 12, alignSelf: 'flex-end', marginTop: 4 },
  mediaScroll:     { paddingHorizontal: 14, paddingBottom: 14 },
  mediaThumbnail:  { position: 'relative', marginRight: 10 },
  thumbImg:        { width: 100, height: 100, borderRadius: 12 },
  videoTag:        { position: 'absolute', bottom: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: 2 },
  thumbRemove:     { position: 'absolute', top: 4, right: 4 },
  progressBar:     { height: 3, backgroundColor: '#1a1a1a', marginHorizontal: 14, borderRadius: 2, marginBottom: 10 },
  progressFill:    { height: 3, backgroundColor: '#22C55E', borderRadius: 2 },
  tagRow:          { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginBottom: 8, backgroundColor: '#0A1F0A', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  tagText:         { flex: 1, color: '#22C55E', fontSize: 13 },
  visRow:          { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: '#1C1C1C' },
  visLabel:        { color: '#22C55E', fontSize: 14, fontWeight: '500', flex: 1 },
  visOptions:      { marginHorizontal: 14, backgroundColor: '#111', borderRadius: 14, overflow: 'hidden', marginBottom: 8 },
  visOption:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 0.5, borderBottomColor: '#1C1C1C' },
  visOptionActive: { backgroundColor: 'rgba(34,197,94,0.08)' },
  visOptionText:   { color: '#888', fontSize: 14 },
  toolbar:         { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#1C1C1C', backgroundColor: '#0A0A0A', paddingHorizontal: 10, paddingTop: 10 },
  toolBtn:         { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 6 },
  toolLabel:       { fontSize: 11 },
  routeSheet:      { backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 30 },
  sheetHandle:     { width: 36, height: 4, backgroundColor: '#333', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetTitle:      { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center', paddingVertical: 12 },
  routeItem:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#1C1C1C' },
  routeIcon:       { width: 38, height: 38, borderRadius: 19, backgroundColor: '#0A1F0A', alignItems: 'center', justifyContent: 'center' },
  routeTitle:      { color: '#fff', fontSize: 14, fontWeight: '600' },
  routeMeta:       { color: '#666', fontSize: 12, marginTop: 2 },
  emptyText:       { color: '#555', textAlign: 'center', padding: 30, fontSize: 14 },
});