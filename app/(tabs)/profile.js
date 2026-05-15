// ── app/(tabs)/profile.js ────────────────────────────────────────────────────
import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Dimensions, ActivityIndicator, Alert,
  Modal, Pressable, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import useProfile from '../../hooks/useProfile';
import { API_BASE } from '../../constants/api';
import { auth } from '../../src/firebase/config';

const { width } = Dimensions.get('window');
const GRID_SIZE = (width - 4) / 3;
const IMG_SIZE  = (width - 52) / 2;

const BADGES = [
  { icon:'🏔️', label:'Dağcı' }, { icon:'🚴', label:'Bisikletçi' },
  { icon:'⛺', label:'Kampçı' }, { icon:'📸', label:'Fotoğrafçı' },
];

function StatItem({ value, label }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>
        {typeof value === 'number' ? value.toFixed(value > 100 ? 0 : 1) : value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Post seçenekleri modalı ───────────────────────────────────────────────────
function PostOptionsModal({ post, visible, onClose, onDeleted, onEdited }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote]       = useState(post?.user_note || '');
  const [saving, setSaving]   = useState(false);

  const handleDelete = () => {
    Alert.alert('Gönderiyi Sil', 'Bu gönderi kalıcı olarak silinecek. Emin misin?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil', style: 'destructive',
        onPress: async () => {
          try {
            const token = await auth.currentUser?.getIdToken();
            await fetch(`${API_BASE}/social/posts/${post.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
            onClose();
            onDeleted(post.id);
          } catch (e) {
            Alert.alert('Hata', 'Gönderi silinemedi.');
          }
        },
      },
    ]);
  };

  const handleSaveEdit = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      const token  = await auth.currentUser?.getIdToken();
      const params = new URLSearchParams({ user_note: note.trim() });
      await fetch(`${API_BASE}/social/posts/${post.id}?${params}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      onEdited(post.id, note.trim());
      setEditing(false);
      onClose();
    } catch (e) {
      Alert.alert('Hata', 'Gönderi güncellenemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={mo.overlay} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={mo.sheet}>
        <View style={mo.handle} />

        {!editing ? (
          <>
            <Text style={mo.title}>Gönderi Seçenekleri</Text>

            <TouchableOpacity
              style={mo.row}
              onPress={() => { setNote(post?.user_note || ''); setEditing(true); }}
            >
              <View style={[mo.iconWrap, { backgroundColor: '#0A2A1A' }]}>
                <Ionicons name="create-outline" size={20} color="#22C55E" />
              </View>
              <Text style={mo.rowText}>Gönderiyi Düzenle</Text>
              <Ionicons name="chevron-forward" size={18} color="#444" />
            </TouchableOpacity>

            <TouchableOpacity style={mo.row} onPress={handleDelete}>
              <View style={[mo.iconWrap, { backgroundColor: '#2A0A0A' }]}>
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
              </View>
              <Text style={[mo.rowText, { color: '#ef4444' }]}>Gönderiyi Sil</Text>
              <Ionicons name="chevron-forward" size={18} color="#444" />
            </TouchableOpacity>

            <TouchableOpacity style={[mo.row, { borderBottomWidth: 0 }]} onPress={onClose}>
              <Text style={[mo.rowText, { color: '#888', textAlign: 'center', flex: 1 }]}>İptal</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={mo.editHeader}>
              <TouchableOpacity onPress={() => setEditing(false)}>
                <Ionicons name="arrow-back" size={22} color="#fff" />
              </TouchableOpacity>
              <Text style={mo.title}>Düzenle</Text>
              <TouchableOpacity onPress={handleSaveEdit} disabled={saving || !note.trim()}>
                {saving
                  ? <ActivityIndicator color="#22C55E" size="small" />
                  : <Text style={[mo.saveBtn, !note.trim() && { color: '#333' }]}>Kaydet</Text>
                }
              </TouchableOpacity>
            </View>
            <TextInput
              style={mo.editInput}
              value={note}
              onChangeText={setNote}
              multiline maxLength={500}
              placeholder="Gönderi metnini düzenle…"
              placeholderTextColor="#555"
              autoFocus
            />
            <Text style={mo.charCount}>{500 - note.length} karakter kaldı</Text>
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Post grid kartı ───────────────────────────────────────────────────────────
function PostGridCard({ item, onPress, onLongPress }) {
  const hasMedia = item.attachments?.length > 0;
  return (
    <TouchableOpacity
      style={pg.cell}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.85}
    >
      {hasMedia
        ? <Image source={{ uri: item.attachments[0].storage_path }} style={pg.img} resizeMode="cover" />
        : (
          <View style={[pg.img, pg.textCard]}>
            <Text style={pg.textPreview} numberOfLines={4}>{item.user_note || ''}</Text>
          </View>
        )
      }
      {item.attachments?.length > 1 && (
        <View style={pg.multiIcon}>
          <Ionicons name="copy-outline" size={14} color="#fff" />
        </View>
      )}
      <View style={pg.overlay}>
        <Ionicons name="heart" size={12} color="#fff" />
        <Text style={pg.overlayText}>{item.like_cnt || 0}</Text>
      </View>
      {/* Uzun bas ipucu */}
      <View style={pg.editHint}>
        <Ionicons name="ellipsis-horizontal" size={16} color="rgba(255,255,255,0.7)" />
      </View>
    </TouchableOpacity>
  );
}

// ── Kaydedilen post kartı ─────────────────────────────────────────────────────
function SavedPostCard({ item, onPress }) {
  const initials = (item.display_name || item.username || '?').slice(0, 1).toUpperCase();
  return (
    <TouchableOpacity style={sc.card} onPress={onPress} activeOpacity={0.8}>
      {item.attachments?.length > 0 && (
        <Image source={{ uri: item.attachments[0].storage_path }} style={sc.thumb} resizeMode="cover" />
      )}
      <View style={sc.body}>
        <View style={sc.userRow}>
          {item.avatar_url
            ? <Image source={{ uri: item.avatar_url }} style={sc.avatar} />
            : <View style={[sc.avatar, sc.avatarFallback]}><Text style={sc.avatarText}>{initials}</Text></View>
          }
          <View>
            <Text style={sc.username}>{item.display_name || item.username || 'Kullanıcı'}</Text>
            <Text style={sc.date}>
              {item.post_created_at
                ? new Date(item.post_created_at).toLocaleDateString('tr-TR', { day:'numeric', month:'short' })
                : ''}
            </Text>
          </View>
        </View>
        {item.user_note ? <Text style={sc.note} numberOfLines={2}>{item.user_note}</Text> : null}
        <View style={sc.stats}>
          <View style={sc.stat}>
            <Ionicons name="heart-outline" size={13} color="#888" />
            <Text style={sc.statText}>{item.like_cnt || 0}</Text>
          </View>
          <View style={sc.stat}>
            <Ionicons name="chatbubble-outline" size={13} color="#888" />
            <Text style={sc.statText}>{item.comment_cnt || 0}</Text>
          </View>
          <View style={[sc.stat, { marginLeft:'auto' }]}>
            <Ionicons name="bookmark" size={13} color="#22C55E" />
            <Text style={[sc.statText, { color:'#22C55E' }]}>Kaydedildi</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Ana ekran ─────────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    profile, stats, routes, events, saved, posts, adminPerms,
    loading, activeTab, setActiveTab, totalKm, logout, reload,
  } = useProfile();

  const [selectedPost, setSelectedPost] = useState(null);
  const [localPosts, setLocalPosts]     = useState([]);

  // localPosts'u posts ile senkronize et
  React.useEffect(() => { setLocalPosts(posts || []); }, [posts]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const handleDeleted = (postId) => {
    setLocalPosts(prev => prev.filter(p => p.id !== postId));
  };

  const handleEdited = (postId, newNote) => {
    setLocalPosts(prev => prev.map(p => p.id === postId ? { ...p, user_note: newNote } : p));
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop:insets.top, alignItems:'center', justifyContent:'center' }]}>
        <ActivityIndicator color="#22C55E" size="large" />
      </View>
    );
  }

  const initials    = profile?.display_name?.slice(0,1).toUpperCase() || '?';
  const followerCnt = stats?.follower_cnt || 0;
  const routeCnt    = stats?.route_cnt    || routes.length;

  return (
    <ScrollView style={[styles.container, { paddingTop:insets.top }]} showsVerticalScrollIndicator={false}>

      {/* Başlık */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profil</Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <TouchableOpacity onPress={() => Alert.alert('QR Kod', 'Yakında!')} style={styles.headerBtn}>
            <Ionicons name="qr-code-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/settings')} style={styles.headerBtn}>
            <Ionicons name="settings-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Profil bilgisi */}
      <View style={styles.profileSection}>
        <View style={styles.avatarWrap}>
          {profile?.avatar_url
            ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            : <View style={[styles.avatar, styles.avatarInitials]}><Text style={styles.avatarText}>{initials}</Text></View>
          }
          {adminPerms?.is_admin && (
            <View style={styles.adminBadge}><Text style={{ fontSize:10 }}>⚙️</Text></View>
          )}
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.displayName}>{profile?.display_name || 'Kullanıcı'}</Text>
          <Text style={styles.username}>@{profile?.username || 'movo_kullanici'}</Text>
          {profile?.bio
            ? <Text style={styles.bio}>{profile.bio}</Text>
            : <TouchableOpacity onPress={() => router.push('/profile/edit')}>
                <Text style={[styles.bio, { color:'#22C55E' }]}>+ Biyografi ekle</Text>
              </TouchableOpacity>
          }
        </View>
      </View>

      {/* İstatistikler */}
      <View style={styles.stats}>
        <StatItem value={localPosts.length} label="Gönderi" />
        <View style={styles.statDivider} />
        <StatItem value={followerCnt}       label="Takipçi" />
        <View style={styles.statDivider} />
        <StatItem value={routeCnt}          label="Rota"    />
        <View style={styles.statDivider} />
        <StatItem value={totalKm}           label="Km"      />
      </View>

      {/* Aksiyon butonları */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.editBtn} onPress={() => router.push('/profile/edit')}>
          <Ionicons name="create-outline" size={16} color="#fff" />
          <Text style={styles.editText}>Profili Düzenle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareBtn} onPress={() => Alert.alert('Paylaş', 'Yakında!')}>
          <Ionicons name="share-outline" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Katılım skoru */}
      <View style={styles.scoreCard}>
        <Text style={styles.scoreLabel}>Katılım Skoru</Text>
        <Text style={styles.scoreValue}>{profile?.participation_score?.toLocaleString('tr-TR') || '0'}</Text>
        <Text style={styles.scoreSub}>Trust: {profile?.trust_score?.toFixed(1) || '1.0'}</Text>
      </View>

      {/* Sekmeler */}
      <View style={styles.tabs}>
        {['gönderiler', 'rotalar', 'kaydedilenler'].map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Gönderiler ──────────────────────────────────────────────────── */}
      {activeTab === 'gönderiler' && (
        <>
          {localPosts.length === 0
            ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📸</Text>
                <Text style={styles.emptyText}>Henüz gönderi yok</Text>
              </View>
            )
            : (
              <>
                <Text style={styles.hintText}>Düzenlemek için uzun bas</Text>
                <View style={pg.grid}>
                  {localPosts.map(p => (
                    <PostGridCard
                      key={p.id}
                      item={p}
                      onPress={() => router.push(`/post/${p.id}`)}
                      onLongPress={() => setSelectedPost(p)}
                    />
                  ))}
                </View>
              </>
            )
          }
        </>
      )}

      {/* ── Rotalar ─────────────────────────────────────────────────────── */}
      {activeTab === 'rotalar' && (
        <View style={styles.grid}>
          {routes.map(r => (
            <TouchableOpacity key={r.id} style={styles.gridItem} onPress={() => router.push(`/route/${r.id}`)}>
              <View style={styles.gridImg}>
                <Text style={styles.gridTitle} numberOfLines={2}>{r.title || 'Rota'}</Text>
                <Text style={styles.gridMeta}>
                  {r.distance_m ? `${(r.distance_m/1000).toFixed(1)}km` : ''}
                  {r.created_at ? ` · ${new Date(r.created_at).toLocaleDateString('tr-TR', { day:'numeric', month:'short' })}` : ''}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
          {routes.length === 0 && <Text style={styles.emptyText}>Henüz rota yok</Text>}
        </View>
      )}

      {/* ── Kaydedilenler ───────────────────────────────────────────────── */}
      {activeTab === 'kaydedilenler' && (
        <View style={styles.listSection}>
          {saved.length === 0
            ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🔖</Text>
                <Text style={styles.emptyText}>Kaydedilen içerik yok</Text>
              </View>
            )
            : saved.map(s => {
                if (s.target_type !== 'post') return null;
                return (
                  <SavedPostCard
                    key={`${s.target_type}-${s.target_id}`}
                    item={s}
                    onPress={() => router.push(`/post/${s.target_id}`)}
                  />
                );
              })
          }
        </View>
      )}

      {/* Ayarlar butonu */}
      <TouchableOpacity style={styles.settingsBtn} onPress={() => router.push('/settings')}>
        <Ionicons name="settings-outline" size={18} color="#888" />
        <Text style={styles.settingsBtnText}>Ayarlar</Text>
        <Ionicons name="chevron-forward" size={16} color="#333" />
      </TouchableOpacity>

      <Text style={styles.version}>MOVO v1.0.0 · Yapay Zeka Destekli Keşif</Text>
      <View style={{ height:100 }} />

      {/* Post seçenekleri modalı */}
      {selectedPost && (
        <PostOptionsModal
          post={selectedPost}
          visible={!!selectedPost}
          onClose={() => setSelectedPost(null)}
          onDeleted={handleDeleted}
          onEdited={handleEdited}
        />
      )}
    </ScrollView>
  );
}

// ── Stiller ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:      { flex:1, backgroundColor:'#0D0D0D' },
  header:         { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:20, paddingBottom:16 },
  headerTitle:    { color:'#fff', fontSize:22, fontWeight:'700' },
  profileSection: { flexDirection:'row', alignItems:'flex-start', paddingHorizontal:20, marginBottom:16, gap:14 },
  avatarWrap:     { position:'relative' },
  avatar:         { width:70, height:70, borderRadius:35 },
  avatarInitials: { backgroundColor:'#22C55E', alignItems:'center', justifyContent:'center' },
  avatarText:     { color:'#fff', fontSize:28, fontWeight:'700' },
  adminBadge:     { position:'absolute', bottom:0, right:0, backgroundColor:'#1A1A1A', borderRadius:8, padding:2, borderWidth:0.5, borderColor:'#22C55E' },
  profileInfo:    { flex:1 },
  displayName:    { color:'#fff', fontSize:18, fontWeight:'700' },
  username:       { color:'#888', fontSize:14, marginTop:2 },
  bio:            { color:'#aaa', fontSize:13, marginTop:6, lineHeight:18 },
  stats:          { flexDirection:'row', justifyContent:'space-around', alignItems:'center', backgroundColor:'#111', marginHorizontal:20, borderRadius:14, padding:16, marginBottom:16, borderWidth:0.5, borderColor:'#2A2A2A' },
  statItem:       { alignItems:'center', flex:1 },
  statValue:      { color:'#fff', fontSize:18, fontWeight:'700' },
  statLabel:      { color:'#888', fontSize:11, marginTop:2 },
  statDivider:    { width:0.5, height:30, backgroundColor:'#2A2A2A' },
  actions:        { flexDirection:'row', gap:10, paddingHorizontal:20, marginBottom:20 },
  editBtn:        { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, backgroundColor:'#1A1A1A', borderRadius:12, paddingVertical:10, borderWidth:0.5, borderColor:'#2A2A2A' },
  editText:       { color:'#fff', fontSize:14, fontWeight:'500' },
  shareBtn:       { width:44, height:44, backgroundColor:'#1A1A1A', borderRadius:12, alignItems:'center', justifyContent:'center', borderWidth:0.5, borderColor:'#2A2A2A' },
  scoreCard:      { marginHorizontal:20, backgroundColor:'#111', borderRadius:14, padding:16, marginBottom:20, borderWidth:0.5, borderColor:'#2A2A2A' },
  scoreLabel:     { color:'#888', fontSize:12 },
  scoreValue:     { color:'#22C55E', fontSize:28, fontWeight:'700', marginTop:2 },
  scoreSub:       { color:'#666', fontSize:12, marginTop:2 },
  tabs:           { flexDirection:'row', marginHorizontal:20, marginBottom:4, backgroundColor:'#111', borderRadius:12, padding:4 },
  tab:            { flex:1, paddingVertical:8, alignItems:'center', borderRadius:10 },
  tabActive:      { backgroundColor:'#22C55E' },
  tabText:        { color:'#888', fontSize:12, fontWeight:'500' },
  tabTextActive:  { color:'#fff' },
  hintText:       { color:'#444', fontSize:11, textAlign:'center', paddingVertical:8 },
  grid:           { flexDirection:'row', flexWrap:'wrap', paddingHorizontal:20, gap:12, marginBottom:20 },
  gridItem:       { width:IMG_SIZE, height:IMG_SIZE, borderRadius:12, overflow:'hidden' },
  gridImg:        { flex:1, backgroundColor:'#1A2E1A', padding:12, justifyContent:'flex-end' },
  gridTitle:      { color:'#fff', fontSize:13, fontWeight:'600' },
  gridMeta:       { color:'#22C55E', fontSize:11, marginTop:2 },
  listSection:    { paddingHorizontal:20, marginBottom:20 },
  emptyState:     { alignItems:'center', paddingVertical:40, width:'100%' },
  emptyIcon:      { fontSize:40, marginBottom:10 },
  emptyText:      { color:'#555', fontSize:14, textAlign:'center', padding:20 },
  section:        { paddingHorizontal:20, marginBottom:20 },
  sectionTitle:   { color:'#fff', fontSize:16, fontWeight:'600', marginBottom:12 },
  settingRow:     { flexDirection:'row', alignItems:'center', gap:12, paddingVertical:14, borderBottomWidth:0.5, borderBottomColor:'#111' },
  settingLabel:   { flex:1, color:'#ccc', fontSize:15 },
  version:        { textAlign:'center', color:'#333', fontSize:12, marginBottom:8 },
  headerBtn:      { width:36, height:36, alignItems:'center', justifyContent:'center' },
  settingsBtn:    { flexDirection:'row', alignItems:'center', gap:10, marginHorizontal:20, marginBottom:20, backgroundColor:'#111', borderRadius:14, padding:14, borderWidth:0.5, borderColor:'#1C1C1C' },
  settingsBtnText:{ flex:1, color:'#ccc', fontSize:15 },
});

const pg = StyleSheet.create({
  grid:        { flexDirection:'row', flexWrap:'wrap', gap:2, marginBottom:20 },
  cell:        { width:GRID_SIZE, height:GRID_SIZE, position:'relative' },
  img:         { width:'100%', height:'100%' },
  textCard:    { backgroundColor:'#1A2E1A', padding:8, justifyContent:'center' },
  textPreview: { color:'#aaa', fontSize:11, lineHeight:16 },
  multiIcon:   { position:'absolute', top:6, right:6 },
  editHint:    { position:'absolute', top:6, left:6 },
  overlay:     { position:'absolute', bottom:4, left:6, flexDirection:'row', alignItems:'center', gap:3 },
  overlayText: { color:'#fff', fontSize:11, fontWeight:'600', textShadowColor:'rgba(0,0,0,0.8)', textShadowOffset:{width:0,height:1}, textShadowRadius:3 },
});

const sc = StyleSheet.create({
  card:           { backgroundColor:'#111', borderRadius:16, marginBottom:12, overflow:'hidden', borderWidth:0.5, borderColor:'#1C1C1C' },
  thumb:          { width:'100%', height:180 },
  body:           { padding:12 },
  userRow:        { flexDirection:'row', alignItems:'center', gap:8, marginBottom:8 },
  avatar:         { width:28, height:28, borderRadius:14 },
  avatarFallback: { backgroundColor:'#1A3A1A', alignItems:'center', justifyContent:'center' },
  avatarText:     { color:'#22C55E', fontSize:12, fontWeight:'700' },
  username:       { color:'#fff', fontSize:13, fontWeight:'600' },
  date:           { color:'#555', fontSize:11 },
  note:           { color:'#ccc', fontSize:14, lineHeight:20, marginBottom:8 },
  stats:          { flexDirection:'row', alignItems:'center', gap:12 },
  stat:           { flexDirection:'row', alignItems:'center', gap:4 },
  statText:       { color:'#888', fontSize:12 },
});

const mo = StyleSheet.create({
  overlay:    { flex:1, backgroundColor:'rgba(0,0,0,0.5)' },
  sheet:      { backgroundColor:'#111', borderTopLeftRadius:20, borderTopRightRadius:20, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  handle:     { width:36, height:4, backgroundColor:'#333', borderRadius:2, alignSelf:'center', marginTop:10, marginBottom:4 },
  title:      { color:'#fff', fontSize:16, fontWeight:'700', textAlign:'center', paddingVertical:12 },
  row:        { flexDirection:'row', alignItems:'center', gap:14, paddingHorizontal:20, paddingVertical:16, borderBottomWidth:0.5, borderBottomColor:'#1C1C1C' },
  iconWrap:   { width:38, height:38, borderRadius:19, alignItems:'center', justifyContent:'center' },
  rowText:    { flex:1, color:'#fff', fontSize:15, fontWeight:'500' },
  editHeader: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, paddingVertical:14, borderBottomWidth:0.5, borderBottomColor:'#1C1C1C' },
  saveBtn:    { color:'#22C55E', fontSize:15, fontWeight:'700' },
  editInput:  { color:'#fff', fontSize:15, lineHeight:22, padding:16, minHeight:120, textAlignVertical:'top' },
  charCount:  { color:'#444', fontSize:12, textAlign:'right', paddingHorizontal:16, paddingBottom:10 },
});