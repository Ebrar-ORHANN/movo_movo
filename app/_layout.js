// ── app/_layout.js ──────────────────────────────────────────────────────────
// Uygulama kökü: Firebase auth durumuna göre (auth) ya da (tabs) gösterilir.
// AuthContext: Firebase oturumu + backend profil + admin yetkisi

import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { useRouter, useSegments } from 'expo-router';

function NavigationGuard() {
  const { firebaseUser, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    if (!firebaseUser && !inAuth) router.replace('/(auth)/onboarding');
    if (firebaseUser && inAuth)  router.replace('/(tabs)/feed');
  }, [firebaseUser, loading, segments]);

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationGuard />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="notifications"         options={{ presentation: 'modal' }} />
            <Stack.Screen name="messages/index"        options={{ presentation: 'modal' }} />
            <Stack.Screen name="messages/[room_id]"    />
            <Stack.Screen name="events/index"          options={{ presentation: 'modal' }} />
            <Stack.Screen name="events/[id]"           />
            <Stack.Screen name="route/[id]"            />
            <Stack.Screen name="route/walk/[id]"       />
            <Stack.Screen name="poi/[id]"              />
            <Stack.Screen name="together"              options={{ presentation: 'modal' }} />
            <Stack.Screen name="live/index"            options={{ presentation: 'modal' }} />
            <Stack.Screen name="live/[id]"             />
            <Stack.Screen name="admin/index"           options={{ presentation: 'modal' }} />
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
