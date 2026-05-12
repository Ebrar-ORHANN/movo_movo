// ── app/events/[id].js ───────────────────────────────────────────────────────
// DB: events, event_attendees, event_stops, waiting_room
// QR check-in: check_in_token → POST /events/check-in → participation_score artar (trigger)

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getEvent, joinEvent, leaveEvent, EVENT_CATEGORY_MAP } from '../../services/eventService';

export default function EventDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [event,   setEvent]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    getEvent(id).then(setEvent).catch(console.warn).finally(() => setLoading(false));
  }, [id]);

  const handleJoin = async () => {
    setJoining(true);
    try {
      await joinEvent(id);
      setEvent(e => ({ ...e, is_attending: true, attendee_cnt: (e.attendee_cnt||0)+1 }));
    } catch (e) {
      // Dolu ise waiting_room'a eklenir
      if (e.message.includes('full') || e.message.includes('dolu')) {
        Alert.alert('Etkinlik Dolu', 'Bekleme listesine alındın. Yer açılırsa bildirim alırsın.');
      } else Alert.alert('Hata', e.message);
    } finally { setJoining(false); }
  };

  const handleLeave = async () => {
    Alert.alert('Etkinlikten Çık', 'Etkinliği bırakmak istediğine emin misin?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Bırak', style: 'destructive', onPress: async () => {
        await leaveEvent(id);
        setEvent(e => ({ ...e, is_attending: false, attendee_cnt: Math.max(0,(e.attendee_cnt||1)-1) }));
      }},
    ]);
  };

  if (loading) return (
    <View style={[s.container, s.centered, { paddingTop: insets.top }]}>
      <ActivityIndicator color="#22C55E" size="large" />
    </View>
  );

  if (!event) return (
    <View style={[s.container, s.centered, { paddingTop: insets.top }]}>
      <Text style={{ color:'#888' }}>Etkinlik bulunamadı</Text>
    </View>
  );

  const cat = EVENT_CATEGORY_MAP[event.categories?.[0]] || EVENT_CATEGORY_MAP.other;
  const isFull = event.attendee_cnt >= (event.max_participants || Infinity);
  const statusColor = event.status === 'upcoming' ? '#22C55E' : event.status === 'ongoing' ? '#F59E0B' : '#888';

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Başlık */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{event.title}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Görsel */}
        <View style={s.banner}>
          <Text style={{ fontSize:48 }}>{cat.icon}</Text>
          <View style={[s.statusPill, { backgroundColor: statusColor }]}>
            <Text style={s.statusText}>{event.status}</Text>
          </View>
        </View>

        {/* Bilgiler */}
        <View style={s.section}>
          <View style={s.infoRow}>
            <Ionicons name="calendar-outline" size={16} color="#888" />
            <Text style={s.infoTxt}>
              {event.start_time ? new Date(event.start_time).toLocaleString('tr-TR') : '—'}
            </Text>
          </View>
          <View style={s.infoRow}>
            <Ionicons name="people-outline" size={16} color="#888" />
            <Text style={s.infoTxt}>
              {event.attendee_cnt || 0} / {event.max_participants || '∞'} katılımcı
            </Text>
          </View>
          {event.location_text && (
            <View style={s.infoRow}>
              <Ionicons name="location-outline" size={16} color="#888" />
              <Text style={s.infoTxt}>{event.location_text}</Text>
            </View>
          )}
          {event.participation_pts > 0 && (
            <View style={s.scoreInfo}>
              <Ionicons name="star-outline" size={14} color="#22C55E" />
              <Text style={s.scoreInfoTxt}>Check-in'de +{event.participation_pts} katılım puanı</Text>
            </View>
          )}
        </View>

        {/* Açıklama */}
        {event.description && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Hakkında</Text>
            <Text style={s.desc}>{event.description}</Text>
          </View>
        )}

        {/* Etiketler */}
        {event.categories?.length > 0 && (
          <View style={s.tagsRow}>
            {event.categories.map((c,i) => (
              <View key={i} style={s.tag}>
                <Text style={s.tagTxt}>{EVENT_CATEGORY_MAP[c]?.label || c}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Alt katılım butonu */}
      <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {event.is_attending ? (
          <View style={s.attendingRow}>
            <View style={s.attendingBadge}>
              <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
              <Text style={s.attendingTxt}>Katılıyorsun</Text>
            </View>
            <TouchableOpacity style={s.leaveBtn} onPress={handleLeave}>
              <Text style={s.leaveTxt}>Bırak</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[s.joinBtn, (isFull || joining) && s.joinBtnDisabled]}
            onPress={handleJoin}
            disabled={joining}
          >
            {joining ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Ionicons name="add-circle-outline" size={20} color="#fff" />
                <Text style={s.joinTxt}>{isFull ? 'Bekleme Listesine Gir' : 'Katıl'}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex:1, backgroundColor:'#0D0D0D' },
  centered:     { alignItems:'center', justifyContent:'center' },
  header:       { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:16, paddingBottom:12 },
  title:        { flex:1, color:'#fff', fontSize:18, fontWeight:'700' },
  banner:       { height:180, backgroundColor:'#111', alignItems:'center', justifyContent:'center', position:'relative' },
  statusPill:   { position:'absolute', top:14, right:14, paddingHorizontal:12, paddingVertical:4, borderRadius:12 },
  statusText:   { color:'#fff', fontSize:12, fontWeight:'600', textTransform:'capitalize' },
  section:      { padding:16, borderBottomWidth:0.5, borderBottomColor:'#111' },
  sectionTitle: { color:'#fff', fontSize:16, fontWeight:'600', marginBottom:10 },
  infoRow:      { flexDirection:'row', alignItems:'center', gap:10, marginBottom:8 },
  infoTxt:      { color:'#ccc', fontSize:14, flex:1 },
  scoreInfo:    { flexDirection:'row', alignItems:'center', gap:6, backgroundColor:'#0A1F0A', borderRadius:10, padding:8, marginTop:4 },
  scoreInfoTxt: { color:'#22C55E', fontSize:13 },
  desc:         { color:'#ccc', fontSize:14, lineHeight:21 },
  tagsRow:      { flexDirection:'row', flexWrap:'wrap', gap:6, padding:16 },
  tag:          { backgroundColor:'#1A1A1A', paddingHorizontal:12, paddingVertical:5, borderRadius:10, borderWidth:0.5, borderColor:'#2A2A2A' },
  tagTxt:       { color:'#888', fontSize:12 },
  bottomBar:    { backgroundColor:'#0D0D0D', paddingHorizontal:16, paddingTop:12, borderTopWidth:0.5, borderTopColor:'#111' },
  attendingRow: { flexDirection:'row', alignItems:'center', gap:12 },
  attendingBadge:{ flex:1, flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'#0A1F0A', borderRadius:14, padding:14 },
  attendingTxt: { color:'#22C55E', fontSize:15, fontWeight:'600' },
  leaveBtn:     { paddingHorizontal:18, paddingVertical:14, borderRadius:14, backgroundColor:'#1A1A1A', borderWidth:0.5, borderColor:'#2A2A2A' },
  leaveTxt:     { color:'#888', fontSize:14 },
  joinBtn:      { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:'#22C55E', borderRadius:14, paddingVertical:16 },
  joinBtnDisabled:{ backgroundColor:'#166534', opacity:0.7 },
  joinTxt:      { color:'#fff', fontSize:16, fontWeight:'700' },
});
