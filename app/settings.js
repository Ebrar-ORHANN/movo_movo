// ── app/settings.js ──────────────────────────────────────────────────────────
import React from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';

function SettingRow({ icon, label, onPress, isAdmin, rightElement, danger }) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.iconWrap, isAdmin && s.iconAdmin, danger && s.iconDanger]}>
        <Ionicons
          name={icon}
          size={20}
          color={danger ? '#ef4444' : isAdmin ? '#22C55E' : '#aaa'}
        />
      </View>
      <Text style={[s.label, danger && { color: '#ef4444' }, isAdmin && { color: '#22C55E' }]}>
        {label}
      </Text>
      {rightElement || <Ionicons name="chevron-forward" size={18} color="#333" />}
    </TouchableOpacity>
  );
}

function SectionTitle({ title }) {
  return <Text style={s.sectionTitle}>{title}</Text>;
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, permissions, logout } = useAuth();
  const isAdmin = permissions?.is_admin;

  const handleLogout = () => {
    Alert.alert('Çıkış Yap', 'Hesabından çıkmak istediğine emin misin?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Çıkış Yap', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Ayarlar</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>

        {/* Hesap */}
        <SectionTitle title="Hesap" />
        <View style={s.group}>
          <SettingRow
            icon="create-outline"
            label="Profili Düzenle"
            onPress={() => router.push('/profile/edit')}
          />
          <SettingRow
            icon="lock-closed-outline"
            label="Gizlilik"
            onPress={() => router.push('/profile/edit')}
          />
          <SettingRow
            icon="key-outline"
            label="Şifre Değiştir"
            onPress={() => Alert.alert('Yakında', 'Bu özellik yakında eklenecek.')}
          />
        </View>

        {/* Bildirimler */}
        <SectionTitle title="Bildirimler" />
        <View style={s.group}>
          <SettingRow
            icon="notifications-outline"
            label="Bildirim Tercihleri"
            onPress={() => router.push('/notifications')}
          />
          <SettingRow
            icon="mail-outline"
            label="E-posta Bildirimleri"
            onPress={() => Alert.alert('Yakında', 'Bu özellik yakında eklenecek.')}
          />
        </View>

        {/* Uygulama */}
        <SectionTitle title="Uygulama" />
        <View style={s.group}>
          <SettingRow
            icon="language-outline"
            label="Dil"
            onPress={() => router.push('/profile/edit')}
          />
          <SettingRow
            icon="star-outline"
            label="Uygulamayı Değerlendir"
            onPress={() => Alert.alert('Teşekkürler!', 'Değerlendirme için uygulama mağazasına yönlendiriliyorsunuz.')}
          />
          <SettingRow
            icon="share-social-outline"
            label="Arkadaşlarını Davet Et"
            onPress={() => Alert.alert('Yakında', 'Bu özellik yakında eklenecek.')}
          />
        </View>

        {/* Destek */}
        <SectionTitle title="Destek" />
        <View style={s.group}>
          <SettingRow
            icon="help-circle-outline"
            label="Yardım & Destek"
            onPress={() => Alert.alert('Destek', 'destek@movo.app adresine ulaşabilirsiniz.')}
          />
          <SettingRow
            icon="document-text-outline"
            label="Gizlilik Politikası"
            onPress={() => Alert.alert('Yakında', 'Bu özellik yakında eklenecek.')}
          />
          <SettingRow
            icon="shield-checkmark-outline"
            label="Kullanım Şartları"
            onPress={() => Alert.alert('Yakında', 'Bu özellik yakında eklenecek.')}
          />
        </View>

        {/* Admin */}
        {isAdmin && (
          <>
            <SectionTitle title="Yönetici" />
            <View style={s.group}>
              <SettingRow
                icon="shield-outline"
                label="Admin Paneli"
                onPress={() => router.push('/admin/index')}
                isAdmin
              />
            </View>
          </>
        )}

        {/* Tehlike bölgesi */}
        <SectionTitle title="Hesap İşlemleri" />
        <View style={s.group}>
          <SettingRow
            icon="log-out-outline"
            label="Çıkış Yap"
            onPress={handleLogout}
            danger
          />
          <SettingRow
            icon="trash-outline"
            label="Hesabı Sil"
            onPress={() => Alert.alert(
              'Hesabı Sil',
              'Hesabını kalıcı olarak silmek istediğinden emin misin? Bu işlem geri alınamaz.',
              [
                { text: 'İptal', style: 'cancel' },
                { text: 'Sil', style: 'destructive', onPress: () => Alert.alert('Yakında', 'Bu özellik yakında eklenecek.') },
              ]
            )}
            danger
          />
        </View>

        {/* Versiyon */}
        <Text style={s.version}>MOVO v1.0.0 · Yapay Zeka Destekli Keşif</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0D0D0D' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: '#1C1C1C' },
  backBtn:      { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { color: '#fff', fontSize: 18, fontWeight: '700' },
  sectionTitle: { color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  group:        { backgroundColor: '#111', marginHorizontal: 16, borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: '#1C1C1C' },
  row:          { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#1A1A1A' },
  iconWrap:     { width: 34, height: 34, borderRadius: 10, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center' },
  iconAdmin:    { backgroundColor: '#0A2A1A' },
  iconDanger:   { backgroundColor: '#2A0A0A' },
  label:        { flex: 1, color: '#ccc', fontSize: 15 },
  version:      { textAlign: 'center', color: '#333', fontSize: 12, marginTop: 32, marginBottom: 8 },
});