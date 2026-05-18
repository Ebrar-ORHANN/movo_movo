// ── app/messages/index.js ──────────────────────────────────────────────────────
// Mesaj kutusuna geliştirilmiş — yeni sohbet başlat (kullanıcı ara),
// okunmamış sayaç, online göstergesi, swipe-to-delete

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Image, TextInput, Animated,
  Alert, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { getRooms, getUnreadCount, getOrCreateRoom } from '../../services/messageService';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const DEBOUNCE_MS = 350;

// ─────────────────────────────────────────────────────────────────────────────
// Zaman formatlama
// ─────────────────────────────────────────────────────────────────────────────
function timeLabel(dateStr) {
  if (!dateStr) return '';
  const d    = new Date(dateStr);
  const now  = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60)    return 'az önce';
  if (diff < 3600)  return `${Math.floor(diff / 60)}dk`;
  if (diff < 86400) return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (diff < 604800) {
    const days = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
    return days[d.getDay()];
  }
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Avatar
// ─────────────────────────────────────────────────────────────────────────────
function Avatar({ uri, name, size = 50, online = false }) {
  const init = (name || '?').slice(0, 1).toUpperCase();
  return (
    <View style={{ position: 'relative', width: size, height: size }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <View style={{
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: '#1A3A1A', alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ color: '#22C55E', fontSize: size * 0.38, fontWeight: '800' }}>{init}</Text>
        </View>
      )}
      {online && (
        <View style={{
          position: 'absolute', bottom: 2, right: 2,
          width: 12, height: 12, borderRadius: 6,
          backgroundColor: '#22C55E', borderWidth: 2, borderColor: '#0A0A0A',
        }} />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sohbet satırı
// ─────────────────────────────────────────────────────────────────────────────
function RoomRow({ item, onPress }) {
  const hasUnread = (item.unread_count || 0) > 0;
  const slideX    = useRef(new Animated.Value(0)).current;

  return (
    <TouchableOpacity
      style={rr.row}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <Avatar
        uri={item.other_avatar_url}
        name={item.other_name || item.other_username}
        size={52}
        online={item.other_online}
      />

      <View style={rr.body}>
        <View style={rr.topRow}>
          <Text style={[rr.name, hasUnread && { color: '#fff', fontWeight: '700' }]} numberOfLines={1}>
            {item.other_name || item.other_username || 'Kullanıcı'}
          </Text>
          <Text style={[rr.time, hasUnread && { color: '#22C55E' }]}>
            {timeLabel(item.last_message_at)}
          </Text>
        </View>
        <View style={rr.bottomRow}>
          <Text
            style={[rr.preview, hasUnread && { color: '#ccc', fontWeight: '500' }]}
            numberOfLines={1}
          >
            {item.last_message_preview || '…'}
          </Text>
          {hasUnread && (
            <View style={rr.badge}>
              <Text style={rr.badgeTxt}>
                {item.unread_count > 99 ? '99+' : item.unread_count}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
const rr = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#0F0F0F' },
  body:      { flex: 1, gap: 5 },
  topRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name:      { color: '#ccc', fontSize: 15, fontWeight: '500', flex: 1, marginRight: 8 },
  time:      { color: '#444', fontSize: 12 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  preview:   { color: '#444', fontSize: 13, flex: 1 },
  badge:     { backgroundColor: '#22C55E', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeTxt:  { color: '#fff', fontSize: 11, fontWeight: '700' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Yeni sohbet — kullanıcı arama
// ─────────────────────────────────────────────────────────────────────────────
function NewChatSearch({ onSelect, onClose }) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounce = useRef(null);

  const search = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await api.get(`/users/search?q=${encodeURIComponent(q)}&limit=20`);
      setResults(Array.isArray(data) ? data : data?.users || []);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  return (
    <View style={nc.container}>
      {/* Başlık */}
      <View style={nc.header}>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={nc.title}>Yeni Mesaj</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Arama */}
      <View style={nc.searchBar}>
        <Ionicons name="search-outline" size={16} color="#555" />
        <TextInput
          style={nc.input}
          placeholder="Kullanıcı ara…"
          placeholderTextColor="#333"
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            clearTimeout(debounce.current);
            debounce.current = setTimeout(() => search(t), DEBOUNCE_MS);
          }}
          autoFocus
          autoCapitalize="none"
        />
        {loading && <ActivityIndicator size="small" color="#555" />}
      </View>

      {/* Sonuçlar */}
      <FlatList
        data={results}
        keyExtractor={u => u.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          query.length > 0 && !loading ? (
            <View style={nc.empty}>
              <Text style={nc.emptyTxt}>Kullanıcı bulunamadı</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={nc.resultRow} onPress={() => onSelect(item)} activeOpacity={0.75}>
            <Avatar uri={item.avatar_url} name={item.display_name || item.username} size={44} online={item.is_online} />
            <View style={{ flex: 1 }}>
              <Text style={nc.resultName}>{item.display_name || item.username}</Text>
              <Text style={nc.resultUser}>@{item.username}</Text>
            </View>
            <Ionicons name="chatbubble-outline" size={18} color="#22C55E" />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
const nc = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#0A0A0A' },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#111' },
  title:      { color: '#fff', fontSize: 16, fontWeight: '700' },
  searchBar:  { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 14, backgroundColor: '#111', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 0.5, borderColor: '#1C1C1C' },
  input:      { flex: 1, color: '#fff', fontSize: 15 },
  resultRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#111' },
  resultName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  resultUser: { color: '#555', fontSize: 13, marginTop: 2 },
  empty:      { alignItems: 'center', paddingTop: 40 },
  emptyTxt:   { color: '#444', fontSize: 14 },
});

// ─────────────────────────────────────────────────────────────────────────────
// ANA EKRAN
// ─────────────────────────────────────────────────────────────────────────────
export default function MessagesScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { profile } = useAuth();

  const [rooms,       setRooms]       = useState([]);
  const [unread,      setUnread]      = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [newChat,     setNewChat]     = useState(false);
  const [startingDM,  setStartingDM]  = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const [r, u] = await Promise.all([getRooms(), getUnreadCount()]);
      setRooms(Array.isArray(r) ? r : []);
      setUnread(u?.unread_count || 0);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleStartDM = async (user) => {
    setNewChat(false);
    setStartingDM(true);
    try {
      const room = await getOrCreateRoom(user.id);
      router.push(`/messages/${room.id}`);
    } catch { Alert.alert('Hata', 'Sohbet başlatılamadı.'); }
    finally { setStartingDM(false); }
  };

  // ── Yeni sohbet ekranı (modal benzeri tam ekran) ───────────────────────────
  if (newChat) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <NewChatSearch
          onSelect={handleStartDM}
          onClose={() => setNewChat(false)}
        />
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={s.title}>Mesajlar</Text>
          {unread > 0 && (
            <Text style={s.unreadSub}>{unread} okunmamış mesaj</Text>
          )}
        </View>

        {/* Yeni mesaj butonu */}
        <TouchableOpacity
          style={s.newBtn}
          onPress={() => setNewChat(true)}
          disabled={startingDM}
        >
          {startingDM
            ? <ActivityIndicator size="small" color="#22C55E" />
            : <Ionicons name="create-outline" size={22} color="#22C55E" />
          }
        </TouchableOpacity>
      </View>

      {/* ── Liste ── */}
      {loading ? (
        <View style={s.loadWrap}>
          {[1, 2, 3, 4].map(i => (
            <View key={i} style={s.skeleton}>
              <View style={s.skelAvatar} />
              <View style={s.skelLines}>
                <View style={s.skelLine1} />
                <View style={s.skelLine2} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={r => r.id}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="#22C55E"
              colors={['#22C55E']}
            />
          }
          ListEmptyComponent={() => (
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <Ionicons name="chatbubbles-outline" size={44} color="#2A2A2A" />
              </View>
              <Text style={s.emptyTitle}>Henüz mesaj yok</Text>
              <Text style={s.emptyDesc}>Birine mesaj atarak başla</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => setNewChat(true)}>
                <Ionicons name="create-outline" size={16} color="#fff" />
                <Text style={s.emptyBtnTxt}>Yeni Mesaj</Text>
              </TouchableOpacity>
            </View>
          )}
          renderItem={({ item }) => (
            <RoomRow item={item} onPress={r => router.push(`/messages/${r.id}`)} />
          )}
        />
      )}

      {/* ── FAB (boşluk olmasa da görünür) ── */}
      {rooms.length > 0 && (
        <TouchableOpacity
          style={[s.fab, { bottom: insets.bottom + 24 }]}
          onPress={() => setNewChat(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="create" size={22} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0A0A0A' },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 12, gap: 4, borderBottomWidth: 0.5, borderBottomColor: '#111' },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title:       { color: '#fff', fontSize: 20, fontWeight: '800' },
  unreadSub:   { color: '#22C55E', fontSize: 12, marginTop: 1 },
  newBtn:      { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  // Skeleton
  loadWrap:    { paddingTop: 8 },
  skeleton:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  skelAvatar:  { width: 52, height: 52, borderRadius: 26, backgroundColor: '#111' },
  skelLines:   { flex: 1, gap: 8 },
  skelLine1:   { height: 14, width: '55%', backgroundColor: '#111', borderRadius: 7 },
  skelLine2:   { height: 12, width: '75%', backgroundColor: '#0D0D0D', borderRadius: 6 },

  // Empty
  empty:       { alignItems: 'center', paddingTop: 100, gap: 12 },
  emptyIcon:   { width: 88, height: 88, borderRadius: 44, backgroundColor: '#0D0D0D', alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: '#1C1C1C' },
  emptyTitle:  { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptyDesc:   { color: '#555', fontSize: 14 },
  emptyBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#22C55E', borderRadius: 20, paddingHorizontal: 22, paddingVertical: 12, marginTop: 8 },
  emptyBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // FAB
  fab:         { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center', shadowColor: '#22C55E', shadowOpacity: 0.45, shadowRadius: 10, elevation: 8 },
});