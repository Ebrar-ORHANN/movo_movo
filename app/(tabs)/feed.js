// ── app/(tabs)/feed.js ───────────────────────────────────────────────────────
// DB: posts (getFeed), likes (likeContent trigger), saves, events (getNearbyEvents)
// Hikaye çemberleri: gerçek takip listesi (follows tablosu)
// Etkinlikler: events WHERE ST_DWithin + status IN (upcoming,ongoing)

import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Dimensions, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import useFeed from '../../hooks/useFeed';
import useNotifications from '../../hooks/useNotifications';
import { useAuth } from '../../context/AuthContext';

const { width } = Dimensions.get('window');

// ── Hikaye Çemberi ────────────────────────────────────────────────────────────
function StoryAvatar({ item, onPress }) {
  const initials = (item.display_name || item.username || '?').slice(0,1).toUpperCase();
  return (
    <TouchableOpacity style={styles.storyItem} onPress={() => onPress(item)}>
      <View style={styles.storyRing}>
        {item.avatar_url
          ? <Image source={{ uri: item.avatar_url }} style={styles.storyAvatar} />
          : <View style={[styles.storyAvatar, styles.storyInitials]}>
              <Text style={styles.storyInitText}>{initials}</Text>
            </View>
        }
      </View>
      <Text style={styles.storyName} numberOfLines={1}>{item.username || 'kullanıcı'}</Text>
    </TouchableOpacity>
  );
}

