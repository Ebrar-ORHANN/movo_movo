// ── app/(auth)/login.js ──────────────────────────────────────────────────────
// Firebase ile giriş yap → backend'e token gönder → users tablosundan profil al
// DB: users WHERE firebase_uid=$1

import { View, Text, TextInput, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert } from 'react-native';
import React, { useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../src/firebase/config';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { loginBackend } from '../../services/authService';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [loading, setLoading]       = useState(false);
  const [showPassword, setShowPw]   = useState(false);
  const [errors, setErrors]         = useState({});

  const validate = () => {
    const e = {};
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) e.email = 'Geçerli e-mail girin';
    if (!password || password.length < 6)               e.password = 'En az 6 karakter';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    try {
      setLoading(true);
      // 1. Firebase Auth — token alınır
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      // 2. Backend — users tablosundan profil çek (account_status kontrolü)
      const token = await cred.user.getIdToken(true);
      await loginBackend(token);
      router.replace('/(tabs)/feed');
    } catch (error) {
      const msgs = {
        'auth/user-not-found': 'Kullanıcı bulunamadı',
        'auth/wrong-password': 'Hatalı şifre',
        'auth/too-many-requests': 'Çok fazla deneme. Daha sonra tekrar deneyin.',
        'auth/invalid-credential': 'Email veya şifre hatalı',
      };
      Alert.alert('Giriş Hatası', msgs[error.code] || error.message);
    } finally { setLoading(false); }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) { Alert.alert('Email girin', 'Önce email adresinizi girin'); return; }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      Alert.alert('Başarılı', 'Şifre sıfırlama e-postası gönderildi');
    } catch { Alert.alert('Hata', 'E-posta gönderilemedi'); }
  };

  return (
    <LinearGradient colors={['#0D0D0D', '#1A1A2E']} style={styles.gradient}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Logo */}
          <View style={styles.logoWrap}>
            <Ionicons name="compass" size={48} color="#22C55E" />
            <Text style={styles.logoText}>MOVO</Text>
          </View>

          <View style={styles.card}>
            {/* Email */}
            <View style={[styles.inputWrap, errors.email && styles.inputError]}>
              <Ionicons name="mail-outline" size={20} color="#888" style={styles.icon} />
              <TextInput
                style={styles.input}
                placeholder="E-mail"
                placeholderTextColor="#555"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
            {errors.email ? <Text style={styles.err}>{errors.email}</Text> : null}

            {/* Şifre */}
            <View style={[styles.inputWrap, errors.password && styles.inputError]}>
              <Ionicons name="lock-closed-outline" size={20} color="#888" style={styles.icon} />
              <TextInput
                style={styles.input}
                placeholder="Şifre"
                placeholderTextColor="#555"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPw(!showPassword)}>
                <Ionicons name={showPassword?'eye-off-outline':'eye-outline'} size={20} color="#888" />
              </TouchableOpacity>
            </View>
            {errors.password ? <Text style={styles.err}>{errors.password}</Text> : null}

            <TouchableOpacity onPress={handleForgotPassword} style={{alignSelf:'flex-end',marginBottom:16}}>
              <Text style={styles.forgot}>Şifremi Unuttum</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> :
                <Text style={styles.btnText}>Giriş Yap</Text>}
            </TouchableOpacity>

            <View style={styles.divRow}>
              <View style={styles.divLine} />
              <Text style={styles.divText}>veya</Text>
              <View style={styles.divLine} />
            </View>

            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={styles.registerText}>
                Hesabın yok mu? <Text style={{color:'#22C55E'}}>Kayıt Ol</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient:    { flex: 1 },
  scroll:      { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoWrap:    { alignItems: 'center', marginBottom: 32 },
  logoText:    { fontSize: 36, fontWeight: '700', color: '#22C55E', marginTop: 8 },
  card:        { backgroundColor: '#1A1A1A', borderRadius: 20, padding: 24, borderWidth: 0.5, borderColor: '#2A2A2A' },
  inputWrap:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 12, borderWidth: 0.5, borderColor: '#2A2A2A', marginBottom: 8, paddingHorizontal: 12, height: 52 },
  inputError:  { borderColor: '#ef4444' },
  icon:        { marginRight: 8 },
  input:       { flex: 1, color: '#fff', fontSize: 15 },
  err:         { color: '#ef4444', fontSize: 12, marginBottom: 6 },
  forgot:      { color: '#22C55E', fontSize: 13 },
  btn:         { backgroundColor: '#22C55E', borderRadius: 12, height: 52, alignItems: 'center', justifyContent: 'center' },
  btnText:     { color: '#fff', fontSize: 16, fontWeight: '600' },
  divRow:      { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  divLine:     { flex: 1, height: 0.5, backgroundColor: '#2A2A2A' },
  divText:     { color: '#555', marginHorizontal: 12, fontSize: 13 },
  registerText: { textAlign: 'center', color: '#888', fontSize: 14 },
});
