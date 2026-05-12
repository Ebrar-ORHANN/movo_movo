import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';

export default function SocialLogin({ disabled = false }) {
  const handleGoogleLogin = () => {
    Alert.alert('Bilgi', 'Google ile giriş özelliği yakında eklenecek');
  };

  const handleAppleLogin = () => {
    Alert.alert('Bilgi', 'Apple ile giriş özelliği yakında eklenecek');
  };

  const handleFacebookLogin = () => {
    Alert.alert('Bilgi', 'Facebook ile giriş özelliği yakında eklenecek');
  };

  return (
    <View style={styles.container}>
      {/* Google */}
      <TouchableOpacity
        style={[styles.button, styles.googleButton]}
        onPress={handleGoogleLogin}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Ionicons name="logo-google" size={22} color="#1877f2" />
      </TouchableOpacity>

      {/* Apple */}
      <TouchableOpacity
        style={[styles.button, styles.appleButton]}
        onPress={handleAppleLogin}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Ionicons name="logo-apple" size={24} color="#000" />
      </TouchableOpacity>

      {/* Facebook */}
      <TouchableOpacity
        style={[styles.button, styles.facebookButton]}
        onPress={handleFacebookLogin}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Ionicons name="logo-facebook" size={22} color="#1877f2" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  button: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  googleButton: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  appleButton: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  facebookButton: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
});