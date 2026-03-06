import { useState, useEffect, useCallback } from 'react';
import { Platform, Alert, AppState } from 'react-native';
import createContextHook from '@nkzw/create-context-hook';
import { Coordinates } from '@/types';
import { supabase, supabaseNoAuth } from '@/utils/supabaseClient';

function getWebLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => reject(error),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}

async function getNativeLocation(): Promise<Coordinates> {
  const Location = require('expo-location');
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('PERMISSION_DENIED');
  }
  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
  };
}

/** プライバシー保護のため座標を約1.1km精度に丸める（過度な位置特定を防止） */
export function roundCoordinatesForPrivacy(coords: Coordinates): Coordinates {
  return {
    latitude: Math.round(coords.latitude * 100) / 100,
    longitude: Math.round(coords.longitude * 100) / 100,
  };
}

export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function saveLocationToSupabase(coords: Coordinates): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('Location: No authenticated user, skipping Supabase save');
      return;
    }
    const rounded = roundCoordinatesForPrivacy(coords);
    const { error } = await supabaseNoAuth.from('profiles').upsert({
      id: user.id,
      latitude: rounded.latitude,
      longitude: rounded.longitude,
      location_updated_at: new Date().toISOString(),
    });
    if (error) {
      console.log('Location: Supabase save error', error.message);
    } else {
      console.log('Location: Saved to Supabase (rounded)', rounded.latitude, rounded.longitude);
    }
  } catch (e) {
    console.log('Location: Supabase save failed (non-blocking)', e);
  }
}

export const [LocationProvider, useLocation] = createContextHook(() => {
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [permissionDenied, setPermissionDenied] = useState<boolean>(false);
  const [locationEnabled, setLocationEnabled] = useState<boolean>(true);

  const requestLocation = useCallback(async () => {
    setIsLoading(true);
    setLocationError(null);
    try {
      let coords: Coordinates;
      if (Platform.OS === 'web') {
        coords = await getWebLocation();
      } else {
        coords = await getNativeLocation();
      }
      setUserLocation(coords);
      setPermissionDenied(false);
      console.log('Location obtained:', coords);

      saveLocationToSupabase(coords);
    } catch (error: unknown) {
      const err = error as Error;
      console.log('Location error:', err.message);
      if (err.message === 'PERMISSION_DENIED') {
        setPermissionDenied(true);
        setLocationError('位置情報のアクセスが拒否されました');
        Alert.alert(
          '位置情報',
          '近くのプレイヤーを見つけるには、設定から位置情報を許可してください。',
          [{ text: 'OK' }]
        );
      } else {
        setLocationError('位置情報を取得できませんでした');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getDistanceToPlayer = useCallback(
    (playerLat: number, playerLon: number): number | null => {
      if (!userLocation) return null;
      return calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        playerLat,
        playerLon
      );
    },
    [userLocation]
  );

  const toggleLocationEnabled = useCallback(() => {
    if (locationEnabled) {
      setLocationEnabled(false);
      setUserLocation(null);
      console.log('Location disabled by user');
    } else {
      setLocationEnabled(true);
      requestLocation();
      console.log('Location enabled by user');
    }
  }, [locationEnabled, requestLocation]);

  useEffect(() => {
    if (!locationEnabled) return;
    const tryRequest = () => {
      if (AppState.currentState === 'active') {
        requestLocation();
      }
    };
    tryRequest();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tryRequest();
    });
    return () => sub.remove();
  }, [locationEnabled, requestLocation]);

  return {
    userLocation,
    locationError,
    isLoading,
    permissionDenied,
    locationEnabled,
    requestLocation,
    getDistanceToPlayer,
    toggleLocationEnabled,
  };
});
