// ── app/user/[id].js ──────────────────────────────────────────────────────────
// Başka kullanıcının profil sayfası
// • Herkese açık → direkt takip et + profil içeriğini gör
// • Gizli         → takip isteği gönder, içerik kilitli
// • Mesaj gönder  → DM odası aç/oluştur
// • Engelle / Şikayet et

import React, {
  useEffect, useState, useCallback, useRef,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
  ActivityIndicator, Alert, Animated, Dimensions,
  FlatList, Share, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { getOrCreateRoom } from '../../services/messageService';

const { width } = Dimensions.get('window');
const GRID_SIZE = (width - 3) / 3;

// ─────────────────────────────────────────────────────────────────────────────
// Yardımcı
// ─────────────────────────────────────────────────────────────────────────────
function fmtCount(n) {
  if (n == null) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat kutusu
// ─────────────────────────────────────────────────────────────────────────────
function StatBox({ value, label, onPress }) {
  return (
    <TouchableOpacity style={sb.box} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <Text style={sb.value}>{value}</Text>
      <Text style={sb.label}>{label}</Text>
    </TouchableOpacity>
  );
}
const sb = StyleSheet.create({
  box:   { alignItems: 'center', flex: 1 },
  value: { color: '#fff', fontSize: 20, fontWeight: '800' },
  label: { color: '#555', fontSize: 12, marginTop: 2 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Post grid hücresi
// ─────────────────────────────────────────────────────────────────────────────
function GridCell({ post, onPress }) {
  const hasImg = post.attachments?.length > 0;
  return (
    <TouchableOpacity style={gc.cell} onPress={() => onPress(post)} activeOpacity={0.85}>
      {hasImg ? (
        <Image source={{ uri: post.attachments[0].storage_path }} style={gc.img} resizeMode="cover" />
      ) : (
        <View style={[gc.img, gc.textCell]}>
          <Text style={gc.textPreview} numberOfLines={4}>{post.user_note || ''}</Text>
        </View>
      )}
      {post.attachments?.length > 1 && (
        <View style={gc.multiIcon}>
          <Ionicons name="copy-outline" size={13} color="#fff" />
        </View>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.55)']}
        style={gc.overlay}
        pointerEvents="none"
      >
        <Ionicons name="heart" size={12} color="#fff" />
        <Text style={gc.likeCount}>{post.like_cnt || 0}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}
const gc = StyleSheet.create({
  cell:        { width: GRID_SIZE, height: GRID_SIZE, position: 'relative' },
  img:         { width: '100%', height: '100%' },
  textCell:    { backgroundColor: '#111', padding: 8, justifyContent: 'center' },
  textPreview: { color: '#888', fontSize: 11, lineHeight: 16 },
  multiIcon:   { position: 'absolute', top: 6, right: 6 },
  overlay:     { position: 'absolute', bottom: 0, left: 0, right: 0, height: 36, flexDirection: 'row', alignItems: 'flex-end', gap: 3, paddingHorizontal: 6, paddingBottom: 5 },
  likeCount:   { color: '#fff', fontSize: 11, fontWeight: '600' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Seçenekler bottom sheet
// ─────────────────────────────────────────────────────────────────────────────
function OptionsSheet({ visible, user, isBlocked, onClose, onBlock, onReport, onShare }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={os.overlay} onPress={onClose} />
      <View style={os.sheet}>
        <View style={os.handle} />

        <TouchableOpacity style={os.row} onPress={onShare}>
          <View style={[os.icon, { backgroundColor: '#0A1A2A' }]}>
            <Ionicons name="share-outline" size={20} color="#3B82F6" />
          </View>
          <Text style={os.rowTxt}>Profili Paylaş</Text>
        </TouchableOpacity>

        <TouchableOpacity style={os.row} onPress={onBlock}>
          <View style={[os.icon, { backgroundColor: '#2A1A0A' }]}>
            <Ionicons name={isBlocked ? 'eye-outline' : 'ban-outline'} size={20} color="#F97316" />
          </View>
          <Text style={[os.rowTxt, { color: '#F97316' }]}>
            {isBlocked ? 'Engeli Kaldır' : 'Engelle'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={os.row} onPress={onReport}>
          <View style={[os.icon, { backgroundColor: '#2A0A0A' }]}>
            <Ionicons name="flag-outline" size={20} color="#ef4444" />
          </View>
          <Text style={[os.rowTxt, { color: '#ef4444' }]}>Şikayet Et</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[os.row, { borderBottomWidth: 0, marginTop: 4 }]} onPress={onClose}>
          <Text style={[os.rowTxt, { textAlign: 'center', flex: 1, color: '#666' }]}>İptal</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}
const os = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet:   { backgroundColor: '#0F0F0F', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 30 },
  handle:  { width: 36, height: 4, backgroundColor: '#2A2A2A', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: '#1A1A1A' },
  icon:    { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowTxt:  { flex: 1, color: '#fff', fontSize: 15, fontWeight: '500' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Gizli profil ekranı
// ─────────────────────────────────────────────────────────────────────────────
function PrivateLockView({ isRequested }) {
  return (
    <View style={pl.wrap}>
      <View style={pl.lockCircle}>
        <Ionicons name="lock-closed" size={32} color="#333" />
      </View>
      <Text style={pl.title}>Bu Hesap Gizli</Text>
      <Text style={pl.desc}>
        {isRequested
          ? 'Takip isteğin onay bekliyor. Onaylandığında fotoğraflarını ve videolarını görebilirsin.'
          : 'Bu hesabı takip ettiğinde fotoğraflarını ve videolarını görebilirsin.'}
      </Text>
    </View>
  );
}
const pl = StyleSheet.create({
  wrap:       { alignItems: 'center', paddingTop: 50, paddingHorizontal: 40, borderTopWidth: 0.5, borderTopColor: '#111', gap: 12 },
  lockCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: '#1C1C1C' },
  title:      { color: '#fff', fontSize: 17, fontWeight: '700' },
  desc:       { color: '#555', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});

// ─────────────────────────────────────────────────────────────────────────────
// ANA EKRAN
// ─────────────────────────────────────────────────────────────────────────────
export default function UserProfileScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { id }  = useLocalSearchParams();
  const { profile: me } = useAuth();

  const [user,          setUser]          = useState(null);
  const [posts,         setPosts]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [following,     setFollowing]     = useState(false);
  const [requested,     setRequested]     = useState(false);
  const [blocked,       setBlocked]       = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [msgLoading,    setMsgLoading]    = useState(false);
  const [showOptions,   setShowOptions]   = useState(false);
  const [activeTab,     setActiveTab]     = useState('posts'); // posts | routes

  const isMe        = id === me?.id;
  const isPrivate   = user?.privacy === 'private';
  const canSeePosts = !isPrivate || following || isMe;

  const scrollY     = useRef(new Animated.Value(0)).current;

  // ── Header opacity (parallax) ──────────────────────────────────────────────
  const headerBg = scrollY.interpolate({
    inputRange: [60, 120], outputRange: [0, 1], extrapolate: 'clamp',
  });

  // ── Yükle ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await api.get(`/users/${id}`);
      setUser(data);
      setFollowing(!!data.is_following);
      setRequested(!!data.follow_requested);
      setBlocked(!!data.is_blocked);

      if (!data.restricted && (data.privacy !== 'private' || data.is_following)) {
        const p = await api.get(`/social/users/${id}/posts`).catch(() => []);
        setPosts(Array.isArray(p) ? p : []);
      }
    } catch (e) {
      Alert.alert('Hata', 'Profil yüklenemedi.');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── Takip et / isteği geri çek ────────────────────────────────────────────
  const handleFollow = async () => {
    setFollowLoading(true);
    try {
      if (following) {
        await api.delete(`/users/${id}/follow`);
        setFollowing(false); setRequested(false);
        setUser(u => u ? { ...u, follower_cnt: Math.max(0, (u.follower_cnt || 1) - 1) } : u);
      } else if (requested) {
        // İsteği geri çek
        await api.delete(`/users/${id}/follow`);
        setRequested(false);
      } else {
        await api.post(`/users/${id}/follow`);
        if (isPrivate) {
          setRequested(true);
        } else {
          setFollowing(true);
          setUser(u => u ? { ...u, follower_cnt: (u.follower_cnt || 0) + 1 } : u);
          // Profil içeriğini yükle
          const p = await api.get(`/social/users/${id}/posts`).catch(() => []);
          setPosts(Array.isArray(p) ? p : []);
        }
      }
    } catch (e) { Alert.alert('Hata', e.message); }
    finally { setFollowLoading(false); }
  };

  // ── Mesaj gönder ──────────────────────────────────────────────────────────
  const handleMessage = async () => {
    setMsgLoading(true);
    try {
      const room = await getOrCreateRoom(id);
      router.push(`/messages/${room.id}`);
    } catch (e) { Alert.alert('Hata', 'Sohbet açılamadı.'); }
    finally { setMsgLoading(false); }
  };

  // ── Engelle ───────────────────────────────────────────────────────────────
  const handleBlock = () => {
    Alert.alert(
      blocked ? 'Engeli Kaldır' : 'Kullanıcıyı Engelle',
      blocked
        ? `@${user?.username} artık seni görebilecek.`
        : `@${user?.username} seni takip edemeyecek ve içeriklerini göremeyecek.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: blocked ? 'Engeli Kaldır' : 'Engelle',
          style: blocked ? 'default' : 'destructive',
          onPress: async () => {
            try {
              if (blocked) { await api.delete(`/users/${id}/block`); setBlocked(false); }
              else         { await api.post(`/users/${id}/block`);  setBlocked(true); setFollowing(false); setRequested(false); }
              setShowOptions(false);
            } catch {}
          },
        },
      ]
    );
  };

  // ── Şikayet ───────────────────────────────────────────────────────────────
  const handleReport = () => {
    setShowOptions(false);
    Alert.alert('Şikayet Et', 'Bu hesabı şikayet etmek istediğine emin misin?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Şikayet Et', style: 'destructive',
        onPress: async () => {
          try {
            await api.post('/social/reports', {
              target_type: 'user', target_id: id, reason: 'inappropriate',
            });
            Alert.alert('Şikayet Alındı', 'Ekibimiz inceleyecek. Teşekkürler.');
          } catch {}
        },
      },
    ]);
  };

  // ── Paylaş ────────────────────────────────────────────────────────────────
  const handleShare = () => {
    setShowOptions(false);
    Share.share({ message: `MOVO'da @${user?.username} profilini incele!` });
  };

  // ── Takip buton metni ─────────────────────────────────────────────────────
  const followBtnConfig = () => {
    if (following) return { label: 'Takip Ediliyor', icon: 'checkmark', bg: '#1A1A1A', border: '#2A2A2A', color: '#888' };
    if (requested) return { label: 'İstek Gönderildi', icon: 'time-outline', bg: '#1A1A2A', border: '#3B3B6B', color: '#818CF8' };
    if (isPrivate) return { label: 'İstek Gönder', icon: 'lock-closed-outline', bg: '#0A2A1A', border: '#22C55E', color: '#22C55E' };
    return { label: 'Takip Et', icon: 'person-add-outline', bg: '#22C55E', border: '#22C55E', color: '#fff' };
  };
  const fBtn = followBtnConfig();

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center', paddingTop: insets.top }]}>
        <ActivityIndicator color="#22C55E" size="large" />
      </View>
    );
  }
  if (!user) return null;

  const initials = (user.display_name || user.username || '?').slice(0, 1).toUpperCase();

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* ── Animasyonlu header arka planı ── */}
      <Animated.View
        style={[s.headerBg, { opacity: headerBg }]}
        pointerEvents="none"
      />

      {/* ── Sabit üst butonlar ── */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.topBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.topTitle} numberOfLines={1}>@{user.username}</Text>
        {!isMe && (
          <TouchableOpacity style={s.topBtn} onPress={() => setShowOptions(true)}>
            <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        {isMe && <View style={{ width: 40 }} />}
      </View>

      {/* ── Scrollable içerik ── */}
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
      >
        {/* ── Profil bölümü ── */}
        <View style={s.profileSection}>
          {/* Avatar */}
          <View style={s.avatarWrap}>
            {user.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={s.avatar} />
            ) : (
              <View style={[s.avatar, s.avatarFallback]}>
                <Text style={s.avatarInitial}>{initials}</Text>
              </View>
            )}
            {/* Gizli / Doğrulanmış badge */}
            {user.is_verified && (
              <View style={s.verifiedBadge}>
                <Ionicons name="checkmark" size={10} color="#fff" />
              </View>
            )}
          </View>

          {/* İsim + bio */}
          <View style={s.nameWrap}>
            <View style={s.nameRow}>
              <Text style={s.displayName}>{user.display_name || user.username}</Text>
              {isPrivate && (
                <Ionicons name="lock-closed" size={14} color="#555" style={{ marginLeft: 6 }} />
              )}
            </View>
            <Text style={s.username}>@{user.username}</Text>
            {user.bio ? (
              <Text style={s.bio}>{user.bio}</Text>
            ) : null}
            {user.city_name ? (
              <View style={s.locationRow}>
                <Ionicons name="location-outline" size={13} color="#555" />
                <Text style={s.locationTxt}>{user.city_name}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── İstatistikler ── */}
        <View style={s.statsRow}>
          <StatBox
            value={fmtCount(user.post_cnt || 0)}
            label="Gönderi"
          />
          <View style={s.statDiv} />
          <StatBox
            value={fmtCount(user.follower_cnt || 0)}
            label="Takipçi"
            onPress={() => router.push(`/user/${id}/followers`)}
          />
          <View style={s.statDiv} />
          <StatBox
            value={fmtCount(user.following_cnt || 0)}
            label="Takip"
            onPress={() => router.push(`/user/${id}/following`)}
          />
          {user.route_cnt != null && (
            <>
              <View style={s.statDiv} />
              <StatBox value={user.route_cnt} label="Rota" />
            </>
          )}
        </View>

        {/* ── Aksiyon butonları ── */}
        {!isMe && (
          <View style={s.actionRow}>
            {/* Takip / İstek butonu */}
            <TouchableOpacity
              style={[s.followBtn, { backgroundColor: fBtn.bg, borderColor: fBtn.border }]}
              onPress={handleFollow}
              disabled={followLoading}
              activeOpacity={0.8}
            >
              {followLoading ? (
                <ActivityIndicator size="small" color={fBtn.color} />
              ) : (
                <>
                  <Ionicons name={fBtn.icon} size={16} color={fBtn.color} />
                  <Text style={[s.followBtnTxt, { color: fBtn.color }]}>{fBtn.label}</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Mesaj butonu */}
            <TouchableOpacity
              style={s.msgBtn}
              onPress={handleMessage}
              disabled={msgLoading}
              activeOpacity={0.8}
            >
              {msgLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="chatbubble-outline" size={16} color="#fff" />
                  <Text style={s.msgBtnTxt}>Mesaj</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Ortak takipçi ipucu ── */}
        {user.mutual_followers_count > 0 && (
          <View style={s.mutualRow}>
            <Ionicons name="people-outline" size={13} color="#555" />
            <Text style={s.mutualTxt}>
              Tanıdığın <Text style={{ color: '#ccc' }}>{user.mutual_followers_count}</Text> kişi takip ediyor
            </Text>
          </View>
        )}

        {/* ── Gizli profil kilidi ── */}
        {isPrivate && !following && !isMe && (
          <PrivateLockView isRequested={requested} />
        )}

        {/* ── Sekmeler ── */}
        {canSeePosts && (
          <View style={s.tabs}>
            <TouchableOpacity
              style={[s.tab, activeTab === 'posts' && s.tabActive]}
              onPress={() => setActiveTab('posts')}
            >
              <Ionicons
                name={activeTab === 'posts' ? 'grid' : 'grid-outline'}
                size={20}
                color={activeTab === 'posts' ? '#fff' : '#444'}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tab, activeTab === 'routes' && s.tabActive]}
              onPress={() => setActiveTab('routes')}
            >
              <Ionicons
                name={activeTab === 'routes' ? 'map' : 'map-outline'}
                size={20}
                color={activeTab === 'routes' ? '#fff' : '#444'}
              />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Post grid ── */}
        {canSeePosts && activeTab === 'posts' && (
          posts.length > 0 ? (
            <View style={s.grid}>
              {posts.map(p => (
                <GridCell
                  key={p.id}
                  post={p}
                  onPress={p => router.push(`/post/${p.id}`)}
                />
              ))}
            </View>
          ) : (
            <View style={s.emptyTab}>
              <Ionicons name="camera-outline" size={40} color="#222" />
              <Text style={s.emptyTabTxt}>Henüz gönderi yok</Text>
            </View>
          )
        )}

        {/* ── Rotalar ── */}
        {canSeePosts && activeTab === 'routes' && (
          <View style={s.emptyTab}>
            <Ionicons name="map-outline" size={40} color="#222" />
            <Text style={s.emptyTabTxt}>Henüz rota paylaşılmamış</Text>
          </View>
        )}

        <View style={{ height: 60 }} />
      </Animated.ScrollView>

      {/* ── Seçenekler sheet ── */}
      <OptionsSheet
        visible={showOptions}
        user={user}
        isBlocked={blocked}
        onClose={() => setShowOptions(false)}
        onBlock={handleBlock}
        onReport={handleReport}
        onShare={handleShare}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#0A0A0A' },

  // Animasyonlu header arka planı
  headerBg:      { position: 'absolute', top: 0, left: 0, right: 0, height: 80, backgroundColor: '#0A0A0A', zIndex: 10 },

  // Üst bar
  topBar:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8, zIndex: 20 },
  topBtn:        { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topTitle:      { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },

  // Profil
  profileSection:{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  avatarWrap:    { position: 'relative', width: 90, height: 90, marginBottom: 14 },
  avatar:        { width: 90, height: 90, borderRadius: 45, borderWidth: 2.5, borderColor: '#22C55E' },
  avatarFallback:{ backgroundColor: '#1A3A1A', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#22C55E', fontSize: 36, fontWeight: '800' },
  verifiedBadge: { position: 'absolute', bottom: 2, right: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0A0A0A' },

  nameWrap:      { gap: 4 },
  nameRow:       { flexDirection: 'row', alignItems: 'center' },
  displayName:   { color: '#fff', fontSize: 20, fontWeight: '800' },
  username:      { color: '#555', fontSize: 14 },
  bio:           { color: '#aaa', fontSize: 14, lineHeight: 20, marginTop: 4 },
  locationRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  locationTxt:   { color: '#555', fontSize: 12 },

  // Stats
  statsRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: '#111' },
  statDiv:       { width: 0.5, height: 30, backgroundColor: '#1C1C1C' },

  // Aksiyonlar
  actionRow:     { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  followBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 16, paddingVertical: 12, borderWidth: 1 },
  followBtnTxt:  { fontSize: 14, fontWeight: '700' },
  msgBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#1A1A1A', borderRadius: 16, borderWidth: 0.5, borderColor: '#2A2A2A' },
  msgBtnTxt:     { color: '#fff', fontSize: 14, fontWeight: '600' },

  // Ortak takipçi
  mutualRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 10 },
  mutualTxt:     { color: '#555', fontSize: 12 },

  // Sekmeler
  tabs:          { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#111', marginTop: 8 },
  tab:           { flex: 1, alignItems: 'center', paddingVertical: 14 },
  tabActive:     { borderTopWidth: 1.5, borderTopColor: '#fff' },

  // Grid
  grid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 1.5 },

  // Boş tab
  emptyTab:      { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTabTxt:   { color: '#333', fontSize: 14 },
});