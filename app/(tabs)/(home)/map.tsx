import React, { useMemo, useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Modal,
  Animated,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeImage } from '@/components/SafeImage';
import { Navigation, MapPin, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { useLocation } from '@/providers/LocationProvider';
import { Player } from '@/types';
import { getSkillColor, getSkillLabel, formatRating } from '@/utils/helpers';
import { t } from '@/utils/translations';
import { BackNavButton } from '@/components/BackNavButton';

let MapView: React.ComponentType<any> | null = null;
let Marker: React.ComponentType<any> | null = null;

try {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
} catch {
  console.log('react-native-maps not available');
}

const TOKYO_CENTER = {
  latitude: 35.6762,
  longitude: 139.6503,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export default function MapScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { players, language } = useChess();
  const { userLocation } = useLocation();
  const router = useRouter();
  const mapRef = useRef<any>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const slideAnim = useRef(new Animated.Value(300)).current;

  const region = useMemo(() => {
    if (userLocation) {
      return {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.06,
        longitudeDelta: 0.06,
      };
    }
    return TOKYO_CENTER;
  }, [userLocation]);

  const goToCurrentLocation = useCallback(() => {
    if (!userLocation || !mapRef.current) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    mapRef.current.animateToRegion?.({
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      latitudeDelta: 0.04,
      longitudeDelta: 0.04,
    }, 500);
  }, [userLocation]);

  const handlePlayerPress = useCallback((player: Player) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPlayer(player);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [slideAnim]);

  const closeSheet = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 300,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setSelectedPlayer(null));
  }, [slideAnim]);

  const openProfile = useCallback((player: Player) => {
    closeSheet();
    router.push(('/player/' + player.id) as any);
  }, [closeSheet, router]);

  if (!MapView || !Marker) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <BackNavButton onPress={() => router.back()} floating />
        <View style={styles.fallback}>
          <Navigation size={48} color={colors.textMuted} />
          <Text style={styles.fallbackTitle}>{t('map_view', language)}</Text>
          <Text style={styles.fallbackText}>
            {t('map_mobile_only', language)}
          </Text>
          <View style={styles.playerList}>
            {players.map(player => (
              <Pressable
                key={player.id}
                onPress={() => router.push(('/player/' + player.id) as any)}
                style={styles.playerListItem}
              >
                <SafeImage uri={player.avatar} name={player.name} style={styles.playerAvatar} contentFit="cover" />
                <View style={styles.playerInfo}>
                  <Text style={styles.playerName}>{player.name}</Text>
                  <Text style={styles.playerLocation}>{player.location + ' · ' + player.distance + 'km'}</Text>
                </View>
                <View style={[styles.onlineDot, { backgroundColor: player.isOnline ? colors.green : colors.textMuted }]} />
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <BackNavButton onPress={() => router.back()} floating />
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton={false}
        mapType="standard"
      >
        {players.map(player => (
          <Marker
            key={player.id}
            coordinate={{
              latitude: player.coordinates.latitude,
              longitude: player.coordinates.longitude,
            }}
            onPress={() => handlePlayerPress(player)}
          >
            <View style={styles.markerContainer}>
              <View style={[styles.markerBorder, { borderColor: getSkillColor(player.skillLevel, colors) }]}>
                <SafeImage uri={player.avatar} name={player.name} style={styles.markerAvatar} contentFit="cover" />
              </View>
              {player.isOnline && <View style={[styles.markerOnline, { borderColor: colors.background }]} />}
              <View style={[styles.markerLabel, { borderColor: colors.cardBorder }]}>
                <Text style={[styles.markerName, { color: colors.textPrimary }]} numberOfLines={1}>{player.name}</Text>
                <Text style={[styles.markerRating, { color: colors.gold }]}>
                  {player.chessComRating !== null ? player.chessComRating : player.lichessRating !== null ? player.lichessRating : formatRating(null, language)}
                </Text>
              </View>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* 現在地へジャンプ FAB */}
      {userLocation && (
        <Pressable style={[styles.fab, { backgroundColor: colors.surface }]} onPress={goToCurrentLocation}>
          <Navigation size={22} color={colors.blue} />
        </Pressable>
      )}

      {/* ハーフモーダル: プレイヤー詳細 */}
      <Modal visible={selectedPlayer !== null} transparent animationType="fade">
        <Pressable style={styles.sheetBackdrop} onPress={closeSheet}>
          <Animated.View
            style={[
              styles.sheet,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
              { transform: [{ translateY: slideAnim }] },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.divider }]} />
            {selectedPlayer && (
              <Pressable
                onPress={() => openProfile(selectedPlayer)}
                style={styles.sheetContent}
              >
                <SafeImage uri={selectedPlayer.avatar} name={selectedPlayer.name} style={styles.sheetAvatar} contentFit="cover" />
                <View style={styles.sheetInfo}>
                  <Text style={[styles.sheetName, { color: colors.textPrimary }]}>{selectedPlayer.name}</Text>
                  <View style={styles.sheetMeta}>
                    <View style={[styles.sheetMetaChip, { backgroundColor: getSkillColor(selectedPlayer.skillLevel, colors) + '22', borderColor: getSkillColor(selectedPlayer.skillLevel, colors) }]}>
                      <Text style={[styles.sheetMetaText, { color: getSkillColor(selectedPlayer.skillLevel, colors) }]}>
                        {getSkillLabel(selectedPlayer.skillLevel, language)}
                      </Text>
                    </View>
                    {selectedPlayer.location ? (
                      <View style={styles.sheetMetaRow}>
                        <MapPin size={12} color={colors.textMuted} />
                        <Text style={[styles.sheetLocation, { color: colors.textMuted }]}>{selectedPlayer.location}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.sheetDistance, { color: colors.textSecondary }]}>
                    {selectedPlayer.distance < 999 ? `${selectedPlayer.distance} km` : '-'}
                  </Text>
                </View>
                <ChevronRight size={20} color={colors.textMuted} />
              </Pressable>
            )}
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    map: {
      flex: 1,
    },
    fab: {
      position: 'absolute',
      bottom: 24,
      right: 20,
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      ...Platform.select({
        web: { boxShadow: '0 4px 12px rgba(0,0,0,0.15)' },
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
        default: { elevation: 8 },
      }),
    },
    sheetBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    sheet: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: Math.max(34, 20),
      borderWidth: 1,
      borderBottomWidth: 0,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      alignSelf: 'center',
      marginTop: 12,
      marginBottom: 8,
    },
    sheetContent: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      gap: 16,
    },
    sheetAvatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.surfaceLight,
    },
    sheetInfo: {
      flex: 1,
    },
    sheetName: {
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 6,
    },
    sheetMeta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    sheetMetaChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
    },
    sheetMetaText: {
      fontSize: 12,
      fontWeight: '600',
    },
    sheetMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    sheetLocation: {
      fontSize: 12,
    },
    sheetDistance: {
      fontSize: 13,
      fontWeight: '500',
    },
    fallback: {
      flex: 1,
      alignItems: 'center',
      paddingTop: 40,
      paddingHorizontal: 20,
    },
    fallbackTitle: {
      fontSize: 20,
      fontWeight: '700' as const,
      color: colors.textPrimary,
      marginTop: 16,
      marginBottom: 8,
    },
    fallbackText: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: 24,
    },
    playerList: {
      width: '100%',
      gap: 8,
    },
    playerListItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    playerAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceLight,
    },
    playerInfo: {
      flex: 1,
    },
    playerName: {
      fontSize: 15,
      fontWeight: '600' as const,
      color: colors.textPrimary,
    },
    playerLocation: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    onlineDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    markerContainer: {
      alignItems: 'center',
    },
    markerBorder: {
      borderWidth: 3,
      borderRadius: 22,
      padding: 2,
    },
    markerAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceLight,
    },
    markerOnline: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.green,
      borderWidth: 2,
    },
    markerLabel: {
      backgroundColor: colors.card,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginTop: 4,
      alignItems: 'center',
      borderWidth: 1,
    },
    markerName: {
      fontSize: 10,
      fontWeight: '600' as const,
      maxWidth: 70,
    },
    markerRating: {
      fontSize: 9,
      fontWeight: '700' as const,
    },
  });
}
