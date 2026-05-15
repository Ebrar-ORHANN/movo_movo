// ── components/stories/Stories.js ────────────────────────────────────────────
// StoryBar  → feed'in üstüne koy
// StoryViewer → tam ekran izleyici
// StoryCreator → oluşturma modalı
// Kullanım:
//   import { StoryBar } from '../../components/stories/Stories';
//   <StoryBar /> (feed.js içinde FlatList ListHeaderComponent olarak)

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  Modal, Dimensions, Animated, Pressable, TextInput,
  ActivityIndicator, Alert, ScrollView, FlatList,
  PanResponder, StatusBar, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import app, { auth } from '../../src/firebase/config';
import { useAuth } from '../../context/AuthContext';
import { API_BASE } from '../../constants/api';

const { width, height } = Dimensions.get('window');
const storage = getStorage(app);
const STORY_DURATION = 5000; // ms per story

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

async function uploadToStorage(uri, userId) {
  const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `stories/${userId}/${Date.now()}.${ext}`;
  const blob = await (await fetch(uri)).blob();
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ count, current, progress }) {
  return (
    <View style={pb.row}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={pb.track}>
          <Animated.View
            style={[
              pb.fill,
              {
                width: i < current
                  ? '100%'
                  : i === current
                    ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                    : '0%',
              },
            ]}
          />
        </View>
      ))}
    </View>
  );
}
const pb = StyleSheet.create({
  row:   { flexDirection: 'row', gap: 3, paddingHorizontal: 10, paddingTop: 10 },
  track: { flex: 1, height: 2.5, backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: 2, overflow: 'hidden' },
  fill:  { height: '100%', backgroundColor: '#fff', borderRadius: 2 },
});

