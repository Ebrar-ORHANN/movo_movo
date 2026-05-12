// ── app/messages/[room_id].js ────────────────────────────────────────────────
// DB: messages (cursor-based paginator), chat_rooms.last_message_at
// WebSocket: /chat/rooms/{id}/ws → anlık mesaj
// Admin mesajı: is_admin_message=TRUE → farklı renk

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getMessages, sendMessage, markMessagesRead, connectToRoom } from '../../services/messageService';
import { useAuth } from '../../context/AuthContext';

export default function ChatRoomScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { room_id } = useLocalSearchParams();
  const { profile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text,     setText]     = useState('');
  const [loading,  setLoading]  = useState(true);
  const [sending,  setSending]  = useState(false);
  const wsRef   = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    getMessages(room_id).then(msgs => {
      setMessages([...msgs].reverse());
      markMessagesRead(room_id).catch(()=>{});
    }).catch(console.warn)
    .finally(() => setLoading(false));

    // WebSocket — anlık mesaj gelince listeye ekle
    connectToRoom(room_id, (msg) => {
      if (msg.type === 'message') {
        setMessages(p => [...p, msg]);
        listRef.current?.scrollToEnd({ animated: true });
      }
    }).then(ws => { wsRef.current = ws; });

    return () => wsRef.current?.close();
  }, [room_id]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    const content = text.trim();
    setText('');
    setSending(true);
    try {
      const msg = await sendMessage(room_id, content);
      setMessages(p => [...p, msg]);
      listRef.current?.scrollToEnd({ animated: true });
    } catch (e) { setText(content); }
    finally { setSending(false); }
  };

  const isMine = (msg) => msg.sender_id === profile?.id;

  const renderMsg = ({ item }) => {
    const mine = isMine(item);
    return (
      <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleTheirs,
        item.is_admin_message && s.bubbleAdmin]}>
        {item.is_admin_message && (
          <Text style={s.adminLabel}>⚙️ MOVO Admin</Text>
        )}
        <Text style={[s.msgText, mine ? s.msgTextMine : s.msgTextTheirs]}>
          {item.content}
        </Text>
        <Text style={s.msgTime}>
          {item.created_at ? new Date(item.created_at).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : ''}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[s.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Başlık */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title}>Mesajlar</Text>
        <Ionicons name="ellipsis-horizontal" size={22} color="#888" />
      </View>

      {loading ? (
        <View style={s.centered}><ActivityIndicator color="#22C55E" /></View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m,i) => m.id?.toString() || String(i)}
          renderItem={renderMsg}
          contentContainerStyle={{ padding:16, gap:8 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd()}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyText}>Henüz mesaj yok. Merhaba de!</Text>
            </View>
          }
        />
      )}

      {/* Giriş alanı */}
      <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={s.input}
          placeholder="Mesaj yaz..."
          placeholderTextColor="#555"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={1000}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <TouchableOpacity
          style={[s.sendBtn, (!text.trim() || sending) && s.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          <Ionicons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:     { flex:1, backgroundColor:'#0D0D0D' },
  centered:      { flex:1, alignItems:'center', justifyContent:'center' },
  header:        { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:16, paddingBottom:12 },
  title:         { flex:1, color:'#fff', fontSize:18, fontWeight:'700' },
  bubble:        { maxWidth:'78%', borderRadius:18, paddingHorizontal:14, paddingVertical:9 },
  bubbleMine:    { alignSelf:'flex-end', backgroundColor:'#22C55E', borderBottomRightRadius:4 },
  bubbleTheirs:  { alignSelf:'flex-start', backgroundColor:'#1A1A1A', borderBottomLeftRadius:4 },
  bubbleAdmin:   { alignSelf:'flex-start', backgroundColor:'#1A1A2E', borderWidth:0.5, borderColor:'#3B3B6B', borderBottomLeftRadius:4 },
  adminLabel:    { color:'#818CF8', fontSize:10, fontWeight:'600', marginBottom:4 },
  msgText:       { fontSize:14, lineHeight:20 },
  msgTextMine:   { color:'#fff' },
  msgTextTheirs: { color:'#e5e5e5' },
  msgTime:       { fontSize:10, marginTop:4, alignSelf:'flex-end', color:'rgba(255,255,255,0.5)' },
  inputBar:      { flexDirection:'row', alignItems:'flex-end', gap:10, paddingHorizontal:16, paddingTop:10, borderTopWidth:0.5, borderTopColor:'#111', backgroundColor:'#0D0D0D' },
  input:         { flex:1, backgroundColor:'#111', color:'#fff', borderRadius:24, paddingHorizontal:16, paddingVertical:10, fontSize:14, maxHeight:120, borderWidth:0.5, borderColor:'#2A2A2A' },
  sendBtn:       { width:44, height:44, backgroundColor:'#22C55E', borderRadius:22, alignItems:'center', justifyContent:'center' },
  sendBtnDisabled:{ backgroundColor:'#1A3A1A', opacity:0.5 },
  empty:         { alignItems:'center', paddingTop:60 },
  emptyText:     { color:'#555', fontSize:14 },
});
