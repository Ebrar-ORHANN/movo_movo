// ── app/settings.js ──────────────────────────────────────────────────────────
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Modal, Pressable, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../services/api';

const LANGUAGES = [
  { code: 'tr', label: 'Türkçe',   flag: '🇹🇷' },
  { code: 'en', label: 'English',  flag: '🇬🇧' },
  { code: 'de', label: 'Deutsch',  flag: '🇩🇪' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
];

// Gizlilik seçenekleri — t() ile dinamik
const privacyOptions = (t) => [
  { value: 'public',    icon: 'earth-outline',       label: t('public'),       desc: t('publicDesc') },
  { value: 'followers', icon: 'people-outline',      label: t('followersOnly'), desc: t('followersDesc') },
  { value: 'private',   icon: 'lock-closed-outline', label: t('private'),      desc: t('privateDesc') },
];

// ── Alt bileşenler ────────────────────────────────────────────────────────────
function SectionTitle({ title }) {
  return <Text style={s.sectionTitle}>{title}</Text>;
}

function SettingRow({ icon, iconColor = '#aaa', iconBg = '#1A1A1A', label, value, onPress, danger }) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.iconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={19} color={danger ? '#ef4444' : iconColor} />
      </View>
      <Text style={[s.label, danger && { color: '#ef4444' }]}>{label}</Text>
      {value
        ? <Text style={s.rowValue}>{value}</Text>
        : <Ionicons name="chevron-forward" size={17} color="#333" />
      }
    </TouchableOpacity>
  );
}

