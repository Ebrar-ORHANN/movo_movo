// ── app/search.js ─────────────────────────────────────────────────────────────
// Kullanıcı arama ekranı
// • Gerçek zamanlı arama (debounce 350ms)
// • Takip et / Takip isteği gönder (gizli profil)
// • Profil sayfasına git
// • Son aramalar (AsyncStorage)
// • Önerilen kullanıcılar (ilk açılışta)

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, Image, ActivityIndicator, Animated,
  Pressable, Keyboard, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

const RECENT_KEY    = '@movo_recent_searches';
const MAX_RECENT    = 8;
const DEBOUNCE_MS   = 350;

// ─────────────────────────────────────────────────────────────────────────────
// Avatar bileşeni
// ─────────────────────────────────────────────────────────────────────────────
function Avatar({ uri, name, size = 44, ring = false, ringColor = '#22C55E' }) {
  const init = (name || '?').slice(0, 1).toUpperCase();
  const ringStyle = ring
    ? { borderWidth: 2.5, borderColor: ringColor }
    : { borderWidth: 0 };
  return uri ? (
    <Image source={{ uri }} style={[{ width: size, height: size, borderRadius: size / 2 }, ringStyle]} />
  ) : (
    <View style={[
      { width: size, height: size, borderRadius: size / 2, backgroundColor: '#1A3A1A', alignItems: 'center', justifyContent: 'center' },
      ringStyle,
    ]}>
      <Text style={{ color: '#22C55E', fontSize: size * 0.38, fontWeight: '800' }}>{init}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Kullanıcı kartı
// ─────────────────────────────────────────────────────────────────────────────
function UserCard({ user, onPress, onFollow, myId, style }) {
  const [following,    setFollowing]    = useState(!!user.is_following);
  const [requested,    setRequested]    = useState(!!user.follow_requested);
  const [loading,      setLoading]      = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const isPrivate = user.privacy === 'private';
  const isMe      = user.id === myId;

  const handleFollow = async () => {
    if (isMe || loading) return;
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.93, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1,    duration: 80, useNativeDriver: true }),
    ]).start();
    setLoading(true);
    try {
      if (following) {
        await api.delete(`/users/${user.id}/follow`);
        setFollowing(false); setRequested(false);
        onFollow?.(user.id, false);
      } else {
        await api.post(`/users/${user.id}/follow`);
        if (isPrivate) { setRequested(true); }
        else           { setFollowing(true); }
        onFollow?.(user.id, true);
      }
    } catch {}
    finally { setLoading(false); }
  };

  const btnLabel = following ? 'Takip Ediliyor'
    : requested  ? 'İstek Gönderildi'
    : isPrivate  ? 'İstek Gönder'
    : 'Takip Et';

  const btnIcon = following ? 'checkmark'
    : requested  ? 'time-outline'
    : isPrivate  ? 'lock-closed-outline'
    : 'person-add-outline';

  const btnBg = following ? '#1A1A1A'
    : requested  ? '#1A1A2A'
    : '#0A2A1A';

  const btnBorder = following ? '#2A2A2A'
    : requested  ? '#3B3B6B'
    : '#22C55E';

  const btnColor = following ? '#888'
    : requested  ? '#818CF8'
    : '#22C55E';

  return (
    <TouchableOpacity
      style={[uc.card, style]}
      onPress={() => onPress(user)}
      activeOpacity={0.75}
    >
      {/* Avatar + online indicator */}
      <View style={{ position: 'relative' }}>
        <Avatar uri={user.avatar_url} name={user.display_name || user.username} size={52} />
        {user.is_online && <View style={uc.onlineDot} />}
      </View>

      {/* Bilgi */}
      <View style={uc.info}>
        <View style={uc.nameRow}>
          <Text style={uc.displayName} numberOfLines={1}>
            {user.display_name || user.username}
          </Text>
          {isPrivate && (
            <Ionicons name="lock-closed" size={11} color="#555" style={{ marginLeft: 4 }} />
          )}
          {user.is_verified && (
            <Ionicons name="checkmark-circle" size={13} color="#3B82F6" style={{ marginLeft: 3 }} />
          )}
        </View>
        <Text style={uc.username} numberOfLines={1}>@{user.username}</Text>
        {user.bio ? (
          <Text style={uc.bio} numberOfLines={1}>{user.bio}</Text>
        ) : null}
        {/* Stats */}
        <View style={uc.statsRow}>
          {user.follower_cnt != null && (
            <Text style={uc.stat}>
              <Text style={uc.statNum}>{fmtCount(user.follower_cnt)}</Text> takipçi
            </Text>
          )}
          {user.route_cnt != null && user.route_cnt > 0 && (
            <Text style={uc.stat}>
              <Text style={uc.statNum}>{user.route_cnt}</Text> rota
            </Text>
          )}
        </View>
      </View>

      {/* Takip butonu */}
      {!isMe && (
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <TouchableOpacity
            style={[uc.followBtn, { backgroundColor: btnBg, borderColor: btnBorder }]}
            onPress={handleFollow}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator size="small" color={btnColor} />
              : (
                <>
                  <Ionicons name={btnIcon} size={13} color={btnColor} />
                  <Text style={[uc.followBtnTxt, { color: btnColor }]}>{btnLabel}</Text>
                </>
              )
            }
          </TouchableOpacity>
        </Animated.View>
      )}
    </TouchableOpacity>
  );
}

