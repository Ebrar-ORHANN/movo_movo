// ── hooks/useUserLocation.js ─────────────────────────────────────────────────
// Expo Location ile kullanıcı konumunu alır.
// Dönen format: { coords: { latitude, longitude } } — expo-location ile aynı yapı
// DiscoverScreen ve diğer ekranlar location.coords.latitude şeklinde kullanır.

import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export default function useUserLocation() {
  const [location, setLocation] = useState(null);
  const [error, setError]       = useState(null);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (isMounted) setError('Konum izni reddedildi');
          return;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        // Expo-location'ın orijinal formatını koru: { coords: { latitude, longitude, ... } }
        if (isMounted) setLocation(loc);
      } catch (e) {
        if (isMounted) setError(e.message);
      }
    })();

    return () => { isMounted = false; };
  }, []);

  return { location, error };
}