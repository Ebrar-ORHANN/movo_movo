// ── app/(tabs)/profile.js ────────────────────────────────────────────────────
// DB: users, follows, routes, events, saves, admin_roles
// Toplam Km: routes.distance_m toplamı
// Admin sekme: admin_roles.is_admin=TRUE ise görünür

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Dimensions, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import useProfile from '../../hooks/useProfile';

const { width } = Dimensions.get('window');
const IMG_SIZE = (width - 52) / 2;

const BADGES = [
  { icon:'🏔️', label:'Dağcı' }, { icon:'🚴', label:'Bisikletçi' },
  { icon:'⛺', label:'Kampçı' }, { icon:'📸', label:'Fotoğrafçı' },
];

function StatItem({ value, label }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{typeof value==='number' ? value.toFixed(value>100?0:1) : value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, stats, routes, events, saved, adminPerms, loading, activeTab, setActiveTab, totalKm, logout } = useProfile();

  const handleLogout = () => {
    Alert.alert('Çıkış Yap', 'Hesabından çıkmak istediğine emin misin?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Çıkış Yap', style: 'destructive', onPress: logout },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, alignItems:'center', justifyContent:'center' }]}>
        <ActivityIndicator color="#22C55E" size="large" />
      </View>
    );
  }

  const initials = profile?.display_name?.slice(0,1).toUpperCase() || '?';
  const followerCnt = stats?.follower_cnt || 0;
  const routeCnt    = stats?.route_cnt    || routes.length;

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} showsVerticalScrollIndicator={false}>
      {/* Başlık */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profil</Text>
        <TouchableOpacity onPress={() => {}}>
          <Ionicons name="qr-code-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Profil bilgisi */}
      <View style={styles.profileSection}>
        <View style={styles.avatarWrap}>
          {profile?.avatar_url
            ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            : <View style={[styles.avatar, styles.avatarInitials]}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
          }
          {adminPerms?.is_admin && (
            <View style={styles.adminBadge}><Text style={{fontSize:10}}>⚙️</Text></View>
          )}
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.displayName}>{profile?.display_name || 'Kullanıcı'}</Text>
          <Text style={styles.username}>@{profile?.username || 'movo_kullanici'}</Text>
          {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
        </View>
      </View>

      {/* İstatistikler */}
      <View style={styles.stats}>
        <StatItem value={routeCnt}         label="Rota"     />
        <View style={styles.statDivider} />
        <StatItem value={followerCnt}      label="Takipçi"  />
        <View style={styles.statDivider} />
        <StatItem value={totalKm}          label="Km"       />
      </View>

      {/* Aksiyon butonları */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.editBtn} onPress={() => {}}>
          <Ionicons name="create-outline" size={16} color="#fff" />
          <Text style={styles.editText}>Profili Düzenle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareBtn}>
          <Ionicons name="share-outline" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Rozetler */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            <Ionicons name="ribbon-outline" size={16} color="#22C55E" /> Rozetler
          </Text>
          <TouchableOpacity><Text style={styles.sectionMore}>Tümü</Text></TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.badgesRow}>
          {BADGES.map((b,i) => (
            <View key={i} style={styles.badgeItem}>
              <View style={styles.badgeIcon}><Text style={{fontSize:22}}>{b.icon}</Text></View>
              <Text style={styles.badgeLabel}>{b.label}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Katılım skoru */}
      <View style={styles.scoreCard}>
        <Text style={styles.scoreLabel}>Katılım Skoru</Text>
        <Text style={styles.scoreValue}>{profile?.participation_score?.toLocaleString('tr-TR') || '0'}</Text>
        <Text style={styles.scoreSub}>
          Trust: {profile?.trust_score?.toFixed(1) || '1.0'}
        </Text>
      </View>

      {/* Sekmeler */}
      <View style={styles.tabs}>
        {['rotalar','etkinlikler','kaydedilenler'].map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab===tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab===tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase()+tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Sekme içeriği */}
      {activeTab === 'rotalar' && (
        <View style={styles.grid}>
          {routes.map(r => (
            <TouchableOpacity key={r.id} style={styles.gridItem}
              onPress={() => router.push(`/route/${r.id}`)}>
              <View style={styles.gridImg}>
                <Text style={styles.gridTitle} numberOfLines={2}>{r.title || 'Rota'}</Text>
                <Text style={styles.gridMeta}>
                  {r.distance_m ? `${(r.distance_m/1000).toFixed(1)}km` : ''}
                  {r.created_at ? ` · ${new Date(r.created_at).toLocaleDateString('tr-TR',{day:'numeric',month:'short'})}` : ''}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
          {routes.length === 0 && (
            <Text style={styles.emptyText}>Henüz rota yok</Text>
          )}
        </View>
      )}

      {activeTab === 'etkinlikler' && (
        <View style={styles.listSection}>
          {events.map(e => (
            <TouchableOpacity key={e.id} style={styles.listItem}
              onPress={() => router.push(`/events/${e.id}`)}>
              <Text style={styles.listTitle}>{e.title}</Text>
              <Text style={styles.listMeta}>{e.status}</Text>
            </TouchableOpacity>
          ))}
          {events.length === 0 && <Text style={styles.emptyText}>Henüz etkinlik yok</Text>}
        </View>
      )}

      {activeTab === 'kaydedilenler' && (
        <View style={styles.listSection}>
          {saved.map(s => (
            <View key={`${s.target_type}-${s.target_id}`} style={styles.listItem}>
              <Text style={styles.listTitle}>{s.target_type}</Text>
              <Text style={styles.listMeta}>{s.saved_at?.slice(0,10)}</Text>
            </View>
          ))}
          {saved.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔖</Text>
              <Text style={styles.emptyText}>Kaydedilen içerik yok</Text>
            </View>
          )}
        </View>
      )}

      {/* Ayarlar */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ayarlar</Text>
        {[
          { icon:'settings-outline',    label:'Hesap Ayarları',      onPress:()=>{} },
          { icon:'lock-closed-outline', label:'Gizlilik',            onPress:()=>{} },
          { icon:'notifications-outline',label:'Bildirimler',        onPress:()=> router.push('/notifications') },
          { icon:'help-circle-outline', label:'Yardım & Destek',     onPress:()=>{} },
          { icon:'star-outline',        label:'Uygulamayı Değerlendir', onPress:()=>{} },
          ...(adminPerms?.is_admin ? [{ icon:'shield-outline', label:'Admin Paneli', onPress:()=>router.push('/admin/index'), isAdmin:true }] : []),
        ].map((item,i) => (
          <TouchableOpacity key={i} style={styles.settingRow} onPress={item.onPress}>
            <Ionicons name={item.icon} size={20} color={item.isAdmin?'#22C55E':'#888'} />
            <Text style={[styles.settingLabel, item.isAdmin&&{color:'#22C55E'}]}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color="#444" />
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[styles.settingRow,{borderTopWidth:0.5,borderTopColor:'#2A2A2A',marginTop:8}]} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          <Text style={[styles.settingLabel,{color:'#ef4444'}]}>Çıkış Yap</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>MOVO v1.0.0 · Yapay Zeka Destekli Keşif</Text>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:    { flex:1, backgroundColor:'#0D0D0D' },
  header:       { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:20, paddingBottom:16 },
  headerTitle:  { color:'#fff', fontSize:22, fontWeight:'700' },
  profileSection:{ flexDirection:'row', alignItems:'flex-start', paddingHorizontal:20, marginBottom:16, gap:14 },
  avatarWrap:   { position:'relative' },
  avatar:       { width:70, height:70, borderRadius:35 },
  avatarInitials:{ backgroundColor:'#22C55E', alignItems:'center', justifyContent:'center' },
  avatarText:   { color:'#fff', fontSize:28, fontWeight:'700' },
  adminBadge:   { position:'absolute', bottom:0, right:0, backgroundColor:'#1A1A1A', borderRadius:8, padding:2, borderWidth:0.5, borderColor:'#22C55E' },
  profileInfo:  { flex:1 },
  displayName:  { color:'#fff', fontSize:18, fontWeight:'700' },
  username:     { color:'#888', fontSize:14, marginTop:2 },
  bio:          { color:'#aaa', fontSize:13, marginTop:6, lineHeight:18 },
  stats:        { flexDirection:'row', justifyContent:'space-around', alignItems:'center', backgroundColor:'#111', marginHorizontal:20, borderRadius:14, padding:16, marginBottom:16, borderWidth:0.5, borderColor:'#2A2A2A' },
  statItem:     { alignItems:'center', flex:1 },
  statValue:    { color:'#fff', fontSize:20, fontWeight:'700' },
  statLabel:    { color:'#888', fontSize:12, marginTop:2 },
  statDivider:  { width:0.5, height:30, backgroundColor:'#2A2A2A' },
  actions:      { flexDirection:'row', gap:10, paddingHorizontal:20, marginBottom:20 },
  editBtn:      { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, backgroundColor:'#1A1A1A', borderRadius:12, paddingVertical:10, borderWidth:0.5, borderColor:'#2A2A2A' },
  editText:     { color:'#fff', fontSize:14, fontWeight:'500' },
  shareBtn:     { width:44, height:44, backgroundColor:'#1A1A1A', borderRadius:12, alignItems:'center', justifyContent:'center', borderWidth:0.5, borderColor:'#2A2A2A' },
  section:      { paddingHorizontal:20, marginBottom:20 },
  sectionHeader:{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12 },
  sectionTitle: { color:'#fff', fontSize:16, fontWeight:'600' },
  sectionMore:  { color:'#22C55E', fontSize:13 },
  badgesRow:    { marginHorizontal:-4 },
  badgeItem:    { alignItems:'center', marginHorizontal:8 },
  badgeIcon:    { width:56, height:56, borderRadius:28, backgroundColor:'#1A1A1A', alignItems:'center', justifyContent:'center', borderWidth:0.5, borderColor:'#2A2A2A' },
  badgeLabel:   { color:'#888', fontSize:11, marginTop:4 },
  scoreCard:    { marginHorizontal:20, backgroundColor:'#111', borderRadius:14, padding:16, marginBottom:20, borderWidth:0.5, borderColor:'#2A2A2A' },
  scoreLabel:   { color:'#888', fontSize:12 },
  scoreValue:   { color:'#22C55E', fontSize:28, fontWeight:'700', marginTop:2 },
  scoreSub:     { color:'#666', fontSize:12, marginTop:2 },
  tabs:         { flexDirection:'row', marginHorizontal:20, marginBottom:16, backgroundColor:'#111', borderRadius:12, padding:4 },
  tab:          { flex:1, paddingVertical:8, alignItems:'center', borderRadius:10 },
  tabActive:    { backgroundColor:'#22C55E' },
  tabText:      { color:'#888', fontSize:13, fontWeight:'500' },
  tabTextActive:{ color:'#fff' },
  grid:         { flexDirection:'row', flexWrap:'wrap', paddingHorizontal:20, gap:12, marginBottom:20 },
  gridItem:     { width:IMG_SIZE, height:IMG_SIZE, borderRadius:12, overflow:'hidden' },
  gridImg:      { flex:1, backgroundColor:'#1A2E1A', padding:12, justifyContent:'flex-end' },
  gridTitle:    { color:'#fff', fontSize:13, fontWeight:'600' },
  gridMeta:     { color:'#22C55E', fontSize:11, marginTop:2 },
  listSection:  { paddingHorizontal:20, marginBottom:20 },
  listItem:     { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:12, borderBottomWidth:0.5, borderBottomColor:'#1A1A1A' },
  listTitle:    { color:'#fff', fontSize:14 },
  listMeta:     { color:'#888', fontSize:12 },
  emptyState:   { alignItems:'center', paddingVertical:40 },
  emptyIcon:    { fontSize:40, marginBottom:10 },
  emptyText:    { color:'#555', fontSize:14, textAlign:'center', padding:20 },
  settingRow:   { flexDirection:'row', alignItems:'center', gap:12, paddingVertical:14, borderBottomWidth:0.5, borderBottomColor:'#111' },
  settingLabel: { flex:1, color:'#ccc', fontSize:15 },
  version:      { textAlign:'center', color:'#333', fontSize:12, marginBottom:8 },
});