function fmtCount(n) {
  if (n == null) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const uc = StyleSheet.create({
  card:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: '#111' },
  onlineDot:  { position: 'absolute', bottom: 2, right: 2, width: 11, height: 11, borderRadius: 6, backgroundColor: '#22C55E', borderWidth: 2, borderColor: '#0A0A0A' },
  info:       { flex: 1, gap: 2 },
  nameRow:    { flexDirection: 'row', alignItems: 'center' },
  displayName:{ color: '#fff', fontSize: 14, fontWeight: '700', flexShrink: 1 },
  username:   { color: '#555', fontSize: 12 },
  bio:        { color: '#666', fontSize: 11, lineHeight: 15 },
  statsRow:   { flexDirection: 'row', gap: 10, marginTop: 2 },
  stat:       { color: '#555', fontSize: 11 },
  statNum:    { color: '#ccc', fontWeight: '600' },
  followBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 7, borderWidth: 1, minWidth: 90, justifyContent: 'center' },
  followBtnTxt:{ fontSize: 11, fontWeight: '700' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Son arama chip
// ─────────────────────────────────────────────────────────────────────────────
function RecentChip({ label, onPress, onRemove }) {
  return (
    <View style={rc2.chip}>
      <TouchableOpacity style={rc2.chipInner} onPress={onPress}>
        <Ionicons name="time-outline" size={14} color="#555" />
        <Text style={rc2.chipTxt}>{label}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <Ionicons name="close" size={14} color="#444" />
      </TouchableOpacity>
    </View>
  );
}
const rc2 = StyleSheet.create({
  chip:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 20, paddingLeft: 10, paddingRight: 8, paddingVertical: 7, borderWidth: 0.5, borderColor: '#1C1C1C', gap: 6 },
  chipInner:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipTxt:    { color: '#ccc', fontSize: 13 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton yükleme kartı
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonCard() {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View style={[sk.card, { opacity: anim }]}>
      <View style={sk.avatar} />
      <View style={sk.lines}>
        <View style={sk.line1} />
        <View style={sk.line2} />
      </View>
      <View style={sk.btn} />
    </Animated.View>
  );
}
const sk = StyleSheet.create({
  card:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#1A1A1A' },
  lines:  { flex: 1, gap: 8 },
  line1:  { height: 13, width: '55%', backgroundColor: '#1A1A1A', borderRadius: 6 },
  line2:  { height: 11, width: '35%', backgroundColor: '#141414', borderRadius: 6 },
  btn:    { width: 88, height: 32, backgroundColor: '#1A1A1A', borderRadius: 14 },
});

// ─────────────────────────────────────────────────────────────────────────────
// ANA EKRAN
// ─────────────────────────────────────────────────────────────────────────────
export default function SearchScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { profile } = useAuth();

  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState([]);
  const [suggested,   setSuggested]   = useState([]);
  const [recent,      setRecent]      = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeFilter, setFilter]     = useState('all'); // all | people | routes

  const inputRef    = useRef(null);
  const debounceRef = useRef(null);
  const slideAnim   = useRef(new Animated.Value(20)).current;
  const fadeAnim    = useRef(new Animated.Value(0)).current;

  // ── Önerilen kullanıcılar ─────────────────────────────────────────────────
  useEffect(() => {
    loadSuggested();
    loadRecent();
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

// loadSuggested içinde — önerilen endpoint yok, boş bırak
const loadSuggested = async () => {
  try {
    // Backend'de /users/suggested yok, şimdilik boş
    setSuggested([]);
  } catch {}
};

  const loadRecent = async () => {
    try {
      const raw = await AsyncStorage.getItem(RECENT_KEY);
      setRecent(raw ? JSON.parse(raw) : []);
    } catch {}
  };

  const saveRecent = async (q) => {
    if (!q.trim()) return;
    try {
      const next = [q.trim(), ...recent.filter(r => r !== q.trim())].slice(0, MAX_RECENT);
      setRecent(next);
      await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
  };

  const removeRecent = async (q) => {
    const next = recent.filter(r => r !== q);
    setRecent(next);
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
  };

  const clearAllRecent = async () => {
    setRecent([]);
    await AsyncStorage.removeItem(RECENT_KEY);
  };

  // doSearch içinde — URL'yi düzelt
const doSearch = useCallback(async (q) => {
  if (!q.trim()) { setResults([]); setHasSearched(false); return; }
  setLoading(true); setHasSearched(true);
  try {
    // /users/search/users — doğru endpoint
    const data = await api.get(`/users/search/users?q=${encodeURIComponent(q.trim())}&limit=30`);
    setResults(Array.isArray(data) ? data : data?.users || []);
  } catch {
    setResults([]);
  } finally {
    setLoading(false);
  }
}, []);

  const handleChange = (text) => {
    setQuery(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(text), DEBOUNCE_MS);
  };

  const handleSubmit = () => {
    clearTimeout(debounceRef.current);
    doSearch(query);
    saveRecent(query);
    Keyboard.dismiss();
  };

  const handleRecentPress = (q) => {
    setQuery(q);
    doSearch(q);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    inputRef.current?.focus();
  };

  // ── Kullanıcı profiline git ────────────────────────────────────────────────
  const goToUser = (user) => {
    saveRecent(user.username);
    router.push(`/user/${user.id}`);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const showEmpty   = hasSearched && !loading && results.length === 0;
  const showResults = hasSearched && results.length > 0;
  const showHome    = !hasSearched;

  const ListHeader = () => (
    <View>
      {/* Filtreler */}
      <View style={s.filters}>
        {[
          { key: 'all',    label: 'Tümü'     },
          { key: 'people', label: 'Kişiler'  },
        ].map(f => (
          <TouchableOpacity
            key={f.key}
            style={[s.filterChip, activeFilter === f.key && s.filterActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[s.filterTxt, activeFilter === f.key && { color: '#22C55E', fontWeight: '700' }]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
        <Text style={s.resultCount}>
          {results.length > 0 ? `${results.length} sonuç` : ''}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* ── Arama çubuğu ── */}
      <Animated.View style={[s.searchWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={s.searchBar}>
          <Ionicons name="search-outline" size={18} color="#555" />
          <TextInput
            ref={inputRef}
            style={s.searchInput}
            placeholder="Kullanıcı ara…"
            placeholderTextColor="#333"
            value={query}
            onChangeText={handleChange}
            onSubmitEditing={handleSubmit}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Ionicons name="close-circle" size={17} color="#444" />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* ── İçerik ── */}

      {/* Yükleniyor skeleton */}
      {loading && (
        <View>
          {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
        </View>
      )}

      {/* Sonuç listesi */}
      {showResults && !loading && (
        <FlatList
          data={results}
          keyExtractor={u => u.id}
          ListHeaderComponent={<ListHeader />}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => (
            <UserCard
              user={item}
              myId={profile?.id}
              onPress={goToUser}
            />
          )}
        />
      )}

      {/* Boş durum */}
      {showEmpty && !loading && (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>🔍</Text>
          <Text style={s.emptyTitle}>"{query}" bulunamadı</Text>
          <Text style={s.emptyDesc}>Farklı bir isim veya kullanıcı adı dene.</Text>
        </View>
      )}

      {/* Ana ekran (arama yapılmamış) */}
      {showHome && !loading && (
        <FlatList
          data={suggested}
          keyExtractor={u => u.id}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
          ListHeaderComponent={() => (
            <View>
              {/* Son aramalar */}
              {recent.length > 0 && (
                <View style={s.section}>
                  <View style={s.sectionHeader}>
                    <Text style={s.sectionTitle}>SON ARAMALAR</Text>
                    <TouchableOpacity onPress={clearAllRecent}>
                      <Text style={s.clearAll}>Temizle</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={s.chipRow}>
                    {recent.map(r => (
                      <RecentChip
                        key={r}
                        label={r}
                        onPress={() => handleRecentPress(r)}
                        onRemove={() => removeRecent(r)}
                      />
                    ))}
                  </View>
                </View>
              )}

              {/* Önerilen */}
              <View style={s.section}>
                <Text style={s.sectionTitle}>ÖNERİLEN KİŞİLER</Text>
              </View>
            </View>
          )}
          renderItem={({ item }) => (
            <UserCard
              user={item}
              myId={profile?.id}
              onPress={goToUser}
            />
          )}
          ListEmptyComponent={() => (
            <View style={s.suggestEmpty}>
              <ActivityIndicator color="#22C55E" />
            </View>
          )}
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0A0A0A' },

  // Search bar
  searchWrap:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: '#111' },
  backBtn:      { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  searchBar:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#111', borderRadius: 16, paddingHorizontal: 14, height: 46, borderWidth: 0.5, borderColor: '#1C1C1C' },
  searchInput:  { flex: 1, color: '#fff', fontSize: 15 },

  // Filters
  filters:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 0.5, borderBottomColor: '#111' },
  filterChip:   { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#111', borderRadius: 18, borderWidth: 0.5, borderColor: '#1C1C1C' },
  filterActive: { backgroundColor: '#0A2A1A', borderColor: '#22C55E' },
  filterTxt:    { color: '#555', fontSize: 13 },
  resultCount:  { marginLeft: 'auto', color: '#444', fontSize: 12 },

  // Empty
  empty:        { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyIcon:    { fontSize: 44 },
  emptyTitle:   { color: '#fff', fontSize: 17, fontWeight: '700' },
  emptyDesc:    { color: '#555', fontSize: 14, textAlign: 'center' },

  // Home sections
  section:      { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10 },
  sectionHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: '#444', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  clearAll:     { color: '#22C55E', fontSize: 13 },
  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestEmpty: { paddingTop: 40, alignItems: 'center' },
});