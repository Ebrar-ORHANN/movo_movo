// ── app/(auth)/register.js ───────────────────────────────────────────────────
// Firebase kullanıcısı oluştur → backend'e username + display_name gönder
// DB: users INSERT (firebase_uid, username, display_name)
// UNIQUE: LOWER(username) index — büyük/küçük harf duyarsız

import { View, Text, TextInput, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert } from 'react-native';
import React, { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../src/firebase/config';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { registerBackend, checkUsername } from '../../services/authService';

export default function RegisterScreen() {
  const router = useRouter();
  const [displayName, setDisplayName]   = useState('');
  const [username, setUsername]         = useState('');
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [loading, setLoading]           = useState(false);
  const [showPw, setShowPw]             = useState(false);
  const [errors, setErrors]             = useState({});
  const [usernameAvail, setUsernameAvail] = useState(null);

  const checkUsernameAvailability = async (value) => {
    setUsername(value);
    if (value.length < 3) { setUsernameAvail(null); return; }
    try {
      const avail = await checkUsername(value);
      setUsernameAvail(avail);
    } catch { setUsernameAvail(null); }
  };

  const validate = () => {
    const e = {};
    if (!displayName.trim() || displayName.trim().length < 2) e.displayName = 'En az 2 karakter';
    if (!username.trim() || username.trim().length < 3)        e.username = 'En az 3 karakter';
    if (usernameAvail === false)                               e.username = 'Bu kullanıcı adı alınmış';
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email))        e.email = 'Geçerli e-mail girin';
    if (!password || password.length < 6)                     e.password = 'En az 6 karakter';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    try {
      setLoading(true);
      // 1. Firebase kullanıcısı oluştur
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const token = await cred.user.getIdToken();
      // 2. Backend: users tablosuna INSERT (firebase_uid, username, display_name)
      await registerBackend(token, username.trim(), displayName.trim());
      router.replace('/(tabs)/feed');
    } catch (error) {
      const msgs = {
        'auth/email-already-in-use': 'Bu email zaten kayıtlı',
        'auth/weak-password':        'Şifre çok zayıf',
        'auth/invalid-email':        'Geçersiz email',
      };
      Alert.alert('Kayıt Hatası', msgs[error.code] || error.message);
    } finally { setLoading(false); }
  };

  return (
    <LinearGradient colors={['#0D0D0D', '#1A1A2E']} style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{flex:1}}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.logoWrap}>
            <Ionicons name="compass" size={48} color="#22C55E" />
            <Text style={styles.logoText}>MOVO</Text>
            <Text style={styles.sub}>Hesabını oluştur</Text>
          </View>

          <View style={styles.card}>
            {[
              { label:'Ad Soyad', val:displayName, set:setDisplayName, icon:'person-outline', ph:'Ad Soyad' },
            ].map(({label,val,set,icon,ph}) => (
              <View key={label}>
                <View style={[styles.inputWrap, errors[label]&&styles.inputError]}>
                  <Ionicons name={icon} size={20} color="#888" style={styles.icon} />
                  <TextInput style={styles.input} placeholder={ph} placeholderTextColor="#555"
                    value={val} onChangeText={set} />
                </View>
                {errors[label] ? <Text style={styles.err}>{errors[label]}</Text> : null}
              </View>
            ))}

            {/* Kullanıcı adı — gerçek zamanlı müsaitlik kontrolü */}
            <View style={[styles.inputWrap, errors.username&&styles.inputError]}>
              <Ionicons name="at-outline" size={20} color="#888" style={styles.icon} />
              <TextInput style={styles.input} placeholder="Kullanıcı adı"
                placeholderTextColor="#555" value={username}
                onChangeText={checkUsernameAvailability} autoCapitalize="none" />
              {usernameAvail === true  && <Ionicons name="checkmark-circle" size={20} color="#22C55E" />}
              {usernameAvail === false && <Ionicons name="close-circle"     size={20} color="#ef4444" />}
            </View>
            {errors.username ? <Text style={styles.err}>{errors.username}</Text> : null}

            {/* Email */}
            <View style={[styles.inputWrap, errors.email&&styles.inputError]}>
              <Ionicons name="mail-outline" size={20} color="#888" style={styles.icon} />
              <TextInput style={styles.input} placeholder="E-mail" placeholderTextColor="#555"
                value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            </View>
            {errors.email ? <Text style={styles.err}>{errors.email}</Text> : null}

            {/* Şifre */}
            <View style={[styles.inputWrap, errors.password&&styles.inputError]}>
              <Ionicons name="lock-closed-outline" size={20} color="#888" style={styles.icon} />
              <TextInput style={styles.input} placeholder="Şifre" placeholderTextColor="#555"
                value={password} onChangeText={setPassword} secureTextEntry={!showPw} />
              <TouchableOpacity onPress={() => setShowPw(!showPw)}>
                <Ionicons name={showPw?'eye-off-outline':'eye-outline'} size={20} color="#888" />
              </TouchableOpacity>
            </View>
            {errors.password ? <Text style={styles.err}>{errors.password}</Text> : null}

            <TouchableOpacity style={[styles.btn,{marginTop:8}]} onPress={handleRegister} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> :
                <Text style={styles.btnText}>Kayıt Ol</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/(auth)/login')} style={{marginTop:16}}>
              <Text style={styles.link}>
                Zaten hesabın var mı? <Text style={{color:'#22C55E'}}>Giriş Yap</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  scroll:    { flexGrow:1, padding:24, paddingTop:60 },
  back:      { marginBottom:16 },
  logoWrap:  { alignItems:'center', marginBottom:24 },
  logoText:  { fontSize:28, fontWeight:'700', color:'#22C55E', marginTop:8 },
  sub:       { color:'#888', fontSize:14, marginTop:4 },
  card:      { backgroundColor:'#1A1A1A', borderRadius:20, padding:24, borderWidth:0.5, borderColor:'#2A2A2A' },
  inputWrap: { flexDirection:'row', alignItems:'center', backgroundColor:'#111', borderRadius:12, borderWidth:0.5, borderColor:'#2A2A2A', marginBottom:8, paddingHorizontal:12, height:52 },
  inputError:{ borderColor:'#ef4444' },
  icon:      { marginRight:8 },
  input:     { flex:1, color:'#fff', fontSize:15 },
  err:       { color:'#ef4444', fontSize:12, marginBottom:6 },
  btn:       { backgroundColor:'#22C55E', borderRadius:12, height:52, alignItems:'center', justifyContent:'center' },
  btnText:   { color:'#fff', fontSize:16, fontWeight:'600' },
  link:      { textAlign:'center', color:'#888', fontSize:14 },
});
