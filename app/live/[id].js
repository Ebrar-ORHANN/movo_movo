// ── app/live/[id].js ─────────────────────────────────────────────────────────
// DB: live_sessions, live_viewers (trigger: viewer_cnt), live_comments, live_reactions
// HLS: hls_playback_url → video player ile izleme
// WebSocket: /live/{id}/ws → yorum + reaksiyon + konum anlık

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList,
  TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getLiveSessionDetail, joinLive, leaveLive, sendLiveComment, sendLiveReaction, connectToLive } from '../../services/liveService';

const REACTIONS = ['❤️','🔥','👏','😮','🎉'];

export default function LiveWatchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [session,   setSession]   = useState(null);
  const [comments,  setComments]  = useState([]);
  const [reactions, setReactions] = useState([]);
  const [text,      setText]      = useState('');
  const wsRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    getLiveSessionDetail(id).then(setSession).catch(console.warn);
    joinLive(id).catch(()=>{});  // live_viewers INSERT, viewer_cnt artar

    // WebSocket — yorum + reaksiyon + konum
    connectToLive(id, (msg) => {
      if (msg.type === 'comment') {
        setComments(p => [...p.slice(-49), msg]);
        listRef.current?.scrollToEnd({ animated: true });
      } else if (msg.type === 'reaction') {
        setReactions(p => [...p.slice(-5), msg]);
      } else if (msg.type === 'viewer_count') {
        setSession(s => s ? { ...s, viewer_cnt: msg.count } : s);
      }
    }).then(ws => { wsRef.current = ws; });

    return () => {
      leaveLive(id).catch(()=>{});  // live_viewers.left_at = NOW()
      wsRef.current?.close();
    };
  }, [id]);

  const handleComment = async () => {
    if (!text.trim()) return;
    const content = text.trim();
    setText('');
    await sendLiveComment(id, content).catch(()=>{});
  };

  const handleReaction = async (emoji) => {
    await sendLiveReaction(id, emoji).catch(()=>{});
  };

  return (
    <KeyboardAvoidingView
      style={[s.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Video alanı (HLS playback — expo-av ile entegre edilmeli) */}
      <View style={s.videoArea}>
        <View style={s.liveBadge}>
          <View style={s.liveDot} />
          <Text style={s.liveText}>CANLI</Text>
          <Text style={s.viewerCount}> · {session?.viewer_cnt || 0} izleyici</Text>
        </View>
        <Text style={s.streamTitle} numberOfLines={2}>{session?.title || 'Canlı Gezi'}</Text>
        <Text style={s.hlsHint}>HLS: {session?.hls_playback_url?.slice(0,40) || '...'}</Text>
        <TouchableOpacity style={s.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Reaksiyonlar */}
      <View style={s.reactionsBar}>
        {REACTIONS.map((emoji, i) => (
          <TouchableOpacity key={i} style={s.reactBtn} onPress={() => handleReaction(emoji)}>
            <Text style={{ fontSize:22 }}>{emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Canlı yorumlar — live_comments tablosu */}
      <FlatList
        ref={listRef}
        data={comments}
        keyExtractor={(_,i) => String(i)}
        style={s.commentsList}
        renderItem={({ item }) => (
          <View style={s.commentRow}>
            <Text style={s.commentUser}>{item.username || '?'}</Text>
            <Text style={s.commentText}>{item.body || item.content}</Text>
          </View>
        )}
      />

      {/* Yorum giriş */}
      <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TextInput style={s.input} placeholder="Yorum yaz..."
          placeholderTextColor="#555" value={text} onChangeText={setText}
          onSubmitEditing={handleComment} returnKeyType="send" />
        <TouchableOpacity style={s.sendBtn} onPress={handleComment}>
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:    { flex:1, backgroundColor:'#000' },
  videoArea:    { height:280, backgroundColor:'#1A1A1A', position:'relative', justifyContent:'flex-end', padding:14 },
  liveBadge:    { position:'absolute', top:14, left:14, flexDirection:'row', alignItems:'center', backgroundColor:'rgba(239,68,68,0.9)', paddingHorizontal:10, paddingVertical:4, borderRadius:10 },
  liveDot:      { width:6, height:6, borderRadius:3, backgroundColor:'#fff', marginRight:5 },
  liveText:     { color:'#fff', fontSize:11, fontWeight:'700' },
  viewerCount:  { color:'rgba(255,255,255,0.8)', fontSize:11 },
  streamTitle:  { color:'#fff', fontSize:16, fontWeight:'600', marginBottom:4 },
  hlsHint:      { color:'rgba(255,255,255,0.4)', fontSize:9 },
  closeBtn:     { position:'absolute', top:14, right:14 },
  reactionsBar: { flexDirection:'row', justifyContent:'center', gap:8, paddingVertical:10, borderBottomWidth:0.5, borderBottomColor:'#111' },
  reactBtn:     { padding:6 },
  commentsList: { flex:1, paddingHorizontal:14 },
  commentRow:   { flexDirection:'row', gap:6, alignItems:'flex-start', marginVertical:3 },
  commentUser:  { color:'#22C55E', fontSize:12, fontWeight:'600', flexShrink:0 },
  commentText:  { color:'#ddd', fontSize:12, flex:1, lineHeight:17 },
  inputBar:     { flexDirection:'row', gap:10, paddingHorizontal:14, paddingTop:8, borderTopWidth:0.5, borderTopColor:'#111' },
  input:        { flex:1, backgroundColor:'#111', color:'#fff', borderRadius:22, paddingHorizontal:14, paddingVertical:9, fontSize:13, borderWidth:0.5, borderColor:'#2A2A2A' },
  sendBtn:      { width:40, height:40, backgroundColor:'#22C55E', borderRadius:20, alignItems:'center', justifyContent:'center' },
});
