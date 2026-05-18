// ── app/(tabs)/_layout.js ─────────────────────────────────────────────────────
import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: 'absolute', left: 40, right: 20, bottom: 20,
          height: 72, borderTopWidth: 0, backgroundColor: 'transparent',
          elevation: 0,
        },
        tabBarBackground: () => (
          <View style={ts.glassBg}>
            <BlurView intensity={50} tint="dark" style={ts.blur} />
            <View style={ts.glassLayer} />
          </View>
        ),
        tabBarItemStyle: { justifyContent: 'center', alignItems: 'center', marginTop: 8 },
      }}
    >
      {/* Akış */}
      <Tabs.Screen
        name="feed"
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={ts.iconWrap}>
              <Ionicons name={focused ? 'home' : 'home-outline'} size={26}
                color={focused ? '#22C55E' : '#888'} />
            </View>
          ),
        }}
      />

      {/* Kaşif Modu — orta büyük buton */}
      <Tabs.Screen
        name="explore"
        options={{
          tabBarIcon: () => (
            <View style={ts.centerBtn}>
              <Ionicons name="compass" size={28} color="#fff" />
            </View>
          ),
        }}
      />

      {/* Profil */}
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={ts.iconWrap}>
              <Ionicons name={focused ? 'person' : 'person-outline'} size={26}
                color={focused ? '#22C55E' : '#888'} />
            </View>
          ),
        }}
      />

      {/* Gizli ekranlar — tab bar'da gösterilmez */}
      <Tabs.Screen name="discover/index" options={{ href: null }} />
    </Tabs>
  );
}

const ts = StyleSheet.create({
  glassBg:    { flex: 1, borderRadius: 36, overflow: 'hidden' },
  blur:       { ...StyleSheet.absoluteFillObject },
  glassLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,10,0.6)',
    borderRadius: 36,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  iconWrap:   { alignItems: 'center', justifyContent: 'center' },
  centerBtn:  {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#22C55E',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#22C55E', shadowOpacity: 0.5, shadowRadius: 8,
    elevation: 8,
  },
});