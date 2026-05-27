// ── app/(tabs)/feed.js ───────────────────────────────────────────────────────
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ActivityIndicator, RefreshControl, Dimensions, Pressable,
  Animated, Modal, TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import useFeed from '../../hooks/useFeed';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { getComments, addComment } from '../../services/feedService';
import { StoryBar } from '../../components/stories/Stories';
import RoutePostCard from '../../components/RoutePostCard';
import { API_BASE } from '../../constants/api';
import { auth } from '../../src/firebase/config';

const { width } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// Yardımcı
// ─────────────────────────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)    return 'az önce';
  if (diff < 3600)  return `${Math.floor(diff / 60)}dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}s`;
  return `${Math.floor(diff / 86400)}g`;
}

function Avatar({ uri, name, size = 36 }) {
  const initial = (name || '?').slice(0, 1).toUpperCase();
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: '#1A3A1A', alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: '#22C55E', fontSize: size * 0.4, fontWeight: '700' }}>{initial}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Medya (fotoğraf/video)
// ─────────────────────────────────────────────────────────────────────────────
function PostMedia({ attachments }) {
  const [activeIdx, setActiveIdx] = useState(0);
  if (!attachments?.length) return null;
  return (
    <View style={{ marginTop: 6 }}>
      <FlatList
        data={attachments}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e =>
          setActiveIdx(Math.round(e.nativeEvent.contentOffset.x / width))
        }
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <Image
            source={{ uri: item.storage_path || item.url }}
            style={{ width, height: width * 0.75, resizeMode: 'cover' }}
          />
        )}
      />
      {attachments.length > 1 && (
        <View style={s.dots}>
          {attachments.map((_, i) => (
            <View key={i} style={[s.dot, i === activeIdx && s.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Post seçenekleri modalı
// ─────────────────────────────────────────────────────────────────────────────
function PostOptionsModal({ post, isOwn, visible, onClose, onDeleted, onEdited, t }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote]       = useState(post?.user_note || '');
  const [saving, setSaving]   = useState(false);

  const handleDelete = () => {
    Alert.alert(t('deletePost'), t('deletePostConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive',
        onPress: async () => {
          try {
            const token = await auth.currentUser?.getIdToken();
            await fetch(`${API_BASE}/social/posts/${post.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
            onClose(); onDeleted(post.id);
          } catch { Alert.alert(t('error'), ''); }
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
    } catch { Alert.alert(t('error'), ''); }
    finally { setSaving(false); }
  };

  const handleReport = () => {
    Alert.alert(t('report'), '', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('report'), style: 'destructive',
        onPress: async () => {
          try {
            const token = await auth.currentUser?.getIdToken();
            await fetch(
              `${API_BASE}/social/reports?target_type=post&target_id=${post.id}&reason=inappropriate`,
              { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
            );
            onClose();
          } catch {}
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.optionsSheet}
      >
        <View style={s.sheetHandle} />
        {!editing ? (
          <>
            <Text style={s.sheetTitle}>{t('postOptions')}</Text>
            {isOwn ? (
              <>
                <TouchableOpacity style={s.optRow}
                  onPress={() => { setNote(post?.user_note || ''); setEditing(true); }}>
                  <View style={[s.optIcon, { backgroundColor: '#0A2A1A' }]}>
                    <Ionicons name="create-outline" size={20} color="#22C55E" />
                  </View>
                  <Text style={s.optText}>{t('editPost')}</Text>
                  <Ionicons name="chevron-forward" size={18} color="#444" />
                </TouchableOpacity>
                <TouchableOpacity style={s.optRow} onPress={handleDelete}>
                  <View style={[s.optIcon, { backgroundColor: '#2A0A0A' }]}>
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </View>
                  <Text style={[s.optText, { color: '#ef4444' }]}>{t('deletePost')}</Text>
                  <Ionicons name="chevron-forward" size={18} color="#444" />
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={s.optRow} onPress={handleReport}>
                <View style={[s.optIcon, { backgroundColor: '#2A1A0A' }]}>
                  <Ionicons name="flag-outline" size={20} color="#f97316" />
                </View>
                <Text style={[s.optText, { color: '#f97316' }]}>{t('report')}</Text>
                <Ionicons name="chevron-forward" size={18} color="#444" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.optRow, { borderBottomWidth: 0 }]} onPress={onClose}>
              <Text style={[s.optText, { color: '#888', textAlign: 'center', flex: 1 }]}>
                {t('cancel')}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={s.editHeader}>
              <TouchableOpacity onPress={() => setEditing(false)}>
                <Ionicons name="arrow-back" size={22} color="#fff" />
              </TouchableOpacity>
              <Text style={s.sheetTitle}>{t('edit')}</Text>
              <TouchableOpacity onPress={handleSaveEdit} disabled={saving || !note.trim()}>
                {saving
                  ? <ActivityIndicator color="#22C55E" size="small" />
                  : <Text style={[s.saveBtn, !note.trim() && { color: '#333' }]}>{t('save')}</Text>
                }
              </TouchableOpacity>
            </View>
            <TextInput
              style={s.editInput}
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={500}
              placeholderTextColor="#555"
              autoFocus
            />
            <Text style={s.charCount}>{500 - note.length}</Text>
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Yorum modalı
// ─────────────────────────────────────────────────────────────────────────────
function CommentsModal({ postId, visible, onClose, onCommentAdded, t }) {
  const [comments, setComments] = useState([]);
  const [text, setText]         = useState('');
  const [sending, setSending]   = useState(false);
  const [loadingC, setLoadingC] = useState(false);
  const { profile } = useAuth();

  React.useEffect(() => {
    if (visible && postId) {
      setLoadingC(true);
      getComments('post', postId)
        .then(d => setComments(d?.comments || d || []))
        .catch(() => {})
        .finally(() => setLoadingC(false));
    }
  }, [visible, postId]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await addComment('post', postId, text.trim(), null);
      setText('');
      onCommentAdded?.();
      const d = await getComments('post', postId);
      setComments(d?.comments || d || []);
    } catch (e) { Alert.alert(t('error'), e.message); }
    finally { setSending(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.commentSheet}
      >
        <View style={s.sheetHandle} />
        <Text style={s.sheetTitle}>{t('comments')}</Text>
        {loadingC ? (
          <ActivityIndicator color="#22C55E" style={{ marginTop: 20 }} />
        ) : (
          <FlatList
            data={comments}
            keyExtractor={c => c.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
            ListEmptyComponent={
              <Text style={s.emptyComments}>{t('noComments')}</Text>
            }
            renderItem={({ item }) => (
              <View style={s.commentRow}>
                <Avatar uri={item.avatar_url} name={item.display_name || item.username} size={30} />
                <View style={s.commentBubble}>
                  <Text style={s.commentUser}>{item.display_name || item.username}</Text>
                  <Text style={s.commentBody}>{item.body}</Text>
                </View>
              </View>
            )}
          />
        )}
        <View style={s.commentInput}>
          <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={32} />
          <TextInput
            style={s.commentBox}
            placeholder={t('writeComment')}
            placeholderTextColor="#555"
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
          />
          <TouchableOpacity onPress={send} disabled={!text.trim() || sending} style={s.sendBtn}>
            {sending
              ? <ActivityIndicator color="#22C55E" size="small" />
              : <Ionicons name="send" size={20} color={text.trim() ? '#22C55E' : '#333'} />
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Post kartı
// ─────────────────────────────────────────────────────────────────────────────
const PostCard = React.memo(({ item, onLike, onSave, onComment, onOptions }) => {
  const likeAnim = useRef(new Animated.Value(1)).current;
  const router   = useRouter();

  const handleLike = () => {
    Animated.sequence([
      Animated.timing(likeAnim, { toValue: 1.4, duration: 100, useNativeDriver: true }),
      Animated.timing(likeAnim, { toValue: 1,   duration: 100, useNativeDriver: true }),
    ]).start();
    onLike(item.id, !!item.liked);
  };

  // route_data var mı ve geçerli mi?
  const hasRoute = !!(
    item.route_data &&
    item.route_data.id &&
    (item.route_data.stops?.length > 0)
  );

  return (
    <View style={s.card}>
      {/* ── Başlık ── */}
      <View style={s.cardHeader}>
        <TouchableOpacity
          style={s.cardUser}
          onPress={() => router.push(`/user/${item.user_id}`)}
          activeOpacity={0.7}
        >
          <Avatar uri={item.avatar_url} name={item.display_name || item.username} size={38} />
          <View style={{ marginLeft: 10 }}>
            <Text style={s.cardName}>{item.display_name || item.username}</Text>
            <Text style={s.cardTime}>@{item.username} · {timeAgo(item.created_at)}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={s.moreBtn} onPress={() => onOptions(item)}>
          <Ionicons name="ellipsis-horizontal" size={20} color="#555" />
        </TouchableOpacity>
      </View>

      {/* ── Not ── */}
      {item.user_note ? (
        <Text style={s.cardNote}>{item.user_note}</Text>
      ) : null}

      {/* ── İçerik: Rota haritası VEYA fotoğraf ── */}
      {hasRoute ? (
        <View style={s.routeCardWrap}>
          <RoutePostCard route={item.route_data} postId={item.id} />
          {/* Rota badge */}
          <View style={s.routeBadge}>
            <Ionicons name="map-outline" size={12} color="#22C55E" />
            <Text style={s.routeBadgeTxt}>
              {item.route_data.title || 'Rota'} · {item.route_data.stops?.length || 0} durak
            </Text>
          </View>
        </View>
      ) : (
        <PostMedia attachments={item.attachments} />
      )}

      {/* ── Aksiyonlar ── */}
      <View style={s.cardActions}>
        <View style={s.actionLeft}>
          {/* Beğen */}
          <TouchableOpacity onPress={handleLike} style={s.actionBtn}>
            <Animated.View style={{ transform: [{ scale: likeAnim }] }}>
              <Ionicons
                name={item.liked ? 'heart' : 'heart-outline'}
                size={24}
                color={item.liked ? '#ef4444' : '#888'}
              />
            </Animated.View>
            {item.like_cnt > 0 && (
              <Text style={[s.actionCnt, item.liked && { color: '#ef4444' }]}>
                {item.like_cnt}
              </Text>
            )}
          </TouchableOpacity>

          {/* Yorum */}
          <TouchableOpacity onPress={() => onComment(item)} style={s.actionBtn}>
            <Ionicons name="chatbubble-outline" size={22} color="#888" />
            {item.comment_cnt > 0 && (
              <Text style={s.actionCnt}>{item.comment_cnt}</Text>
            )}
          </TouchableOpacity>

          {/* Paylaş */}
          <TouchableOpacity style={s.actionBtn}>
            <Ionicons name="arrow-redo-outline" size={22} color="#888" />
          </TouchableOpacity>
        </View>

        {/* Kaydet */}
        <TouchableOpacity onPress={() => onSave(item.id, !!item.saved)} style={s.actionBtn}>
          <Ionicons
            name={item.saved ? 'bookmark' : 'bookmark-outline'}
            size={22}
            color={item.saved ? '#22C55E' : '#888'}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Ana ekran
// ─────────────────────────────────────────────────────────────────────────────
export default function FeedScreen() {
  const insets      = useSafeAreaInsets();
  const router      = useRouter();
  const { profile } = useAuth();
  const { t }       = useLanguage();
  const {
    posts, loading, refreshing, hasMore,
    loadFeed, refresh, loadMore,
    toggleLike, toggleSave, removePost, editPost,
  } = useFeed();

  const [commentPost, setCommentPost] = useState(null);
  const [optionsPost, setOptionsPost] = useState(null);

  useFocusEffect(useCallback(() => { loadFeed(true); }, [loadFeed]));

  const renderPost = useCallback(({ item }) => (
    <PostCard
      item={item}
      onLike={toggleLike}
      onSave={toggleSave}
      onComment={setCommentPost}
      onOptions={setOptionsPost}
    />
  ), [toggleLike, toggleSave]);

  const renderFooter = () => !hasMore
    ? <View style={{ height: 80 }} />
    : <View style={s.footer}><ActivityIndicator color="#22C55E" /></View>;

  const renderEmpty = () => loading ? null : (
    <View style={s.emptyState}>
      <Text style={s.emptyIcon}>🌍</Text>
      <Text style={s.emptyTitle}>{t('feedEmpty')}</Text>
      <Text style={s.emptyDesc}>{t('feedEmptyDesc')}</Text>
      <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/post/create')}>
        <Text style={s.emptyBtnText}>{t('sharePost')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerLogo}>MOVO</Text>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.headerBtn} onPress={() => router.push('/search')}>
            <Ionicons name="search-outline" size={23} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={() => router.push('/post/create')}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={s.headerBtn} onPress={() => router.push('/notifications')}>
            <Ionicons name="notifications-outline" size={23} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={s.headerBtn} onPress={() => router.push('/messages')}>
            <Ionicons name="paper-plane-outline" size={23} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Liste */}
      {loading && posts.length === 0 ? (
        <View style={s.loadingState}>
          <ActivityIndicator color="#22C55E" size="large" />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={item => item.id}
          renderItem={renderPost}
          ListHeaderComponent={<StoryBar />}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor="#22C55E"
              colors={['#22C55E']}
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          // MapView'lar için gerekli
          removeClippedSubviews={false}
        />
      )}

      {/* Yorum modalı */}
      <CommentsModal
        postId={commentPost?.id}
        visible={!!commentPost}
        onClose={() => setCommentPost(null)}
        onCommentAdded={() =>
          setCommentPost(prev =>
            prev ? { ...prev, comment_cnt: (prev.comment_cnt || 0) + 1 } : prev
          )
        }
        t={t}
      />

      {/* Post seçenekleri */}
      {optionsPost && (
        <PostOptionsModal
          post={optionsPost}
          isOwn={optionsPost?.user_id === profile?.id}
          visible={!!optionsPost}
          onClose={() => setOptionsPost(null)}
          onDeleted={removePost}
          onEdited={editPost}
          t={t}
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stiller
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#0A0A0A' },
  loadingState:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  headerLogo:    { color: '#22C55E', fontSize: 22, fontWeight: '800', letterSpacing: 1 },
  headerRight:   { flexDirection: 'row', gap: 4, alignItems: 'center' },
  headerBtn:     { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  addBtn:        { width: 32, height: 32, borderRadius: 10, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center', marginRight: 2 },

  // Post kartı
  card:          { backgroundColor: '#111', marginBottom: 8, borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: '#1C1C1C' },
  cardHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 },
  cardUser:      { flexDirection: 'row', alignItems: 'center', flex: 1 },
  cardName:      { color: '#fff', fontSize: 14, fontWeight: '600' },
  cardTime:      { color: '#555', fontSize: 12, marginTop: 1 },
  moreBtn:       { padding: 8 },
  cardNote:      { color: '#ddd', fontSize: 15, lineHeight: 22, paddingHorizontal: 14, paddingBottom: 10 },

  // Rota
  routeCardWrap: { marginHorizontal: 14, marginBottom: 4 },
  routeBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, marginBottom: 2 },
  routeBadgeTxt: { color: '#22C55E', fontSize: 11, fontWeight: '600' },

  // Medya dots
  dots:          { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 8 },
  dot:           { width: 6, height: 6, borderRadius: 3, backgroundColor: '#333' },
  dotActive:     { backgroundColor: '#22C55E', width: 18 },

  // Aksiyonlar
  cardActions:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12 },
  actionLeft:    { flexDirection: 'row', gap: 4 },
  actionBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6 },
  actionCnt:     { color: '#888', fontSize: 13, fontWeight: '500' },

  // Footer / empty
  footer:        { padding: 20, alignItems: 'center' },
  emptyState:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  emptyIcon:     { fontSize: 52, marginBottom: 12 },
  emptyTitle:    { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptyDesc:     { color: '#666', fontSize: 14, textAlign: 'center', marginBottom: 24, paddingHorizontal: 40 },
  emptyBtn:      { backgroundColor: '#22C55E', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  emptyBtnText:  { color: '#fff', fontWeight: '600', fontSize: 15 },

  // Modaller
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  optionsSheet:  { backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheetHandle:   { width: 36, height: 4, backgroundColor: '#333', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetTitle:    { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center', paddingVertical: 12 },
  optRow:        { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: '#1C1C1C' },
  optIcon:       { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  optText:       { flex: 1, color: '#fff', fontSize: 15, fontWeight: '500' },
  editHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#1C1C1C' },
  saveBtn:       { color: '#22C55E', fontSize: 15, fontWeight: '700' },
  editInput:     { color: '#fff', fontSize: 15, lineHeight: 22, padding: 16, minHeight: 120, textAlignVertical: 'top' },
  charCount:     { color: '#444', fontSize: 12, textAlign: 'right', paddingHorizontal: 16, paddingBottom: 10 },

  // Yorum
  commentSheet:  { backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%', minHeight: '50%', paddingBottom: Platform.OS === 'ios' ? 24 : 8 },
  commentRow:    { flexDirection: 'row', gap: 10, marginBottom: 14 },
  commentBubble: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 14, padding: 10 },
  commentUser:   { color: '#22C55E', fontSize: 12, fontWeight: '600', marginBottom: 3 },
  commentBody:   { color: '#ddd', fontSize: 14, lineHeight: 20 },
  emptyComments: { color: '#555', textAlign: 'center', marginTop: 30, fontSize: 14 },
  commentInput:  { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6, borderTopWidth: 0.5, borderTopColor: '#222' },
  commentBox:    { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', fontSize: 14, maxHeight: 100 },
  sendBtn:       { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});