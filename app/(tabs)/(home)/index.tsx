import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  Platform,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeImage } from '@/components/SafeImage';
import { useRouter } from 'expo-router';
import {
  Search,
  Map,
  Navigation,
  Settings,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { Player, SkillLevel, PlayStyle } from '@/types';
import { useChess } from '@/providers/ChessProvider';
import { useLocation, calculateDistance } from '@/providers/LocationProvider';
import { PlayerCard } from '@/components/PlayerCard';
import { t } from '@/utils/translations';
import { supabase } from '@/utils/supabaseClient';
import { resolveAvatarUrl } from '@/utils/avatarUrl';

type TabKey = 'all' | 'nearby' | 'online';
type NearbyFilter = 'all' | '0.5' | '1' | '1.5';

interface SupabaseProfile {
  id: string;
  name?: string;
  avatar?: string;
  bio?: string;
  rating?: number;
  chess_com_rating?: number | null;
  lichess_rating?: number | null;
  skill_level?: string;
  preferred_time_control?: string;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
  languages?: string[];
  country?: string;
  games_played?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  is_online?: boolean;
  last_active?: string;
  play_styles?: string[];
  last_seen?: string;
}

function mapProfile(profile: SupabaseProfile, userLat?: number, userLon?: number): Player {
  const lat = profile.latitude ?? 0;
  const lon = profile.longitude ?? 0;
  let distance = 999;
  if (userLat && userLon && lat !== 0 && lon !== 0) {
    distance = Math.round(calculateDistance(userLat, userLon, lat, lon) * 10) / 10;
  }
  return {
    id: profile.id,
    name: profile.name ?? 'Unknown',
    avatar: resolveAvatarUrl(profile.avatar),
    rating: profile.rating ?? 0,
    chessComRating: profile.chess_com_rating ?? null,
    lichessRating: profile.lichess_rating ?? null,
    skillLevel: (profile.skill_level as SkillLevel) ?? 'beginner',
    gamesPlayed: profile.games_played ?? 0,
    wins: profile.wins ?? 0,
    losses: profile.losses ?? 0,
    draws: profile.draws ?? 0,
    distance,
    isOnline: profile.is_online ?? false,
    lastActive: profile.last_active ?? '',
    bio: profile.bio ?? '',
    bioEn: '',
    preferredTimeControl: profile.preferred_time_control ?? '15+10',
    location: profile.location ?? '',
    coordinates: { latitude: lat, longitude: lon },
    languages: profile.languages ?? [],
    country: profile.country,
    playStyles: (profile.play_styles as PlayStyle[]) ?? [],
    lastSeen: profile.last_seen,
  };
}

function AnimatedHeader({ colors }: { colors: ThemeColors }) {
  const iconPulse = useRef(new Animated.Value(1)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const titleSlide = useRef(new Animated.Value(-8)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // タイトルのフェードイン+スライドイン
    Animated.parallel([
      Animated.timing(titleOpacity, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(titleSlide, { toValue: 0, speed: 14, bounciness: 6, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();

    // アイコンのパルスループ
    Animated.loop(
      Animated.sequence([
        Animated.timing(iconPulse, { toValue: 1.08, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(iconPulse, { toValue: 1, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
      ])
    ).start();

    // シマーループ（0→1→0）
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1800, useNativeDriver: false }),
        Animated.timing(shimmer, { toValue: 0, duration: 1800, useNativeDriver: false }),
      ])
    ).start();
  }, []);

  const titleColor = shimmer.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [colors.textPrimary, '#22C55E', colors.textPrimary],
  });

  return (
    <View style={headerAnim.row}>
      {/* アイコン画像 */}
      <Animated.View style={[headerAnim.iconWrap, { transform: [{ scale: iconPulse }] }]}>
        <Image
          source={require('@/assets/images/app-icon.png')}
          style={headerAnim.iconImg}
          contentFit="cover"
        />
      </Animated.View>

      {/* タイトル */}
      <Animated.View style={{ opacity: titleOpacity, transform: [{ translateX: titleSlide }] }}>
        <Animated.Text style={[headerAnim.title, { color: titleColor }]}>
          Chessenger
        </Animated.Text>
        <View style={headerAnim.subtitleRow}>
          <View style={headerAnim.dot} />
          <Text style={[headerAnim.subtitle, { color: colors.textMuted }]}>Find your match</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const headerAnim = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#22C55E', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8 },
      android: { elevation: 4 },
      web: { boxShadow: '0 3px 10px rgba(34,197,94,0.35)' } as any,
    }),
  },
  iconImg: { width: 42, height: 42 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  subtitle: { fontSize: 11, fontWeight: '500' },
});

function OnlineStrip({
  players,
  onPress,
  colors,
  language,
}: {
  players: Player[];
  onPress: (player: Player) => void;
  colors: ThemeColors;
  language: string;
}) {
  const online = useMemo(() => players.slice(0, 12), [players]);

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={strip.headerRow}>
        <View style={strip.dot} />
        <Text style={[strip.title, { color: '#22C55E' }]}>
          {t('online_now', language)}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={strip.scroll}>
        {online.length > 0 ? (
          online.map(player => (
            <TouchableOpacity
              key={player.id}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.selectionAsync();
                onPress(player);
              }}
              style={[strip.item, { borderColor: colors.cardBorder }]}
            >
              <View style={strip.avatarWrap}>
                <SafeImage uri={player.avatar} name={player.name} style={strip.avatar} contentFit="cover" />
                <View style={[strip.onlineBadge, { backgroundColor: '#22C55E', borderColor: colors.card }]} />
              </View>
              <Text style={[strip.name, { color: colors.textPrimary }]} numberOfLines={1}>
                {player.name.split(' ')[0]}
              </Text>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={{ color: colors.textMuted, fontSize: 12, paddingLeft: 4 }}>
            {t('no_players_online', language)}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const strip = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' },
  title: { fontSize: 13, fontWeight: '700' },
  scroll: { paddingRight: 4, gap: 10 },
  item: { alignItems: 'center', width: 68, paddingVertical: 10, borderRadius: 24, borderWidth: 1 },
  avatarWrap: { position: 'relative', marginBottom: 6 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E5E7EB' },
  onlineBadge: { position: 'absolute', bottom: 1, right: 1, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  name: { fontSize: 11, fontWeight: '500', textAlign: 'center' },
});

export default function HomeScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { language, currentUserId, blockedUsers } = useChess();
  const { userLocation, isLoading: locationLoading, toggleLocationEnabled } = useLocation();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [nearbyFilter, setNearbyFilter] = useState<NearbyFilter>('all');
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPlayers = useCallback(async () => {
    let query = supabase.from('profiles_with_match_stats').select('*');
    if (currentUserId) {
      query = query.neq('id', currentUserId);
    }
    const { data, error } = await query;
    if (error) {
      console.warn('[Home] profiles_with_match_stats error:', error.message, 'code:', error.code, 'details:', error.details);
      return;
    }
    if (data) {
      if (__DEV__ && data.length > 0) {
        const first = data[0] as Record<string, unknown>;
        console.log('[Home] profiles_with_match_stats sample:', {
          games_played: first.games_played,
          hasKey: 'games_played' in first,
          keys: Object.keys(first).filter(k => k.includes('game') || k.includes('win') || k.includes('loss') || k.includes('draw')),
        });
      }
      const userLat = userLocation?.latitude;
      const userLon = userLocation?.longitude;
      const mapped = (data as SupabaseProfile[]).map(p => mapProfile(p, userLat, userLon));
      setPlayers(mapped);
    }
  }, [userLocation, currentUserId]);

  useEffect(() => {
    setLoading(true);
    fetchPlayers().finally(() => setLoading(false));
  }, [fetchPlayers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPlayers();
    setRefreshing(false);
  }, [fetchPlayers]);

  const filteredPlayers = useMemo(() => {
    // ブロック済みユーザーを除外
    let result = players.filter(p => !blockedUsers.includes(p.id));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q) || p.location.toLowerCase().includes(q));
    }
    if (activeTab === 'nearby' && userLocation) {
      // nearbyFilter に応じた距離上限（km）
      const maxKm = nearbyFilter === '0.5' ? 0.5 : nearbyFilter === '1' ? 1 : nearbyFilter === '1.5' ? 1.5 : 10;
      result = result.filter(p => p.distance <= maxKm);
    } else if (activeTab === 'online') {
      result = result.filter(p => p.isOnline);
    }
    return result.sort((a, b) => (a.isOnline === b.isOnline ? a.distance - b.distance : a.isOnline ? -1 : 1));
  }, [players, searchQuery, activeTab, nearbyFilter, userLocation, blockedUsers]);

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'all', label: t('all', language) },
    { key: 'nearby', label: t('nearby', language) },
    { key: 'online', label: t('online', language) },
  ];

  const NEARBY_FILTERS: { key: NearbyFilter; label: string }[] = [
    { key: 'all', label: language === 'ja' ? '全て' : 'All' },
    { key: '0.5', label: '0-500m' },
    { key: '1', label: '0-1km' },
    { key: '1.5', label: '0-1.5km' },
  ];

  if (loading) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeHeader}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <AnimatedHeader colors={colors} />
          </View>
          <View style={styles.headerRight}>
            <Pressable onPress={() => router.push('/settings' as any)} style={styles.headerIconBtn}>
              <Settings size={22} color={colors.textPrimary} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <FlatList
        data={filteredPlayers}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <PlayerCard
            player={item}
            onPress={() => router.push(('/player/' + item.id) as any)}
            language={language}
          />
        )}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={styles.locationBar}>
              <Pressable
                onPress={toggleLocationEnabled}
                style={[styles.locationChip, userLocation ? styles.locationChipActive : null]}
              >
                <Navigation size={13} color={userLocation ? colors.blue : colors.textMuted} />
                <Text style={[styles.locationText, userLocation ? styles.locationTextActive : null]}>
                  {userLocation ? t('location_enabled', language) : t('location_off', language)}
                </Text>
              </Pressable>
              <Pressable onPress={() => router.push('/(tabs)/(home)/map' as any)} style={styles.mapBtn}>
                <Map size={16} color={colors.blue} />
                <Text style={[styles.mapBtnText, { color: colors.blue }]}>
                  {t('map_view', language)}
                </Text>
              </Pressable>
            </View>

            <View style={styles.onlineSection}>
              <OnlineStrip
                players={players.filter(p => !blockedUsers.includes(p.id))}
                onPress={p => router.push(('/player/' + p.id) as any)}
                colors={colors}
                language={language}
              />
            </View>

            <View style={styles.searchBar}>
              <Search size={16} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('search_placeholder', language)}
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            <View style={styles.tabs}>
              {TABS.map(tab => (
                <Pressable
                  key={tab.key}
                  onPress={() => {
                    setActiveTab(tab.key);
                    if (tab.key !== 'nearby') setNearbyFilter('all');
                  }}
                  style={[styles.tab, activeTab === tab.key ? styles.tabActive : null]}
                >
                  <Text style={[styles.tabText, activeTab === tab.key ? styles.tabTextActive : null]}>
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {activeTab === 'nearby' && (
              <View style={styles.nearbyFilters}>
                {NEARBY_FILTERS.map(f => (
                  <Pressable
                    key={f.key}
                    onPress={() => setNearbyFilter(f.key)}
                    style={[styles.nearbyChip, nearbyFilter === f.key ? styles.nearbyChipActive : null]}
                  >
                    <Text style={[styles.nearbyChipText, nearbyFilter === f.key ? styles.nearbyChipTextActive : null]}>
                      {f.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        }
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    safeHeader: { backgroundColor: colors.background, paddingTop: Platform.OS === 'ios' ? 10 : 30 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerIconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.cardBorder },
    listContent: { paddingBottom: 120 },
    listHeader: { paddingTop: 4, marginBottom: 4 },
    locationBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 16 },
    locationChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder },
    locationChipActive: { borderColor: colors.blue + '55', backgroundColor: colors.blueMuted },
    locationText: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
    locationTextActive: { color: colors.blue },
    mapBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.blueMuted, borderWidth: 1, borderColor: colors.blue + '33' },
    mapBtnText: { fontSize: 13, fontWeight: '600' },
    onlineSection: { marginHorizontal: 16, marginBottom: 4 },
    searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 14, height: 44, paddingHorizontal: 16, backgroundColor: colors.inputBg, borderRadius: 22 },
    searchInput: { flex: 1, fontSize: 15, color: colors.textPrimary },
    tabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 10, gap: 10 },
    tab: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20, backgroundColor: colors.surface },
    tabActive: { backgroundColor: colors.accent },
    tabText: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
    tabTextActive: { color: '#fff', fontWeight: '600' },
    nearbyFilters: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 14, gap: 8, flexWrap: 'wrap' },
    nearbyChip: { paddingVertical: 5, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder },
    nearbyChipActive: { backgroundColor: colors.blueMuted, borderColor: colors.blue + '66' },
    nearbyChipText: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
    nearbyChipTextActive: { color: colors.blue, fontWeight: '700' },
  });
}