// ── Story Creator modal ────────────────────────────────────────────────────────
export function StoryCreator({ visible, onClose, onCreated }) {
  const { profile } = useAuth();
  const insets      = useSafeAreaInsets();
  const [step, setStep]           = useState('pick');   // pick | preview
  const [media, setMedia]         = useState(null);
  const [caption, setCaption]     = useState('');
  const [location, setLocation]   = useState(null);
  const [locLoading, setLocLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const reset = () => { setStep('pick'); setMedia(null); setCaption(''); setLocation(null); };

  const handleClose = () => { reset(); onClose(); };

  const pickMedia = async (source) => {
    const perms = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perms.status !== 'granted') { Alert.alert('İzin Gerekli', 'Erişim izni verin.'); return; }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.9 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.9 });
    if (!result.canceled && result.assets?.[0]) {
      setMedia(result.assets[0]);
      setStep('preview');
    }
  };

  const handleLocation = async () => {
    if (location) { setLocation(null); return; }
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('İzin Gerekli', 'Konum erişimine izin verin.'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = pos.coords;
      const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }).catch(() => []);
      const g = geo[0];
      const label = [g?.district, g?.city].filter(Boolean).join(', ') || `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
      setLocation({ lat, lng, label });
    } catch { Alert.alert('Hata', 'Konum alınamadı.'); }
    finally { setLocLoading(false); }
  };

  const handleShare = async () => {
    if (!media || !profile) return;
    setUploading(true);
    try {
      const mediaUrl  = await uploadToStorage(media.uri, profile.id);
      const mediaType = media.type === 'video' ? 'video' : 'image';
      await apiFetch('/stories', {
        method: 'POST',
        body: JSON.stringify({
          media_url: mediaUrl, media_type: mediaType,
          caption: caption.trim() || null,
          ...(location ? { lat: location.lat, lng: location.lng, location_label: location.label } : {}),
        }),
      });
      onCreated?.();
      handleClose();
    } catch (e) {
      Alert.alert('Hata', 'Story paylaşılamadı.');
    } finally {
      setUploading(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={handleClose}>
      <View style={[sc.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" />

        {step === 'pick' ? (
          // Seçim ekranı
          <>
            <TouchableOpacity style={sc.closeBtn} onPress={handleClose}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <View style={sc.pickCenter}>
              <Text style={sc.pickTitle}>Story Paylaş</Text>
              <Text style={sc.pickSub}>24 saat sonra otomatik silinir</Text>
              <View style={sc.pickBtns}>
                <TouchableOpacity style={sc.pickBtn} onPress={() => pickMedia('camera')}>
                  <Ionicons name="camera" size={32} color="#22C55E" />
                  <Text style={sc.pickBtnText}>Kamera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={sc.pickBtn} onPress={() => pickMedia('library')}>
                  <Ionicons name="images" size={32} color="#22C55E" />
                  <Text style={sc.pickBtnText}>Galeri</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : (
          // Önizleme ekranı
          <>
            <Image source={{ uri: media?.uri }} style={sc.preview} resizeMode="cover" />

            {/* Konum etiketi overlay */}
            {location && (
              <View style={sc.locTag}>
                <Ionicons name="location" size={14} color="#fff" />
                <Text style={sc.locTagText}>{location.label}</Text>
              </View>
            )}

            {/* Üst araçlar */}
            <View style={[sc.topBar, { paddingTop: insets.top + 8 }]}>
              <TouchableOpacity onPress={() => setStep('pick')}>
                <Ionicons name="arrow-back" size={26} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleLocation} disabled={locLoading}>
                {locLoading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Ionicons name={location ? 'location' : 'location-outline'} size={26} color="#fff" />
                }
              </TouchableOpacity>
            </View>

            {/* Caption */}
            <View style={sc.captionWrap}>
              <TextInput
                style={sc.captionInput}
                placeholder="Bir şeyler yaz…"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={caption}
                onChangeText={setCaption}
                maxLength={150}
                multiline
              />
            </View>

            {/* Paylaş butonu */}
            <View style={[sc.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
              <TouchableOpacity
                style={[sc.shareBtn, uploading && { opacity: 0.6 }]}
                onPress={handleShare}
                disabled={uploading}
              >
                {uploading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Text style={sc.shareBtnText}>Story Paylaş</Text>
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </>
                }
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

// ── Story Viewer ──────────────────────────────────────────────────────────────
export function StoryViewer({ users, startUserIdx = 0, visible, onClose }) {
  const insets        = useSafeAreaInsets();
  const [userIdx, setUserIdx]   = useState(startUserIdx);
  const [storyIdx, setStoryIdx] = useState(0);
  const [paused, setPaused]     = useState(false);
  const progress  = useRef(new Animated.Value(0)).current;
  const anim      = useRef(null);
  const { profile } = useAuth();

  const currentUser   = users?.[userIdx];
  const currentStory  = currentUser?.stories?.[storyIdx];
  const storyCount    = currentUser?.stories?.length || 0;

  useEffect(() => {
    if (!visible || !currentStory) return;
    progress.setValue(0);
    markViewed();
    startProgress();
    return () => anim.current?.stop();
  }, [userIdx, storyIdx, visible]);

  const markViewed = async () => {
    if (!currentStory?.seen) {
      await apiFetch(`/stories/${currentStory.id}/view`, { method: 'POST' }).catch(() => {});
    }
  };

  const startProgress = () => {
    anim.current = Animated.timing(progress, {
      toValue: 1, duration: STORY_DURATION, useNativeDriver: false,
    });
    anim.current.start(({ finished }) => {
      if (finished) goNext();
    });
  };

  const goNext = () => {
    if (storyIdx < storyCount - 1) {
      setStoryIdx(i => i + 1);
    } else if (userIdx < users.length - 1) {
      setUserIdx(i => i + 1);
      setStoryIdx(0);
    } else {
      onClose();
    }
  };

  const goPrev = () => {
    anim.current?.stop();
    if (storyIdx > 0) {
      setStoryIdx(i => i - 1);
    } else if (userIdx > 0) {
      setUserIdx(i => i - 1);
      const prevUser = users[userIdx - 1];
      setStoryIdx((prevUser?.stories?.length || 1) - 1);
    }
  };

  const handlePressIn  = () => { setPaused(true);  anim.current?.stop(); };
  const handlePressOut = () => { setPaused(false); startProgress(); };

  if (!visible || !currentStory) return null;

  const timeAgo = (d) => {
    const diff = (Date.now() - new Date(d)) / 1000;
    if (diff < 3600) return `${Math.floor(diff / 60)}dk`;
    return `${Math.floor(diff / 3600)}s`;
  };

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={sv.container}>
        <StatusBar hidden />

        {/* Medya */}
        <Image
          source={{ uri: currentStory.media_url }}
          style={sv.media}
          resizeMode="cover"
        />

        {/* Gradient overlay (üst) */}
        <View style={sv.gradientTop} />
        <View style={sv.gradientBottom} />

        {/* Progress bars */}
        <View style={[sv.progressWrap, { paddingTop: insets.top + 6 }]}>
          <ProgressBar count={storyCount} current={storyIdx} progress={progress} />
        </View>

        {/* Header */}
        <View style={sv.header}>
          <Image
            source={currentUser.avatar_url ? { uri: currentUser.avatar_url } : require('../../assets/default-avatar.png')}
            style={sv.avatar}
            defaultSource={require('../../assets/default-avatar.png')}
          />
          <View style={{ flex: 1 }}>
            <Text style={sv.username}>{currentUser.display_name || currentUser.username}</Text>
            <Text style={sv.time}>{timeAgo(currentStory.created_at)}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={sv.closeBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Konum etiketi */}
        {currentStory.location_label && (
          <View style={sv.locTag}>
            <Ionicons name="location" size={13} color="#fff" />
            <Text style={sv.locText}>{currentStory.location_label}</Text>
          </View>
        )}

        {/* Caption */}
        {currentStory.caption && (
          <View style={[sv.caption, { bottom: insets.bottom + 60 }]}>
            <Text style={sv.captionText}>{currentStory.caption}</Text>
          </View>
        )}

        {/* Dokunma alanları */}
        <View style={sv.touchArea}>
          <Pressable
            style={{ flex: 1 }}
            onPress={goPrev}
            onLongPress={handlePressIn}
            onPressOut={handlePressOut}
          />
          <Pressable
            style={{ flex: 2 }}
            onPress={goNext}
            onLongPress={handlePressIn}
            onPressOut={handlePressOut}
          />
        </View>
      </View>
    </Modal>
  );
}

// ── Story Bar ─────────────────────────────────────────────────────────────────
export function StoryBar() {
  const { profile }    = useAuth();
  const [storyUsers, setStoryUsers] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStart, setViewerStart] = useState(0);
  const [creatorOpen, setCreatorOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/stories/feed');
      setStoryUsers(data || []);
    } catch { }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openViewer = (idx) => { setViewerStart(idx); setViewerOpen(true); };

  const myStories    = storyUsers.find(u => u.user_id === profile?.id);
  const hasMyStories = (myStories?.total || 0) > 0;
  const allSeen      = hasMyStories && (myStories?.unseen || 0) === 0;

  return (
    <View style={sb.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={sb.scroll}
      >
        {/* Kendi story / ekle butonu */}
        <TouchableOpacity
          style={sb.item}
          onPress={hasMyStories
            ? () => openViewer(storyUsers.findIndex(u => u.user_id === profile?.id))
            : () => setCreatorOpen(true)
          }
          activeOpacity={0.8}
        >
          <View style={[sb.ring, hasMyStories && (allSeen ? sb.ringGray : sb.ringGreen)]}>
            <View style={sb.avatarWrap}>
              {profile?.avatar_url
                ? <Image source={{ uri: profile.avatar_url }} style={sb.avatar} />
                : <View style={[sb.avatar, sb.avatarFallback]}>
                    <Text style={sb.initials}>{(profile?.display_name || '?').slice(0, 1).toUpperCase()}</Text>
                  </View>
              }
              {!hasMyStories && (
                <View style={sb.addBadge}>
                  <Ionicons name="add" size={14} color="#fff" />
                </View>
              )}
            </View>
          </View>
          <Text style={sb.name} numberOfLines={1}>
            {hasMyStories ? 'Senin' : 'Ekle'}
          </Text>
        </TouchableOpacity>

        {/* Diğer kullanıcılar */}
        {storyUsers
          .filter(u => u.user_id !== profile?.id)
          .map((u, i) => {
            const idx    = storyUsers.indexOf(u);
            const unseen = (u.unseen || 0) > 0;
            return (
              <TouchableOpacity
                key={u.user_id}
                style={sb.item}
                onPress={() => openViewer(idx)}
                activeOpacity={0.8}
              >
                <View style={[sb.ring, unseen ? sb.ringGreen : sb.ringGray]}>
                  <View style={sb.avatarWrap}>
                    {u.avatar_url
                      ? <Image source={{ uri: u.avatar_url }} style={sb.avatar} />
                      : <View style={[sb.avatar, sb.avatarFallback]}>
                          <Text style={sb.initials}>{(u.display_name || u.username || '?').slice(0, 1).toUpperCase()}</Text>
                        </View>
                    }
                  </View>
                </View>
                <Text style={[sb.name, !unseen && sb.nameSeen]} numberOfLines={1}>
                  {u.display_name || u.username}
                </Text>
              </TouchableOpacity>
            );
          })
        }

        {loading && (
          <View style={sb.loader}>
            <ActivityIndicator color="#22C55E" size="small" />
          </View>
        )}
      </ScrollView>

      {/* Story Viewer */}
      <StoryViewer
        users={storyUsers}
        startUserIdx={viewerStart}
        visible={viewerOpen}
        onClose={() => { setViewerOpen(false); load(); }}
      />

      {/* Story Creator */}
      <StoryCreator
        visible={creatorOpen}
        onClose={() => setCreatorOpen(false)}
        onCreated={() => { setCreatorOpen(false); load(); }}
      />
    </View>
  );
}

// ── Stiller ───────────────────────────────────────────────────────────────────

// StoryCreator
const sc = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#000' },
  closeBtn:     { position: 'absolute', top: 52, left: 16, zIndex: 10 },
  pickCenter:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pickTitle:    { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  pickSub:      { color: '#888', fontSize: 14, marginBottom: 40 },
  pickBtns:     { flexDirection: 'row', gap: 20 },
  pickBtn:      { backgroundColor: '#111', borderRadius: 20, padding: 28, alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#222', width: 130 },
  pickBtnText:  { color: '#fff', fontSize: 14, fontWeight: '600' },
  preview:      { ...StyleSheet.absoluteFillObject },
  topBar:       { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  locTag:       { position: 'absolute', top: 120, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  locTagText:   { color: '#fff', fontSize: 13, fontWeight: '500' },
  captionWrap:  { position: 'absolute', bottom: 120, left: 16, right: 16 },
  captionInput: { color: '#fff', fontSize: 17, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  bottomBar:    { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'flex-end', paddingHorizontal: 20 },
  shareBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#22C55E', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 30 },
  shareBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

// StoryViewer
const sv = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#000' },
  media:        { ...StyleSheet.absoluteFillObject },
  gradientTop:  { position: 'absolute', top: 0, left: 0, right: 0, height: 180, backgroundColor: 'transparent',
                  // React Native doesn't support CSS gradients natively, use a dark overlay
                  opacity: 0.6, backgroundColor: '#000' },
  gradientBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 120, opacity: 0.5, backgroundColor: '#000' },
  progressWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  header:       { position: 'absolute', top: 60, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 },
  avatar:       { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: '#22C55E' },
  username:     { color: '#fff', fontWeight: '700', fontSize: 14 },
  time:         { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  closeBtn:     { padding: 6 },
  touchArea:    { ...StyleSheet.absoluteFillObject, flexDirection: 'row', marginTop: 100 },
  locTag:       { position: 'absolute', bottom: 100, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  locText:      { color: '#fff', fontSize: 13 },
  caption:      { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  captionText:  { color: '#fff', fontSize: 16, textAlign: 'center', fontWeight: '500', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
});

// StoryBar
const sb = StyleSheet.create({
  wrapper:      { borderBottomWidth: 0.5, borderBottomColor: '#1C1C1C', paddingBottom: 12 },
  scroll:       { paddingHorizontal: 12, paddingTop: 10, gap: 4 },
  item:         { alignItems: 'center', marginHorizontal: 5, width: 68 },
  ring:         { padding: 2.5, borderRadius: 999, borderWidth: 2.5, borderColor: 'transparent' },
  ringGreen:    { borderColor: '#22C55E' },
  ringGray:     { borderColor: '#333' },
  avatarWrap:   { position: 'relative' },
  avatar:       { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: { backgroundColor: '#1A3A1A', alignItems: 'center', justifyContent: 'center' },
  initials:     { color: '#22C55E', fontSize: 22, fontWeight: '700' },
  addBadge:     { position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0A0A0A' },
  name:         { color: '#fff', fontSize: 11, marginTop: 5, width: 68, textAlign: 'center' },
  nameSeen:     { color: '#666' },
  loader:       { alignSelf: 'center', paddingHorizontal: 10 },
});