// ── Gizlilik modalı ───────────────────────────────────────────────────────────
function PrivacyModal({ visible, current, onSave, onClose, t }) {
  const [selected, setSelected] = useState(current);
  const [saving, setSaving]     = useState(false);
  const options                 = privacyOptions(t);

  const handleSave = async () => {
    if (selected === current) { onClose(); return; }
    setSaving(true);
    try {
      await api.patch('/users/me/privacy', { privacy: selected });
      onSave(selected);
      onClose();
    } catch {
      Alert.alert(t('error'), 'Gizlilik güncellenemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.sheetHandle} />
        <Text style={s.sheetTitle}>{t('privacy')}</Text>

        {options.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[s.optRow, selected === opt.value && s.optRowActive]}
            onPress={() => setSelected(opt.value)}
            activeOpacity={0.75}
          >
            <View style={[s.optIcon, selected === opt.value && s.optIconActive]}>
              <Ionicons name={opt.icon} size={20} color={selected === opt.value ? '#22C55E' : '#888'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.optLabel, selected === opt.value && { color: '#fff' }]}>{opt.label}</Text>
              <Text style={s.optDesc}>{opt.desc}</Text>
            </View>
            {selected === opt.value && <Ionicons name="checkmark-circle" size={20} color="#22C55E" />}
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.saveBtnText}>{t('save')}</Text>
          }
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Dil modalı ────────────────────────────────────────────────────────────────
function LanguageModal({ visible, current, onSave, onClose, t }) {
  const [selected, setSelected] = useState(current);
  const [saving, setSaving]     = useState(false);

  const handleSave = async () => {
    if (selected === current) { onClose(); return; }
    setSaving(true);
    try {
      await api.patch('/users/me', { preferred_language: selected });
      onSave(selected);
      onClose();
    } catch {
      Alert.alert(t('error'), 'Dil güncellenemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.sheetHandle} />
        <Text style={s.sheetTitle}>{t('language')}</Text>

        {LANGUAGES.map(lang => (
          <TouchableOpacity
            key={lang.code}
            style={[s.optRow, selected === lang.code && s.optRowActive]}
            onPress={() => setSelected(lang.code)}
            activeOpacity={0.75}
          >
            <Text style={s.langFlag}>{lang.flag}</Text>
            <Text style={[s.optLabel, { flex: 1 }, selected === lang.code && { color: '#fff' }]}>
              {lang.label}
            </Text>
            {selected === lang.code && <Ionicons name="checkmark-circle" size={20} color="#22C55E" />}
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.saveBtnText}>{t('save')}</Text>
          }
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Ana ekran ─────────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { profile, permissions, refreshProfile, logout: ctxLogout } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const isAdmin = permissions?.is_admin;

  const [privacy,     setPrivacy]     = useState(profile?.privacy            || 'public');
  const [language,    setLanguage]    = useState(profile?.preferred_language  || lang || 'tr');
  const [showPrivacy,  setShowPrivacy]  = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);

  const opts          = privacyOptions(t);
  const privacyLabel  = opts.find(o => o.value === privacy)?.label || t('public');
  const langObj       = LANGUAGES.find(l => l.code === language);
  const languageLabel = langObj?.label || 'Türkçe';
  const languageFlag  = langObj?.flag  || '🇹🇷';

  const handleLogout = () => {
    Alert.alert(t('logout'), t('logoutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logout'), style: 'destructive', onPress: ctxLogout },
    ]);
  };

  const handlePrivacySave = async (newPrivacy) => {
    setPrivacy(newPrivacy);
    await refreshProfile?.();
  };

  const handleLanguageSave = async (newLang) => {
    setLanguage(newLang);
    setLang(newLang);       // ← LanguageContext anında güncellenir → t() değişir
    await refreshProfile?.();
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('settings')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>

        {/* Hesap */}
        <SectionTitle title={t('account')} />
        <View style={s.group}>
          <SettingRow
            icon="create-outline"
            label={t('editProfile')}
            onPress={() => router.push('/profile/edit')}
          />
          <SettingRow
            icon="lock-closed-outline"
            iconColor="#22C55E" iconBg="#0A2A1A"
            label={t('privacy')}
            value={privacyLabel}
            onPress={() => setShowPrivacy(true)}
          />
          <SettingRow
            icon="language-outline"
            iconColor="#3b82f6" iconBg="#0A1A2A"
            label={t('language')}
            value={`${languageFlag} ${languageLabel}`}
            onPress={() => setShowLanguage(true)}
          />
        </View>

        {/* Bildirimler */}
        <SectionTitle title={t('notifications')} />
        <View style={s.group}>
          <SettingRow
            icon="notifications-outline"
            label={t('notifications')}
            onPress={() => router.push('/notifications')}
          />
        </View>

        {/* Uygulama */}
        <SectionTitle title="App" />
        <View style={s.group}>
          <SettingRow
            icon="star-outline"
            label={t('rateApp')}
            onPress={() => Alert.alert(t('success'), 'Teşekkürler!')}
          />
          <SettingRow
            icon="share-social-outline"
            label="Invite Friends"
            onPress={() => Alert.alert(t('soon'), '')}
          />
        </View>

        {/* Destek */}
        <SectionTitle title={t('help')} />
        <View style={s.group}>
          <SettingRow
            icon="help-circle-outline"
            label={t('help')}
            onPress={() => Alert.alert(t('help'), 'destek@movo.app')}
          />
          <SettingRow
            icon="document-text-outline"
            label={t('private')}
            onPress={() => Alert.alert(t('soon'), '')}
          />
        </View>

        {/* Admin */}
        {isAdmin && (
          <>
            <SectionTitle title="Admin" />
            <View style={s.group}>
              <SettingRow
                icon="shield-outline"
                iconColor="#22C55E" iconBg="#0A2A1A"
                label="Admin Panel"
                onPress={() => router.push('/admin/index')}
              />
            </View>
          </>
        )}

        {/* Hesap işlemleri */}
        <SectionTitle title={t('account')} />
        <View style={s.group}>
          <SettingRow
            icon="log-out-outline"
            label={t('logout')}
            onPress={handleLogout}
            danger
          />
          <SettingRow
            icon="trash-outline"
            label={t('deleteAccount')}
            onPress={() => Alert.alert(
              t('deleteAccount'), '',
              [
                { text: t('cancel'), style: 'cancel' },
                { text: t('delete'), style: 'destructive', onPress: () => {} },
              ]
            )}
            danger
          />
        </View>

        <Text style={s.version}>MOVO v1.0.0</Text>
      </ScrollView>

      <PrivacyModal
        visible={showPrivacy}
        current={privacy}
        onSave={handlePrivacySave}
        onClose={() => setShowPrivacy(false)}
        t={t}
      />
      <LanguageModal
        visible={showLanguage}
        current={language}
        onSave={handleLanguageSave}
        onClose={() => setShowLanguage(false)}
        t={t}
      />
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
  iconWrap:     { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  label:        { flex: 1, color: '#ccc', fontSize: 15 },
  rowValue:     { color: '#888', fontSize: 13 },
  version:      { textAlign: 'center', color: '#333', fontSize: 12, marginTop: 32, marginBottom: 8 },
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:        { backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30 },
  sheetHandle:  { width: 36, height: 4, backgroundColor: '#333', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetTitle:   { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center', paddingVertical: 14 },
  optRow:       { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: '#1A1A1A' },
  optRowActive: { backgroundColor: 'rgba(34,197,94,0.06)' },
  optIcon:      { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center' },
  optIconActive:{ backgroundColor: '#0A2A1A' },
  optLabel:     { color: '#ccc', fontSize: 15, fontWeight: '500' },
  optDesc:      { color: '#555', fontSize: 12, marginTop: 2 },
  langFlag:     { fontSize: 24, width: 38, textAlign: 'center' },
  saveBtn:      { backgroundColor: '#22C55E', margin: 20, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  saveBtnText:  { color: '#fff', fontSize: 16, fontWeight: '700' },
});