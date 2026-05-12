import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import React from 'react'

export default function AuthTabs({ active, onChange }) {
  return (
    <View style={styles.container}>
      {['login', 'register'].map((item) => (
        <TouchableOpacity
          key={item}
          style={[
            styles.tab,
            active === item && styles.active,
          ]}
          onPress={() => onChange(item)}
        >
          <Text style={styles.text}>
            {item === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#F2F2F2',
    borderRadius: 30,
    marginVertical: 24,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  active: {
    backgroundColor: '#FFF',
    borderRadius: 30,
  },
  text: {
    fontWeight: '600',
  },
})
