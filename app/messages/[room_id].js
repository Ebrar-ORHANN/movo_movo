// ── app/messages/[roomId].js ──────────────────────────────────────────────────
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { auth } from '../../src/firebase/config';

function timeStr(d) {
  const dt = new Date(d);
  return dt.toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
}

export default function ChatScreen() {
  const params = useLocalSearchParams();
  // Expo Router dosya adı [roomId].js → params.roomId, ya da id olarak gelebilir
  const roomId = params.roomId || params.id;
  const name   = params.name;
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { profile } = useAuth();
  const flatRef = useRef(null);
  const wsRef   = useRef(null);

  const [messages, setMessages] = useState([]);
  const [text,     setText]     = useState('');
  const [loading,  setLoading]  = useState(true);
  const [sending,  setSending]  = useState(false);
  const [typing,   setTyping]   = useState(false);
  const typingTimer = useRef(null);

  // ── Mesajları yükle ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const data = await api.get(`/chat/rooms/${roomId}/messages?limit=50`);
        setMessages((Array.isArray(data) ? data : []).reverse());
        // Okundu işaretle
        await api.patch(`/chat/rooms/${roomId}/read`);
      } catch {}
      finally { setLoading(false); }
    })();
  }, [roomId]);

  // ── WebSocket ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const connect = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const base  = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000').replace('http','ws');
        const ws    = new WebSocket(`${base}/chat/rooms/${roomId}/ws?token=${token}`);
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg.type === 'message') {
            setMessages(prev => [...prev, { id: msg.id, sender_id: msg.sender_id, content: msg.content, m_type: msg.m_type, created_at: new Date().toISOString() }]);
          } else if (msg.type === 'typing' && msg.user_id !== profile?.id) {
            setTyping(true);
            clearTimeout(typingTimer.current);
            typingTimer.current = setTimeout(() => setTyping(false), 2000);
          }
        };
        wsRef.current = ws;
      } catch {}
    };
    connect();
    return () => { wsRef.current?.close(); clearTimeout(typingTimer.current); };
  }, [roomId]);

  // ── Gönder ──────────────────────────────────────────────────────────────────
  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setText('');
    setSending(true);
    try {
      const msg = await api.post(
        `/chat/rooms/${roomId}/messages?content=${encodeURIComponent(t)}&m_type=text`
      );
      setMessages(prev => [...prev, { id: msg.id, sender_id: profile?.id, content: t, m_type:'text', created_at: new Date().toISOString() }]);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated:true }), 100);
    } catch {}
    finally { setSending(false); }
  };

  const onChangeText = (v) => {
    setText(v);
    // Typing göster
    wsRef.current?.send(JSON.stringify({ type:'typing', user_id: profile?.id }));
  };

  const isMe = (msg) => String(msg.sender_id) === String(profile?.id);

  if (loading) return <View style={s.center}><ActivityIndicator color="#22C55E"/></View>;

  return (
    <KeyboardAvoidingView style={[s.container, { paddingTop: insets.top }]}
      behavior={Platform.OS==='ios'?'padding':'height'} keyboardVerticalOffset={0}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#fff"/>
        </TouchableOpacity>
        <Text style={s.name}>{decodeURIComponent(name||'Sohbet')}</Text>
      </View>

      {/* Mesajlar */}
      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={(m,i) => m.id || String(i)}
        contentContainerStyle={{ padding:12, gap:6, paddingBottom:16 }}
        onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated:false })}
        renderItem={({ item, index }) => {
          const me   = isMe(item);
          const prev = messages[index - 1];
          const showTime = !prev || (new Date(item.created_at) - new Date(prev.created_at)) > 300000;
          return (
            <>
              {showTime && <Text style={s.timeLabel}>{timeStr(item.created_at)}</Text>}
              <View style={[s.bubble, me ? s.bubbleMe : s.bubbleThem]}>
                <Text style={[s.bubbleTxt, me && s.bubbleTxtMe]}>{item.content}</Text>
              </View>
            </>
          );
        }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="chatbubble-ellipses-outline" size={44} color="#333"/>
            <Text style={s.emptyTxt}>Henüz mesaj yok. İlk mesajı sen at!</Text>
          </View>
        }
      />

      {/* Yazıyor */}
      {typing && (
        <View style={s.typingRow}>
          <Text style={s.typingTxt}>yazıyor…</Text>
        </View>
      )}

      {/* Input */}
      <View style={[s.inputRow, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={s.input}
          placeholder="Mesaj yaz…"
          placeholderTextColor="#444"
          value={text}
          onChangeText={onChangeText}
          multiline
          maxLength={1000}
          returnKeyType="default"
        />
        <TouchableOpacity style={[s.sendBtn, (!text.trim()||sending) && s.sendBtnDis]}
          onPress={send} disabled={!text.trim()||sending}>
          {sending
            ? <ActivityIndicator color="#fff" size="small"/>
            : <Ionicons name="send" size={18} color="#fff"/>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:   { flex:1, backgroundColor:'#0A0A0A' },
  center:      { flex:1, alignItems:'center', justifyContent:'center', backgroundColor:'#0A0A0A' },
  header:      { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:14, borderBottomWidth:0.5, borderBottomColor:'#1C1C1C', gap:12 },
  name:        { color:'#fff', fontSize:16, fontWeight:'700', flex:1 },
  timeLabel:   { color:'#444', fontSize:11, textAlign:'center', marginVertical:8 },
  bubble:      { maxWidth:'78%', borderRadius:18, paddingHorizontal:14, paddingVertical:9 },
  bubbleMe:    { alignSelf:'flex-end', backgroundColor:'#22C55E', borderBottomRightRadius:4 },
  bubbleThem:  { alignSelf:'flex-start', backgroundColor:'#1A1A1A', borderBottomLeftRadius:4 },
  bubbleTxt:   { color:'#fff', fontSize:14, lineHeight:20 },
  bubbleTxtMe: { color:'#fff' },
  empty:       { alignItems:'center', paddingTop:60, gap:12, paddingHorizontal:32 },
  emptyTxt:    { color:'#555', fontSize:14, textAlign:'center' },
  typingRow:   { paddingHorizontal:16, paddingBottom:4 },
  typingTxt:   { color:'#555', fontSize:12 },
  inputRow:    { flexDirection:'row', alignItems:'flex-end', gap:8, paddingHorizontal:12, paddingTop:8, borderTopWidth:0.5, borderTopColor:'#1C1C1C', backgroundColor:'#0A0A0A' },
  input:       { flex:1, backgroundColor:'#1A1A1A', borderRadius:22, paddingHorizontal:16, paddingVertical:10, color:'#fff', fontSize:14, maxHeight:120, borderWidth:0.5, borderColor:'#2A2A2A' },
  sendBtn:     { width:42, height:42, borderRadius:21, backgroundColor:'#22C55E', alignItems:'center', justifyContent:'center' },
  sendBtnDis:  { opacity:0.4 },
});