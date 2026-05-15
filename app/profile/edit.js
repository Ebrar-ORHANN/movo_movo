// ── app/profile/edit.js ───────────────────────────────────────────────────────
// Profil düzenleme ekranı
// - Avatar: expo-image-picker + Firebase Storage upload
// - Alan: display_name, bio, privacy, preferred_language
// - PATCH /users/me → backend günceller

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Image, Animated, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import app from '../../src/firebase/config';
import { useAuth } from '../../context/AuthContext';
import { updateProfile, updatePrivacy } from '../../services/userService';
import { api } from '../../services/api';

const storage = getStorage(app);

const LANGUAGES = [
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
];

const PRIVACY_OPTIONS = [
  { value: 'public',    icon: 'earth-outline',    label: 'Herkese Açık',  desc: 'Herkes profilini görebilir' },
  { value: 'followers', icon: 'people-outline',   label: 'Takipçiler',    desc: 'Sadece takipçilerin görebilir' },
  { value: 'private',   icon: 'lock-closed-outline', label: 'Gizli',      desc: 'Kimse göremez' },
];

export default function ProfileEditScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();

  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [bio, setBio]                 = useState(profile?.bio || '');
  const [privacy, setPrivacy]         = useState(profile?.privacy || 'public');
  const [language, setLanguage]       = useState(profile?.preferred_language || 'tr');
  const [avatarUri, setAvatarUri]     = useState(profile?.avatar_url || null);
  const [avatarFile, setAvatarFile]   = useState(null); // local file to upload
  const [loading, setLoading]         = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [hasChanges, setHasChanges]   = useState(false);

  // Animasyonlar
  const saveAnim  = useRef(new Animated.Value(1)).current;
  const avatarAnim = useRef(new Animated.Value(1)).current;

  // Değişiklik takibi
  useEffect(() => {
    const changed =
      displayName !== (profile?.display_name || '') ||
      bio         !== (profile?.bio || '')           ||
      privacy     !== (profile?.privacy || 'public') ||
      language    !== (profile?.preferred_language || 'tr') ||
      avatarFile  !== null;
    setHasChanges(changed);
  }, [displayName, bio, privacy, language, avatarFile]);

  // ── Fotoğraf seçme ────────────────────────────────────────────────────────
  const pickPhoto = async () => {
    Alert.alert(
      'Profil Fotoğrafı',
      'Fotoğraf nereden eklensin?',
      [
        { text: 'Galeri',  onPress: () => openPicker('library') },
        { text: 'Kamera',  onPress: () => openPicker('camera') },
        { text: 'İptal', style: 'cancel' },
      ]
    );
  };

  const openPicker = async (source) => {
    const { status } = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert('İzin Gerekli', 'Fotoğraf erişimine izin vermeniz gerekiyor.');
      return;
    }

    // Avatar pulsing animasyonu
    Animated.sequence([
      Animated.timing(avatarAnim, { toValue: 0.93, duration: 100, useNativeDriver: true }),
      Animated.timing(avatarAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true, aspect: [1, 1], quality: 0.85,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true, aspect: [1, 1], quality: 0.85,
        });

    if (!result.canceled && result.assets?.[0]) {
      setAvatarUri(result.assets[0].uri);
      setAvatarFile(result.assets[0]);
    }
  };

  // ── Firebase Storage'a yükle ──────────────────────────────────────────────
  const uploadAvatar = async (fileAsset) => {
    try {
      setUploadingPhoto(true);
      const uri = fileAsset.uri;
      const ext  = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `avatars/${profile?.id || 'user'}_${Date.now()}.${ext}`;

      const response = await fetch(uri);
      const blob     = await response.blob();

      const storageRef  = ref(storage, path);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } finally {
      setUploadingPhoto(false);
    }
  };

  // ── Kaydet ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert('Hata', 'Ad Soyad boş olamaz.');
      return;
    }

    // Buton animasyonu
    Animated.sequence([
      Animated.timing(saveAnim, { toValue: 0.95, duration: 80, useNativeDriver: true }),
      Animated.timing(saveAnim, { toValue: 1,    duration: 80, useNativeDriver: true }),
    ]).start();

    setLoading(true);
    try {
      // 1. Avatar varsa yükle
      let avatarUrl = profile?.avatar_url || null;
      if (avatarFile) {
        avatarUrl = await uploadAvatar(avatarFile);
      }

      // 2. Profil güncelle (display_name, bio, preferred_language + avatar_url)
      await api.patch('/users/me', {
        display_name:       displayName.trim(),
        bio:                bio.trim() || null,
        preferred_language: language,
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      });

      // 3. Privacy ayrı endpoint
      if (privacy !== profile?.privacy) {
        await updatePrivacy(privacy);
      }

      // 4. Context'i yenile
      await refreshProfile();

      Alert.alert('✅ Başarılı', 'Profilin güncellendi!', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert('Hata', e.message || 'Güncelleme başarısız.');
    } finally {
      setLoading(false);
    }
  };

  // ── UI ────────────────────────────────────────────────────────────────────
  const initials = (displayName || profile?.username || '?').slice(0, 1).toUpperCase();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0D0D0D' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Profili Düzenle</Text>
        <Animated.View style={{ transform: [{ scale: saveAnim }] }}>
          <TouchableOpacity
            style={[s.saveBtn, (!hasChanges || loading) && s.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!hasChanges || loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.saveBtnText}>Kaydet</Text>
            }
          </TouchableOpacity>
        </Animated.View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>

        {/* ── Avatar ────────────────────────────────────────────────────── */}
        <View style={s.avatarSection}>
          <TouchableOpacity onPress={pickPhoto} activeOpacity={0.8}>
            <Animated.View style={[s.avatarWrap, { transform: [{ scale: avatarAnim }] }]}>
              {avatarUri
                ? <Image source={{ uri: avatarUri }} style={s.avatar} />
                : <View style={[s.avatar, s.avatarInitials]}>
                    <Text style={s.avatarInitText}>{initials}</Text>
                  </View>
              }
              {/* Overlay */}
              <View style={s.avatarOverlay}>
                {uploadingPhoto
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Ionicons name="camera" size={22} color="#fff" />
                }
              </View>
            </Animated.View>
          </TouchableOpacity>
          <Text style={s.avatarHint}>Fotoğraf değiştir</Text>
        </View>

        {/* ── Temel Bilgiler ─────────────────────────────────────────────── */}
        <Section title="Temel Bilgiler" icon="person-outline">
          <Field label="Ad Soyad">
            <TextInput
              style={s.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Adın ve soyadın"
              placeholderTextColor="#555"
              maxLength={50}
            />
            <Text style={s.charCount}>{displayName.length}/50</Text>
          </Field>

          <Field label="Kullanıcı Adı">
            <View style={s.readonlyWrap}>
              <Text style={s.readonlyText}>@{profile?.username}</Text>
              <Text style={s.readonlyHint}>Değiştirilemez</Text>
            </View>
          </Field>

          <Field label="Biyografi">
            <TextInput
              style={[s.input, s.bioInput]}
              value={bio}
              onChangeText={setBio}
              placeholder="Kendini kısaca tanıt…"
              placeholderTextColor="#555"
              multiline
              maxLength={200}
              textAlignVertical="top"
            />
            <Text style={s.charCount}>{bio.length}/200</Text>
          </Field>
        </Section>

        {/* ── Gizlilik ───────────────────────────────────────────────────── */}
        <Section title="Gizlilik" icon="shield-outline">
          {PRIVACY_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[s.optionRow, privacy === opt.value && s.optionRowActive]}
              onPress={() => setPrivacy(opt.value)}
              activeOpacity={0.75}
            >
              <View style={[s.optionIcon, privacy === opt.value && s.optionIconActive]}>
                <Ionicons name={opt.icon} size={18} color={privacy === opt.value ? '#22C55E' : '#888'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.optionLabel, privacy === opt.value && s.optionLabelActive]}>
                  {opt.label}
                </Text>
                <Text style={s.optionDesc}>{opt.desc}</Text>
              </View>
              {privacy === opt.value && (
                <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
              )}
            </TouchableOpacity>
          ))}
        </Section>

        {/* ── Dil ────────────────────────────────────────────────────────── */}
        <Section title="Dil Tercihi" icon="language-outline">
          <View style={s.langGrid}>
            {LANGUAGES.map(l => (
              <TouchableOpacity
                key={l.code}
                style={[s.langCard, language === l.code && s.langCardActive]}
                onPress={() => setLanguage(l.code)}
                activeOpacity={0.75}
              >
                <Text style={s.langFlag}>{l.flag}</Text>
                <Text style={[s.langLabel, language === l.code && s.langLabelActive]}>
                  {l.label}
                </Text>
                {language === l.code && (
                  <View style={s.langCheck}>
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        {/* ── Tehlike Bölgesi ─────────────────────────────────────────────── */}
        <Section title="Hesap" icon="settings-outline">
          <TouchableOpacity
            style={s.dangerBtn}
            onPress={() => Alert.alert(
              'Hesabı Sil',
              'Hesabını kalıcı olarak silmek istediğinden emin misin? Bu işlem geri alınamaz.',
              [
                { text: 'İptal', style: 'cancel' },
                { text: 'Sil', style: 'destructive', onPress: () => Alert.alert('Yakında', 'Bu özellik yakında eklenecek.') },
              ]
            )}
          >
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
            <Text style={s.dangerText}>Hesabı Sil</Text>
          </TouchableOpacity>
        </Section>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Alt bileşenler ──────────────────────────────────────────────────────────
function Section({ title, icon, children }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Ionicons name={icon} size={15} color="#22C55E" />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

function Field({ label, children }) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

// ── Stiller ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  header:        { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingBottom:12, backgroundColor:'#0D0D0D' },
  backBtn:       { width:40, height:40, alignItems:'center', justifyContent:'center' },
  headerTitle:   { flex:1, color:'#fff', fontSize:18, fontWeight:'700', marginLeft:4 },
  saveBtn:       { backgroundColor:'#22C55E', paddingHorizontal:18, paddingVertical:9, borderRadius:20 },
  saveBtnDisabled:{ backgroundColor:'#1A3A1A', opacity:0.5 },
  saveBtnText:   { color:'#fff', fontSize:14, fontWeight:'600' },

  avatarSection: { alignItems:'center', paddingVertical:28 },
  avatarWrap:    { position:'relative', width:96, height:96 },
  avatar:        { width:96, height:96, borderRadius:48, borderWidth:3, borderColor:'#22C55E' },
  avatarInitials:{ backgroundColor:'#1A2E1A', alignItems:'center', justifyContent:'center' },
  avatarInitText:{ color:'#22C55E', fontSize:36, fontWeight:'700' },
  avatarOverlay: {
    position:'absolute', bottom:0, right:0,
    width:30, height:30, borderRadius:15,
    backgroundColor:'#22C55E',
    alignItems:'center', justifyContent:'center',
    borderWidth:2, borderColor:'#0D0D0D',
  },
  avatarHint:    { color:'#888', fontSize:13, marginTop:8 },

  section:       { marginHorizontal:16, marginBottom:20 },
  sectionHeader: { flexDirection:'row', alignItems:'center', gap:6, marginBottom:10 },
  sectionTitle:  { color:'#aaa', fontSize:12, fontWeight:'700', letterSpacing:0.8, textTransform:'uppercase' },
  sectionBody:   { backgroundColor:'#111', borderRadius:16, overflow:'hidden', borderWidth:0.5, borderColor:'#1e1e1e' },

  fieldWrap:     { padding:14, borderBottomWidth:0.5, borderBottomColor:'#1e1e1e' },
  fieldLabel:    { color:'#666', fontSize:11, fontWeight:'600', marginBottom:6, letterSpacing:0.4, textTransform:'uppercase' },
  input:         { color:'#fff', fontSize:15, paddingVertical:0 },
  bioInput:      { minHeight:72, lineHeight:21 },
  charCount:     { color:'#444', fontSize:11, alignSelf:'flex-end', marginTop:4 },

  readonlyWrap:  { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  readonlyText:  { color:'#aaa', fontSize:15 },
  readonlyHint:  { color:'#444', fontSize:12 },

  optionRow:     { flexDirection:'row', alignItems:'center', gap:12, padding:14, borderBottomWidth:0.5, borderBottomColor:'#1e1e1e' },
  optionRowActive:{ backgroundColor:'rgba(34,197,94,0.05)' },
  optionIcon:    { width:36, height:36, borderRadius:18, backgroundColor:'#1a1a1a', alignItems:'center', justifyContent:'center' },
  optionIconActive:{ backgroundColor:'#0A1F0A' },
  optionLabel:   { color:'#ccc', fontSize:14, fontWeight:'500' },
  optionLabelActive:{ color:'#fff' },
  optionDesc:    { color:'#555', fontSize:12, marginTop:1 },

  langGrid:      { flexDirection:'row', flexWrap:'wrap', gap:10, padding:14 },
  langCard:      {
    flexDirection:'row', alignItems:'center', gap:8,
    paddingHorizontal:14, paddingVertical:10,
    backgroundColor:'#1a1a1a', borderRadius:12,
    borderWidth:1, borderColor:'#2a2a2a',
    position:'relative', flex:1, minWidth:130,
  },
  langCardActive:{ borderColor:'#22C55E', backgroundColor:'#0A1F0A' },
  langFlag:      { fontSize:20 },
  langLabel:     { color:'#aaa', fontSize:13, fontWeight:'500' },
  langLabelActive:{ color:'#22C55E' },
  langCheck:     {
    position:'absolute', top:4, right:4,
    width:16, height:16, borderRadius:8,
    backgroundColor:'#22C55E',
    alignItems:'center', justifyContent:'center',
  },

  dangerBtn:     { flexDirection:'row', alignItems:'center', gap:10, padding:16 },
  dangerText:    { color:'#ef4444', fontSize:15, fontWeight:'500' },
});