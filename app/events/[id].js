// ── app/user/[id].js ─────────────────────────────────────────────────────────
// Başka bir kullanıcının profil sayfası
// Gizlilik kuralları backend tarafından uygulanır
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image,
  TouchableOpacity, ActivityIndicator, Alert,
  FlatList, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

const { width } = Dimensions.get('window');
const GRID = (width - 4) / 3;

export default function UserProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id }  = useLocalSearchParams();
  const { profile: me } = useAuth();

  const [user, setUser]         = useState(null);
  const [posts, setPosts]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [restricted, setRestricted] = useState(false); // followers-only kısıtlaması

  const isOwn = id === me?.id;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await api.get(`/users/${id}`);
      setUser(data);
      setFollowing(!!data.is_following);
      setRestricted(!!data.restricted);

      // Kısıtlı değilse postları da getir
      if (!data.restricted && data.privacy !== 'private') {
        try {
          const p = await api.get(`/social/users/${id}/posts`);
          setPosts(Array.isArray(p) ? p : []);
        } catch { setPosts([]); }
      }
    } catch (e) {
      if (e.message?.includes('403') || e.message?.includes('gizli')) {
        Alert.alert('Gizli Profil', 'Bu profil gizlidir.', [{ text: 'Geri Dön', onPress: () => router.back() }]);
      } else {
        Alert.alert('Hata', 'Profil yüklenemedi.'); router.back();
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleFollow = async () => {
    setFollowLoading(true);
    try {
      if (following) {
        await api.delete(`/users/${id}/follow`);
        setFollowing(false);
        setUser(prev => prev ? { ...prev, follower_cnt: (prev.follower_cnt || 1) - 1 } : prev);
      } else {
        await api.post(`/users/${id}/follow`);
        setFollowing(true);
        setUser(prev => prev ? { ...prev, follower_cnt: (prev.follower_cnt || 0) + 1 } : prev);
        // Gizli profil ise takip isteği gönderildi
        if (user?.privacy === 'private') {
          Alert.alert('Takip İsteği Gönderildi', 'Kullanıcı isteğinizi onayladıktan sonra profilini görebilirsiniz.');
        }
      }
    } catch (e) {
      Alert.alert('Hata', e.message);
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[s.container, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color="#22C55E" size="large" />
      </View>
    );
  }

  if (!user) return null;

  const initials = (user.display_name || user.username || '?').slice(0, 1).toUpperCase();
  const isPrivate = user.privacy === 'private';

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>@{user.username}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profil bilgisi */}
        <View style={s.profileRow}>
          {user.avatar_url
            ? <Image source={{ uri: user.avatar_url }} style={s.avatar} />
            : <View style={[s.avatar, s.avatarFallback]}><Text style={s.avatarText}>{initials}</Text></View>
          }
          <View style={s.stats}>
            <View style={s.statItem}>
              <Text style={s.statValue}>{user.post_cnt || 0}</Text>
              <Text style={s.statLabel}>Gönderi</Text>
            </View>
            <View style={s.statItem}>
              <Text style={s.statValue}>{user.follower_cnt || 0}</Text>
              <Text style={s.statLabel}>Takipçi</Text>
            </View>
            <View style={s.statItem}>
              <Text style={s.statValue}>{user.following_cnt || 0}</Text>
              <Text style={s.statLabel}>Takip</Text>
            </View>
          </View>
        </View>

        {/* İsim & bio */}
        <View style={s.bioSection}>
          <Text style={s.displayName}>{user.display_name || user.username}</Text>
          {user.bio ? <Text style={s.bio}>{user.bio}</Text> : null}
          {user.city_name ? (
            <View style={s.locationRow}>
              <Ionicons name="location-outline" size={13} color="#888" />
              <Text style={s.locationText}>{user.city_name}</Text>
            </View>
          ) : null}
        </View>

        {/* Takip / Mesaj butonları */}
        {!isOwn && (
          <View style={s.actions}>
            <TouchableOpacity
              style={[s.followBtn, following && s.followingBtn]}
              onPress={handleFollow}
              disabled={followLoading}
            >
              {followLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={[s.followBtnText, following && s.followingBtnText]}>
                    {following ? 'Takip Ediliyor' : isPrivate ? 'Takip İsteği Gönder' : 'Takip Et'}
                  </Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={s.msgBtn} onPress={() => Alert.alert('Yakında', 'Mesajlaşma yakında!')}>
              <Text style={s.msgBtnText}>Mesaj</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Kısıtlı profil uyarısı */}
        {restricted && (
          <View style={s.restrictedBox}>
            <Ionicons name="lock-closed-outline" size={32} color="#555" />
            <Text style={s.restrictedTitle}>Bu Hesap Gizli</Text>
            <Text style={s.restrictedDesc}>
              Bu kişinin fotoğraflarını ve videolarını görmek için takip isteği gönder.
            </Text>
          </View>
        )}

        {/* Tamamen gizli profil */}
        {isPrivate && !following && !isOwn && (
          <View style={s.restrictedBox}>
            <Ionicons name="lock-closed-outline" size={32} color="#555" />
            <Text style={s.restrictedTitle}>Gizli Hesap</Text>
            <Text style={s.restrictedDesc}>
              Bu hesabı takip ettiğinizde fotoğraflarını ve videolarını görebilirsiniz.
            </Text>
          </View>
        )}

        {/* Post grid */}
        {!restricted && !isPrivate && posts.length > 0 && (
          <View style={s.grid}>
            {posts.map(p => {
              const hasImg = p.attachments?.length > 0;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={s.gridCell}
                  onPress={() => router.push(`/post/${p.id}`)}
                  activeOpacity={0.85}
                >
                  {hasImg
                    ? <Image source={{ uri: p.attachments[0].storage_path }} style={s.gridImg} resizeMode="cover" />
                    : <View style={[s.gridImg, s.gridText]}>
                        <Text style={s.gridTextPreview} numberOfLines={3}>{p.user_note || ''}</Text>
                      </View>
                  }
                  <View style={s.gridOverlay}>
                    <Ionicons name="heart" size={12} color="#fff" />
                    <Text style={s.gridLikes}>{p.like_cnt || 0}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {!restricted && !isPrivate && posts.length === 0 && !loading && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>📸</Text>
            <Text style={s.emptyText}>Henüz gönderi yok</Text>
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#0D0D0D' },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: '#1C1C1C' },
  backBtn:          { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle:      { color: '#fff', fontSize: 16, fontWeight: '700' },

  profileRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 14, gap: 20 },
  avatar:           { width: 86, height: 86, borderRadius: 43, borderWidth: 2, borderColor: '#22C55E' },
  avatarFallback:   { backgroundColor: '#1A3A1A', alignItems: 'center', justifyContent: 'center' },
  avatarText:       { color: '#22C55E', fontSize: 34, fontWeight: '700' },
  stats:            { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  statItem:         { alignItems: 'center' },
  statValue:        { color: '#fff', fontSize: 18, fontWeight: '700' },
  statLabel:        { color: '#888', fontSize: 12, marginTop: 2 },

  bioSection:       { paddingHorizontal: 16, paddingBottom: 14 },
  displayName:      { color: '#fff', fontSize: 15, fontWeight: '700' },
  bio:              { color: '#aaa', fontSize: 13, marginTop: 4, lineHeight: 18 },
  locationRow:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  locationText:     { color: '#888', fontSize: 12 },

  actions:          { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 16 },
  followBtn:        { flex: 1, backgroundColor: '#22C55E', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  followingBtn:     { backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#333' },
  followBtnText:    { color: '#fff', fontWeight: '700', fontSize: 14 },
  followingBtnText: { color: '#aaa' },
  msgBtn:           { flex: 1, backgroundColor: '#1A1A1A', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  msgBtnText:       { color: '#fff', fontWeight: '600', fontSize: 14 },

  restrictedBox:    { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 40, borderTopWidth: 0.5, borderTopColor: '#1C1C1C', marginTop: 10 },
  restrictedTitle:  { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 14, marginBottom: 8 },
  restrictedDesc:   { color: '#666', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  grid:             { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  gridCell:         { width: GRID, height: GRID, position: 'relative' },
  gridImg:          { width: '100%', height: '100%' },
  gridText:         { backgroundColor: '#1A2E1A', padding: 8, justifyContent: 'center' },
  gridTextPreview:  { color: '#aaa', fontSize: 11, lineHeight: 16 },
  gridOverlay:      { position: 'absolute', bottom: 4, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3 },
  gridLikes:        { color: '#fff', fontSize: 11, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },

  emptyState:       { alignItems: 'center', paddingVertical: 50 },
  emptyIcon:        { fontSize: 40, marginBottom: 10 },
  emptyText:        { color: '#555', fontSize: 14 },
});