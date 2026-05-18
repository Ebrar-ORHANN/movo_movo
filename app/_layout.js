// ── app/_layout.js ──────────────────────────────────────────────────────────
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { useRouter, useSegments } from 'expo-router';
import { LanguageProvider } from '../context/LanguageContext';

function NavigationGuard() {
  const { firebaseUser, profile, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    const isAuthed = firebaseUser && profile;

    if (!isAuthed && !inAuth) router.replace('/(auth)/onboarding');
    if (isAuthed && inAuth)   router.replace('/(tabs)/feed');
  }, [firebaseUser, profile, loading, segments]);

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <LanguageProvider>
            <NavigationGuard />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />

              {/* Profil */}
              <Stack.Screen name="profile/edit" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />

              {/* Kullanıcı profili */}
              <Stack.Screen name="user/[id]" />

              {/* Post */}
              <Stack.Screen name="post/create" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="post/[id]" />

              {/* Ayarlar */}
              <Stack.Screen name="settings" options={{ presentation: 'card', animation: 'slide_from_right' }} />

              {/* Modaller */}
              <Stack.Screen name="notifications"      options={{ presentation: 'modal' }} />
              <Stack.Screen name="messages/index"     options={{ presentation: 'modal' }} />
              <Stack.Screen name="messages/[room_id]" />
              <Stack.Screen name="events/index"       options={{ presentation: 'modal' }} />
              <Stack.Screen name="events/[id]"        />
              <Stack.Screen name="route/[id]"         />
              <Stack.Screen name="route/walk/[id]"    />
              <Stack.Screen name="poi/[id]"           />
              <Stack.Screen name="together"           options={{ presentation: 'modal' }} />
              <Stack.Screen name="live/index"         options={{ presentation: 'modal' }} />
              <Stack.Screen name="live/[id]"          />
              <Stack.Screen name="admin/index"        options={{ presentation: 'modal' }} />
              <Stack.Screen name="explorer/chat" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              
            </Stack>
          </LanguageProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}