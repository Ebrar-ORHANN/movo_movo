import { StyleSheet, Image, View } from 'react-native';
import React from 'react';

export default function Logo({ size = 80, style }) {
  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <Image
        source={require('../assets/images/logo.png')}
        style={styles.image}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  image: {
    width: '80%',
    height: '80%',
  },
});