// ── Etkinlik Kartı ─────────────────────────────────────────────────────────────
function EventCard({ event, onPress }) {
  return (
    <TouchableOpacity style={styles.eventCard} onPress={() => onPress(event)}>
      <View style={styles.eventIcon}>
        <Text style={{ fontSize: 18 }}>⛺</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
        <Text style={styles.eventSub}>
          {event.attendee_cnt || 0}/{event.max_participants || '∞'} kişi
        </Text>
      </View>
      <View style={[styles.joinBtn,
        { backgroundColor: event.status==='upcoming' ? '#22C55E' : '#FF9800' }]}>
        <Text style={styles.joinText}>Katıl</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Post Kartı ────────────────────────────────────────────────────────────────
// posts JOIN users, post_attachments
function PostCard({ post, onLike, onSave, onComment, onPress }) {
  const initials = (post.display_name||post.username||'?').slice(0,1).toUpperCase();
  return (
    <TouchableOpacity style={styles.postCard} activeOpacity={0.92} onPress={() => onPress(post)}>
      {/* Başlık */}
      <View style={styles.postHeader}>
        <View style={styles.postAvatar}>
          <Text style={styles.postAvatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.postUser}>{post.username || post.display_name}</Text>
          <Text style={styles.postMeta}>
            {post.city_name || 'Türkiye'} · {timeAgo(post.created_at)}
          </Text>
        </View>
        <Ionicons name="ellipsis-horizontal" size={18} color="#888" />
      </View>

      {/* Rota bilgisi (varsa) */}
      {post.route_id && (
        <View style={styles.routeBadge}>
          <Text style={styles.routeTitle} numberOfLines={1}>
            {post.route_title || 'Rota'}
          </Text>
          <Text style={styles.routeSub}>
            {post.distance_m ? `${(post.distance_m/1000).toFixed(1)} km` : ''}{' '}
            {post.duration_sec ? `· ${Math.round(post.duration_sec/3600)} sa` : ''}
          </Text>
          <TouchableOpacity style={styles.copyBtn}>
            <Ionicons name="copy-outline" size={14} color="#22C55E" />
            <Text style={styles.copyText}>Kopyala & Keşfet</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Görsel */}
      {post.attachments?.[0]?.storage_path && (
        <Image
          source={{ uri: post.attachments[0].storage_path }}
          style={styles.postImage}
          resizeMode="cover"
        />
      )}

      {/* Açıklama */}
      {post.user_note ? (
        <Text style={styles.postNote} numberOfLines={3}>{post.user_note}</Text>
      ) : null}

      {/* Etiketler */}
      {post.tags?.length ? (
        <Text style={styles.tags}>{post.tags.map(t=>`#${t}`).join(' ')}</Text>
      ) : null}

      {/* Aksiyonlar */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onLike(post.id, post.is_liked)}>
          <Ionicons name={post.is_liked?'heart':'heart-outline'} size={22}
            color={post.is_liked?'#ef4444':'#ccc'} />
          <Text style={styles.actionCount}>{post.like_cnt || 0}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onComment(post)}>
          <Ionicons name="chatbubble-outline" size={20} color="#ccc" />
          <Text style={styles.actionCount}>{post.comment_cnt || 0}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onSave(post.id, post.is_saved)}>
          <Ionicons name={post.is_saved?'bookmark':'bookmark-outline'} size={20}
            color={post.is_saved?'#22C55E':'#ccc'} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <Ionicons name="share-outline" size={20} color="#ccc" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff/60000);
  if (min < 60)    return `${min} dk önce`;
  if (min < 1440)  return `${Math.floor(min/60)} saat önce`;
  return `${Math.floor(min/1440)} gün önce`;
}

// ── Ana Ekran ─────────────────────────────────────────────────────────────────
export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const { unread } = useNotifications();
  const {
    posts, events, loading, refreshing, hasMore,
    refresh, loadMore, toggleLike, toggleSave,
  } = useFeed();

  const renderItem = useCallback(({ item, index }) => {
    // İlk sıra: hikaye çemberleri + etkinlikler
    if (index === 0 && item.__type === 'header') {
      return (
        <View>
          {/* Hikaye çemberleri — follows tablosundan takip edilenler */}
          <FlatList
            horizontal showsHorizontalScrollIndicator={false}
            data={item.stories || []}
            keyExtractor={s => s.id}
            contentContainerStyle={styles.storiesRow}
            renderItem={({ item: s }) => <StoryAvatar item={s} onPress={() => {}} />}
          />
          {/* Yakındaki Etkinlikler — events ST_DWithin */}
          {item.events?.length > 0 && (
            <View style={styles.eventsSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Yakındaki Etkinlikler</Text>
                <TouchableOpacity onPress={() => router.push('/events/index')}>
                  <Text style={styles.sectionMore}>Tümü</Text>
                </TouchableOpacity>
              </View>
              {item.events.slice(0,2).map(ev => (
                <EventCard key={ev.id} event={ev}
                  onPress={(e) => router.push(`/events/${e.id}`)} />
              ))}
            </View>
          )}
          {/* Akış başlığı */}
          <View style={styles.feedHeader}>
            <Text style={styles.feedHeaderText}>Akış</Text>
            <Ionicons name="options-outline" size={20} color="#888" />
          </View>
        </View>
      );
    }
    return (
      <PostCard
        post={item}
        onLike={toggleLike}
        onSave={toggleSave}
        onComment={(p) => router.push(`/events/${p.id}`)}
        onPress={(p) => {}}
      />
    );
  }, [events, toggleLike, toggleSave, router]);

  // İlk öğe olarak header ekle
  const data = [
    { __type: 'header', id: '__header', stories: [], events },
    ...posts,
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Üst bar */}
      <View style={styles.topBar}>
        <Text style={styles.logo}>MOVO</Text>
        <View style={styles.topActions}>
          <TouchableOpacity onPress={() => router.push('/notifications')} style={styles.topIcon}>
            <Ionicons name="notifications-outline" size={24} color="#fff" />
            {unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/messages/index')} style={styles.topIcon}>
            <Ionicons name="paper-plane-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {loading && posts.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#22C55E" size="large" />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={item => item.id || '__header'}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#22C55E" />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={hasMore ? <ActivityIndicator color="#22C55E" style={{marginVertical:16}} /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex:1, backgroundColor:'#0D0D0D' },
  topBar:         { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:16, paddingBottom:12 },
  logo:           { fontSize:24, fontWeight:'700', color:'#22C55E' },
  topActions:     { flexDirection:'row', gap:12 },
  topIcon:        { position:'relative' },
  badge:          { position:'absolute', top:-4, right:-4, backgroundColor:'#22C55E', borderRadius:8, minWidth:16, height:16, alignItems:'center', justifyContent:'center' },
  badgeText:      { color:'#fff', fontSize:9, fontWeight:'700' },
  centered:       { flex:1, alignItems:'center', justifyContent:'center' },
  storiesRow:     { paddingHorizontal:16, paddingVertical:10, gap:12 },
  storyItem:      { alignItems:'center', width:64 },
  storyRing:      { width:56, height:56, borderRadius:28, borderWidth:2, borderColor:'#22C55E', padding:2 },
  storyAvatar:    { width:'100%', height:'100%', borderRadius:24 },
  storyInitials:  { backgroundColor:'#1A2E1A', alignItems:'center', justifyContent:'center' },
  storyInitText:  { color:'#22C55E', fontSize:18, fontWeight:'700' },
  storyName:      { color:'#ccc', fontSize:11, marginTop:4, maxWidth:64, textAlign:'center' },
  eventsSection:  { paddingHorizontal:16, marginBottom:12 },
  sectionHeader:  { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 },
  sectionTitle:   { color:'#fff', fontSize:16, fontWeight:'600' },
  sectionMore:    { color:'#22C55E', fontSize:13 },
  eventCard:      { flexDirection:'row', alignItems:'center', backgroundColor:'#1A1A1A', borderRadius:12, padding:12, marginBottom:8, borderWidth:0.5, borderColor:'#2A2A2A' },
  eventIcon:      { width:40, height:40, borderRadius:20, backgroundColor:'#2A2A2A', alignItems:'center', justifyContent:'center', marginRight:12 },
  eventTitle:     { color:'#fff', fontSize:14, fontWeight:'600' },
  eventSub:       { color:'#888', fontSize:12, marginTop:2 },
  joinBtn:        { paddingHorizontal:14, paddingVertical:6, borderRadius:20 },
  joinText:       { color:'#fff', fontSize:13, fontWeight:'600' },
  feedHeader:     { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:16, paddingVertical:12 },
  feedHeaderText: { color:'#fff', fontSize:16, fontWeight:'600' },
  postCard:       { backgroundColor:'#111', marginBottom:2, paddingVertical:12 },
  postHeader:     { flexDirection:'row', alignItems:'center', paddingHorizontal:16, marginBottom:10 },
  postAvatar:     { width:40, height:40, borderRadius:20, backgroundColor:'#22C55E', alignItems:'center', justifyContent:'center', marginRight:10 },
  postAvatarText: { color:'#fff', fontSize:16, fontWeight:'700' },
  postUser:       { color:'#fff', fontSize:14, fontWeight:'600' },
  postMeta:       { color:'#888', fontSize:12, marginTop:2 },
  routeBadge:     { backgroundColor:'#1A2E1A', marginHorizontal:16, borderRadius:10, padding:12, marginBottom:10 },
  routeTitle:     { color:'#fff', fontSize:14, fontWeight:'600' },
  routeSub:       { color:'#888', fontSize:12, marginTop:2 },
  copyBtn:        { flexDirection:'row', alignItems:'center', gap:4, marginTop:8 },
  copyText:       { color:'#22C55E', fontSize:12, fontWeight:'500' },
  postImage:      { width:'100%', height:220, marginBottom:12 },
  postNote:       { color:'#ccc', fontSize:14, paddingHorizontal:16, marginBottom:8, lineHeight:20 },
  tags:           { color:'#22C55E', fontSize:13, paddingHorizontal:16, marginBottom:8 },
  actions:        { flexDirection:'row', paddingHorizontal:16, gap:16 },
  actionBtn:      { flexDirection:'row', alignItems:'center', gap:5 },
  actionCount:    { color:'#ccc', fontSize:13 },
});
