// ── app/poi/[id].js ──────────────────────────────────────────────────────────
// DB: pois, poi_media, poi_user_comments, poi_translations
// Medya: resmi poi_media + shared_to_poi=TRUE olan post_attachments
// Yorum: sadece route_stops.arrived_at dolu kullanıcılar yazabilir (backend kontrolü)

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity,
  FlatList, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getPOIDetail, getPOIComments, addPOIComment } from '../../services/explorerService';
import { saveContent, unsaveContent, reportContent } from '../../services/feedService';

export default function POIDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [poi,      setPOI]      = useState(null);
  const [comments, setComments] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saved,    setSaved]    = useState(false);
  const [newComment, setNewComment] = useState('');
  const [rating,   setRating]   = useState(5);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      getPOIDetail(id, 'tr'),
      getPOIComments(id),
    ]).then(([p, c]) => {
      setPOI(p);
      setComments(c || []);
    }).catch(console.warn)
    .finally(() => setLoading(false));
  }, [id]);

  const handleSave = () => {
    setSaved(!saved);
    saved ? unsaveContent('poi', id) : saveContent('poi', id);
  };

  const handleComment = async () => {
    if (!newComment.trim()) return;
    try {
      setSubmitting(true);
      const c = await addPOIComment(id, { body: newComment, rating });
      setComments(p => [c, ...p]);
      setNewComment('');
    } catch (e) {
      // Backend: arrived_at yoksa 403 döner
      Alert.alert('Yorum Yapılamadı', e.message.includes('403')
        ? 'Bu mekana gittiğinde yorum yapabilirsin'
        : e.message);
    } finally { setSubmitting(false); }
  };

  if (loading) return (
    <View style={[s.container, s.centered, { paddingTop: insets.top }]}>
      <ActivityIndicator color="#22C55E" size="large" />
    </View>
  );

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Başlık */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.name} numberOfLines={1}>{poi?.name || 'Mekan'}</Text>
        <TouchableOpacity onPress={handleSave}>
          <Ionicons name={saved?'bookmark':'bookmark-outline'} size={24} color={saved?'#22C55E':'#fff'} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Medya alanı — poi_media + shared_to_poi post_attachments */}
        <View style={s.mediaPlaceholder}>
          <Text style={s.mediaHint}>📸 {poi?.media_count || 0} fotoğraf</Text>
        </View>

        {/* Bilgiler */}
        <View style={s.info}>
          <View style={s.badgeRow}>
            <View style={s.catBadge}>
              <Text style={s.catText}>{poi?.category || 'mekan'}</Text>
            </View>
            {poi?.is_sponsored && (
              <View style={s.sponsorBadge}><Text style={s.sponsorText}>⭐ Sponsor</Text></View>
            )}
            {poi?.verified && (
              <View style={s.verifiedBadge}><Text style={s.verifiedText}>✓ Onaylı</Text></View>
            )}
          </View>

          {/* Puan — trg_update_poi_rating trigger ile güncellenir */}
          <View style={s.ratingRow}>
            <Text style={s.ratingVal}>★ {(poi?.rating || 0).toFixed(1)}</Text>
            <Text style={s.ratingCnt}>{poi?.review_cnt || 0} değerlendirme</Text>
            {poi?.external_rating_google && (
              <Text style={s.extRating}>Google: ★ {poi.external_rating_google}</Text>
            )}
          </View>

          {poi?.description && (
            <Text style={s.desc}>{poi.description}</Text>
          )}

          {poi?.address && (
            <View style={s.infoRow}>
              <Ionicons name="location-outline" size={16} color="#888" />
              <Text style={s.infoTxt}>{poi.address}</Text>
            </View>
          )}

          {poi?.opening_hours && (
            <View style={s.infoRow}>
              <Ionicons name="time-outline" size={16} color="#888" />
              <Text style={s.infoTxt}>{JSON.stringify(poi.opening_hours)}</Text>
            </View>
          )}

          {poi?.tags?.length > 0 && (
            <View style={s.tagsRow}>
              {poi.tags.map((t,i) => (
                <View key={i} style={s.tag}>
                  <Text style={s.tagTxt}>{t}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Yorum Yaz */}
        <View style={s.commentSection}>
          <Text style={s.sectionTitle}>Yorum Yaz</Text>
          <View style={s.ratingInput}>
            {[1,2,3,4,5].map(n => (
              <TouchableOpacity key={n} onPress={() => setRating(n)}>
                <Text style={{ fontSize:24, color: n<=rating ? '#F59E0B' : '#333' }}>★</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={s.textInputRow}>
            <TextInput style={s.textInput} placeholder="Deneyimini yaz..." placeholderTextColor="#555"
              value={newComment} onChangeText={setNewComment} multiline maxLength={300}
              textAlignVertical="top" />
            <TouchableOpacity style={s.sendBtn} onPress={handleComment} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" size="small" /> :
                <Ionicons name="send" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
          <Text style={s.commentHint}>Bu mekana gittiğinde yorum yapabilirsin</Text>
        </View>

        {/* Yorumlar listesi — poi_user_comments tablosu */}
        <View style={s.commentSection}>
          <Text style={s.sectionTitle}>Yorumlar ({comments.length})</Text>
          {comments.map(c => (
            <View key={c.id} style={s.commentCard}>
              <View style={s.commentHeader}>
                <Text style={s.commentUser}>{c.username || 'Kullanıcı'}</Text>
                <Text style={s.commentRating}>{'★'.repeat(c.rating||5)}</Text>
              </View>
              <Text style={s.commentBody}>{c.body}</Text>
              <Text style={s.commentTime}>
                {new Date(c.created_at).toLocaleDateString('tr-TR')}
              </Text>
            </View>
          ))}
          {comments.length === 0 && <Text style={s.empty}>Henüz yorum yok</Text>}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex:1, backgroundColor:'#0D0D0D' },
  centered:       { alignItems:'center', justifyContent:'center' },
  header:         { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:16, paddingBottom:12 },
  name:           { flex:1, color:'#fff', fontSize:18, fontWeight:'700' },
  mediaPlaceholder:{ height:200, backgroundColor:'#111', alignItems:'center', justifyContent:'center', marginBottom:16 },
  mediaHint:      { color:'#555', fontSize:14 },
  info:           { paddingHorizontal:16, marginBottom:20 },
  badgeRow:       { flexDirection:'row', gap:8, flexWrap:'wrap', marginBottom:10 },
  catBadge:       { backgroundColor:'#1A1A1A', paddingHorizontal:12, paddingVertical:5, borderRadius:10, borderWidth:0.5, borderColor:'#2A2A2A' },
  catText:        { color:'#ccc', fontSize:12, textTransform:'capitalize' },
  sponsorBadge:   { backgroundColor:'#78350f', paddingHorizontal:12, paddingVertical:5, borderRadius:10 },
  sponsorText:    { color:'#fcd34d', fontSize:12 },
  verifiedBadge:  { backgroundColor:'#14532d', paddingHorizontal:12, paddingVertical:5, borderRadius:10 },
  verifiedText:   { color:'#86efac', fontSize:12 },
  ratingRow:      { flexDirection:'row', alignItems:'center', gap:10, marginBottom:12 },
  ratingVal:      { color:'#F59E0B', fontSize:20, fontWeight:'700' },
  ratingCnt:      { color:'#888', fontSize:13 },
  extRating:      { color:'#4285F4', fontSize:12 },
  desc:           { color:'#ccc', fontSize:14, lineHeight:20, marginBottom:10 },
  infoRow:        { flexDirection:'row', alignItems:'flex-start', gap:8, marginBottom:6 },
  infoTxt:        { color:'#888', fontSize:13, flex:1 },
  tagsRow:        { flexDirection:'row', flexWrap:'wrap', gap:6, marginTop:8 },
  tag:            { backgroundColor:'#1A2E1A', paddingHorizontal:10, paddingVertical:4, borderRadius:10 },
  tagTxt:         { color:'#22C55E', fontSize:11 },
  commentSection: { paddingHorizontal:16, marginBottom:20 },
  sectionTitle:   { color:'#fff', fontSize:16, fontWeight:'600', marginBottom:12 },
  ratingInput:    { flexDirection:'row', gap:4, marginBottom:10 },
  textInputRow:   { flexDirection:'row', gap:10, marginBottom:6 },
  textInput:      { flex:1, backgroundColor:'#111', color:'#fff', borderRadius:12, padding:12, minHeight:80, borderWidth:0.5, borderColor:'#2A2A2A', fontSize:14 },
  sendBtn:        { width:44, height:44, backgroundColor:'#22C55E', borderRadius:22, alignItems:'center', justifyContent:'center', alignSelf:'flex-end' },
  commentHint:    { color:'#555', fontSize:11, fontStyle:'italic' },
  commentCard:    { backgroundColor:'#111', borderRadius:12, padding:14, marginBottom:10, borderWidth:0.5, borderColor:'#1A1A1A' },
  commentHeader:  { flexDirection:'row', justifyContent:'space-between', marginBottom:6 },
  commentUser:    { color:'#fff', fontSize:13, fontWeight:'600' },
  commentRating:  { color:'#F59E0B', fontSize:12 },
  commentBody:    { color:'#ccc', fontSize:13, lineHeight:19 },
  commentTime:    { color:'#555', fontSize:11, marginTop:6 },
  empty:          { color:'#555', fontSize:14, textAlign:'center', paddingVertical:20 },
});
