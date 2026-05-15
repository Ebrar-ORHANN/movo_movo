// ── app/admin/index.js ───────────────────────────────────────────────────────
// DB: admin_roles (check_admin_permission), pois, events, reports, users
// Admin sekmesi sadece admin_roles.is_admin=TRUE olan kullanıcıya görünür
// Scope bazlı: global admin her şeyi görür; şehir admini sadece şehrine ait

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
//import { getMyPermissions, listPendingPOIs, approvePOI, rejectPOI, listReports, resolveReport } from '../../services/notificationService';
import { getMyPermissions, listPendingPOIs, approvePOI, rejectPOI, listReports, resolveReport } from '../../services/adminService';
export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [perms, setPerms]       = useState(null);
  const [pendingPOIs, setPOIs]  = useState([]);
  const [reports, setReports]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState('pois');

  useEffect(() => {
    Promise.all([
      getMyPermissions(),
      listPendingPOIs(),
      listReports('pending'),
    ]).then(([p, pois, reps]) => {
      setPerms(p);
      setPOIs(pois || []);
      setReports(reps || []);
    }).catch(e => Alert.alert('Hata', e.message))
    .finally(() => setLoading(false));
  }, []);

  const handleApprovePOI = async (id) => {
    await approvePOI(id);
    setPOIs(p => p.filter(x => x.id !== id));
    Alert.alert('Onaylandı', 'Kullanıcıya bildirim gönderildi');
  };

  const handleRejectPOI = async (id) => {
    await rejectPOI(id, 'Uygun değil');
    setPOIs(p => p.filter(x => x.id !== id));
  };

  const handleResolveReport = async (id) => {
    await resolveReport(id);
    setReports(r => r.filter(x => x.id !== id));
  };

  if (loading) return (
    <View style={[s.container, s.centered, { paddingTop: insets.top }]}>
      <ActivityIndicator color="#22C55E" size="large" />
    </View>
  );

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title}>Admin Paneli</Text>
        <View style={s.scopeBadge}>
          <Text style={s.scopeText}>{perms?.is_global_admin ? 'Global' : 'Şehir'}</Text>
        </View>
      </View>

      {/* Yetki özeti */}
      <View style={s.permsRow}>
        {Object.entries(perms?.permissions || {}).filter(([,v])=>v).map(([k]) => (
          <View key={k} style={s.permChip}>
            <Text style={s.permText}>{k.replace('can_','').replace(/_/g,' ')}</Text>
          </View>
        ))}
      </View>

      {/* Sekmeler */}
      <View style={s.tabs}>
        {[['pois','POI Onayları',pendingPOIs.length],['reports','Raporlar',reports.length]].map(([key,label,cnt]) => (
          <TouchableOpacity key={key} style={[s.tab, tab===key&&s.tabActive]} onPress={() => setTab(key)}>
            <Text style={[s.tabText, tab===key&&s.tabTextActive]}>{label}</Text>
            {cnt > 0 && <View style={s.tabBadge}><Text style={s.tabBadgeText}>{cnt}</Text></View>}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ flex:1 }}>
        {tab === 'pois' && (
          <View style={s.list}>
            {pendingPOIs.map(poi => (
              <View key={poi.id} style={s.itemCard}>
                <View style={{ flex:1 }}>
                  <Text style={s.itemTitle}>{poi.name}</Text>
                  <Text style={s.itemMeta}>{poi.category} · {poi.submitter}</Text>
                  <Text style={s.itemAddress} numberOfLines={1}>{poi.address}</Text>
                </View>
                <View style={s.itemActions}>
                  <TouchableOpacity style={s.approveBtn} onPress={() => handleApprovePOI(poi.id)}>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.rejectBtn} onPress={() => handleRejectPOI(poi.id)}>
                    <Ionicons name="close" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            {pendingPOIs.length === 0 && <Text style={s.empty}>Bekleyen POI yok ✓</Text>}
          </View>
        )}

        {tab === 'reports' && (
          <View style={s.list}>
            {reports.map(rep => (
              <View key={rep.id} style={s.itemCard}>
                <View style={{ flex:1 }}>
                  <Text style={s.itemTitle}>{rep.target_type} — {rep.reason}</Text>
                  <Text style={s.itemMeta}>{rep.reporter_username}</Text>
                  {rep.note && <Text style={s.itemAddress} numberOfLines={2}>{rep.note}</Text>}
                </View>
                <TouchableOpacity style={s.approveBtn} onPress={() => handleResolveReport(rep.id)}>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            {reports.length === 0 && <Text style={s.empty}>Bekleyen rapor yok ✓</Text>}
          </View>
        )}
        <View style={{ height:40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex:1, backgroundColor:'#0D0D0D' },
  centered:    { alignItems:'center', justifyContent:'center' },
  header:      { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:16, paddingBottom:12 },
  title:       { flex:1, color:'#fff', fontSize:20, fontWeight:'700' },
  scopeBadge:  { backgroundColor:'#22C55E', paddingHorizontal:10, paddingVertical:4, borderRadius:10 },
  scopeText:   { color:'#fff', fontSize:12, fontWeight:'600' },
  permsRow:    { flexDirection:'row', flexWrap:'wrap', gap:6, paddingHorizontal:16, marginBottom:12 },
  permChip:    { backgroundColor:'#1A2E1A', paddingHorizontal:10, paddingVertical:4, borderRadius:10 },
  permText:    { color:'#22C55E', fontSize:11, textTransform:'capitalize' },
  tabs:        { flexDirection:'row', paddingHorizontal:16, gap:10, marginBottom:12 },
  tab:         { flexDirection:'row', alignItems:'center', gap:6, paddingVertical:8, paddingHorizontal:16, borderRadius:20, backgroundColor:'#111', borderWidth:0.5, borderColor:'#2A2A2A' },
  tabActive:   { backgroundColor:'#22C55E', borderColor:'#22C55E' },
  tabText:     { color:'#888', fontSize:13, fontWeight:'500' },
  tabTextActive:{ color:'#fff' },
  tabBadge:    { backgroundColor:'#ef4444', borderRadius:8, minWidth:18, height:18, alignItems:'center', justifyContent:'center', paddingHorizontal:4 },
  tabBadgeText:{ color:'#fff', fontSize:10, fontWeight:'700' },
  list:        { paddingHorizontal:16, gap:10 },
  itemCard:    { flexDirection:'row', alignItems:'center', backgroundColor:'#111', borderRadius:14, padding:14, gap:12, borderWidth:0.5, borderColor:'#1A1A1A' },
  itemTitle:   { color:'#fff', fontSize:14, fontWeight:'600' },
  itemMeta:    { color:'#888', fontSize:12, marginTop:2 },
  itemAddress: { color:'#555', fontSize:11, marginTop:4 },
  itemActions: { flexDirection:'row', gap:8 },
  approveBtn:  { width:36, height:36, borderRadius:18, backgroundColor:'#166534', alignItems:'center', justifyContent:'center' },
  rejectBtn:   { width:36, height:36, borderRadius:18, backgroundColor:'#7f1d1d', alignItems:'center', justifyContent:'center' },
  empty:       { textAlign:'center', color:'#555', padding:30, fontSize:15 },
});
