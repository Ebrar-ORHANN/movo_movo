// ── hooks/useUserLocation.js ─────────────────────────────────────────────────
import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

export default function useUserLocation() {
  const [location, setLocation]   = useState(null);
  const [error, setError]         = useState(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setError('Konum izni verilmedi');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setLocation(pos);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { location, error, loading };
}