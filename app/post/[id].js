// ── app/post/[id].js ─────────────────────────────────────────────────────────
import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
  ActivityIndicator, Dimensions, FlatList, Animated,
  TextInput, KeyboardAvoidingView, Platform, Alert, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getPost, getComments, addComment, likeContent, unlikeContent, saveContent, unsaveContent } from '../../services/feedService';
import { useAuth } from '../../context/AuthContext';

const { width } = Dimensions.get('window');

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60)    return 'az önce';
  if (diff < 3600)  return `${Math.floor(diff / 60)}dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}s önce`;
  return `${Math.floor(diff / 86400)}g önce`;
}

function Avatar({ uri, name, size = 36 }) {
  return uri
    ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
    : (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#1A3A1A', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#22C55E', fontSize: size * 0.4, fontWeight: '700' }}>
          {(name || '?').slice(0, 1).toUpperCase()}
        </Text>
      </View>
    );
}

export default function PostDetailScreen() {
  const insets        = useSafeAreaInsets();
  const router        = useRouter();
  const { id }        = useLocalSearchParams();
  const { profile }   = useAuth();

  const [post, setPost]         = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [liked, setLiked]       = useState(false);
  const [saved, setSaved]       = useState(false);
  const [likeCnt, setLikeCnt]   = useState(0);
  const [text, setText]         = useState('');
  const [sending, setSending]   = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const likeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!id) return;
    load();
  }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        getPost(id),
        getComments('post', id),
      ]);
      setPost(p);
      setLiked(!!p.liked);
      setSaved(!!p.saved);
      setLikeCnt(p.like_cnt || 0);
      setComments(c?.comments || c || []);
    } catch (e) {
      Alert.alert('Hata', 'Gönderi yüklenemedi.');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    Animated.sequence([
      Animated.timing(likeAnim, { toValue: 1.4, duration: 100, useNativeDriver: true }),
      Animated.timing(likeAnim, { toValue: 1,   duration: 100, useNativeDriver: true }),
    ]).start();
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCnt(c => c + (wasLiked ? -1 : 1));
    try {
      if (wasLiked) await unlikeContent('post', id);
      else          await likeContent('post', id);
    } catch {
      setLiked(wasLiked);
      setLikeCnt(c => c + (wasLiked ? 1 : -1));
    }
  };

  const handleSave = async () => {
    const wasSaved = saved;
    setSaved(!wasSaved);
    try {
      if (wasSaved) await unsaveContent('post', id);
      else          await saveContent('post', id);
    } catch {
      setSaved(wasSaved);
    }
  };

  const handleComment = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await addComment('post', id, text.trim(), null);
      setText('');
      const c = await getComments('post', id);
      setComments(c?.comments || c || []);
    } catch (e) {
      Alert.alert('Hata', e.message);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <View style={[s.container, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color="#22C55E" size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0A0A0A' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Gönderi</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Kullanıcı */}
        <View style={s.userRow}>
          <Avatar uri={post?.avatar_url} name={post?.display_name || post?.username} size={42} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.displayName}>{post?.display_name || post?.username}</Text>
            <Text style={s.meta}>@{post?.username} · {timeAgo(post?.created_at)}</Text>
          </View>
        </View>

        {/* Yazı */}
        {post?.user_note ? (
          <Text style={s.note}>{post.user_note}</Text>
        ) : null}

        {/* Medya */}
        {post?.attachments?.length > 0 && (
          <View>
            <FlatList
              data={post.attachments}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={e => setActiveImg(Math.round(e.nativeEvent.contentOffset.x / width))}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item }) => (
                <Image
                  source={{ uri: item.storage_path }}
                  style={{ width, height: width * 0.85, resizeMode: 'cover' }}
                />
              )}
            />
            {post.attachments.length > 1 && (
              <View style={s.dots}>
                {post.attachments.map((_, i) => (
                  <View key={i} style={[s.dot, i === activeImg && s.dotActive]} />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Aksiyonlar */}
        <View style={s.actions}>
          <View style={s.actionsLeft}>
            <TouchableOpacity onPress={handleLike} style={s.actionBtn}>
              <Animated.View style={{ transform: [{ scale: likeAnim }] }}>
                <Ionicons name={liked ? 'heart' : 'heart-outline'} size={26} color={liked ? '#ef4444' : '#888'} />
              </Animated.View>
              <Text style={[s.actionCnt, liked && { color: '#ef4444' }]}>{likeCnt}</Text>
            </TouchableOpacity>

            <View style={s.actionBtn}>
              <Ionicons name="chatbubble-outline" size={24} color="#888" />
              <Text style={s.actionCnt}>{comments.length}</Text>
            </View>
          </View>

          <TouchableOpacity onPress={handleSave} style={s.actionBtn}>
            <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={24} color={saved ? '#22C55E' : '#888'} />
          </TouchableOpacity>
        </View>

        {/* Yorumlar */}
        <View style={s.commentsSection}>
          <Text style={s.commentsTitle}>Yorumlar</Text>
          {comments.length === 0 ? (
            <Text style={s.noComments}>Henüz yorum yok. İlk yorumu sen yap!</Text>
          ) : (
            comments.map(c => (
              <View key={c.id} style={s.commentRow}>
                <Avatar uri={c.avatar_url} name={c.display_name || c.username} size={32} />
                <View style={s.commentBubble}>
                  <Text style={s.commentUser}>{c.display_name || c.username}</Text>
                  <Text style={s.commentBody}>{c.body}</Text>
                  <Text style={s.commentTime}>{timeAgo(c.created_at)}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Yorum kutusu */}
      <View style={[s.inputRow, { paddingBottom: insets.bottom + 8 }]}>
        <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={34} />
        <TextInput
          style={s.input}
          placeholder="Yorum yaz…"
          placeholderTextColor="#555"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={500}
        />
        <TouchableOpacity onPress={handleComment} disabled={!text.trim() || sending} style={s.sendBtn}>
          {sending
            ? <ActivityIndicator color="#22C55E" size="small" />
            : <Ionicons name="send" size={20} color={text.trim() ? '#22C55E' : '#333'} />
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#0A0A0A' },
  header:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: '#1C1C1C' },
  backBtn:         { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  userRow:         { flexDirection: 'row', alignItems: 'center', padding: 14 },
  displayName:     { color: '#fff', fontSize: 15, fontWeight: '600' },
  meta:            { color: '#555', fontSize: 12, marginTop: 2 },
  note:            { color: '#ddd', fontSize: 16, lineHeight: 24, paddingHorizontal: 14, paddingBottom: 12 },
  dots:            { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 8 },
  dot:             { width: 6, height: 6, borderRadius: 3, backgroundColor: '#333' },
  dotActive:       { backgroundColor: '#22C55E', width: 18 },
  actions:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#1C1C1C' },
  actionsLeft:     { flexDirection: 'row', gap: 8 },
  actionBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, paddingVertical: 4 },
  actionCnt:       { color: '#888', fontSize: 14, fontWeight: '500' },
  commentsSection: { padding: 14 },
  commentsTitle:   { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 14 },
  noComments:      { color: '#555', fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  commentRow:      { flexDirection: 'row', gap: 10, marginBottom: 16 },
  commentBubble:   { flex: 1, backgroundColor: '#111', borderRadius: 14, padding: 10 },
  commentUser:     { color: '#22C55E', fontSize: 12, fontWeight: '600', marginBottom: 3 },
  commentBody:     { color: '#ddd', fontSize: 14, lineHeight: 20 },
  commentTime:     { color: '#444', fontSize: 11, marginTop: 4 },
  inputRow:        { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 14, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: '#1C1C1C', backgroundColor: '#0A0A0A' },
  input:           { flex: 1, backgroundColor: '#111', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', fontSize: 14, maxHeight: 100 },
  sendBtn:         { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});