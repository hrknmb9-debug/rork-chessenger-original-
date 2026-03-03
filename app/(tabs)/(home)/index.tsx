import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
} from 'react-native';
import { Image } from 'expo-image';
import { SafeImage } from '@/components/SafeImage';
import { useRouter } from 'expo-router';
import {
  Search,
  Map,
  Navigation,
  Bell,
  SlidersHorizontal,
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
          {language === 'ja' ? 'オンライン中' : 'Online Now'}
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
            {language === 'ja' ? '待機中のプレイヤーはいません' : 'No players online'}
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
  const { language, unreadNotificationCount, currentUserId } = useChess();
  const { userLocation, isLoading: locationLoading, toggleLocationEnabled } = useLocation();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPlayers = useCallback(async () => {
    let query = supabase.from('profiles').select('*');
    if (currentUserId) {
      query = query.neq('id', currentUserId);
    }
    const { data, error } = await query;
    if (error) {
      console.log('fetchPlayers error:', error.message);
      return;
    }
    if (data) {
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
    let result = [...players];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q) || p.location.toLowerCase().includes(q));
    }
    if (activeTab === 'nearby' && userLocation) {
      result = result.filter(p => p.distance <= 10);
    } else if (activeTab === 'online') {
      result = result.filter(p => p.isOnline);
    }
    return result.sort((a, b) => (a.isOnline === b.isOnline ? a.distance - b.distance : a.isOnline ? -1 : 1));
  }, [players, searchQuery, activeTab, userLocation]);

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'all', label: language === 'ja' ? 'すべて' : 'All' },
    { key: 'nearby', label: language === 'ja' ? '近く' : 'Nearby' },
    { key: 'online', label: language === 'ja' ? 'オンライン' : 'Online' },
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
            <Text style={styles.headerLogo}>{'♟'}</Text>
            <Text style={styles.headerTitle}>Chessenger</Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable onPress={() => router.push('/(tabs)/notifications' as any)} style={styles.headerIconBtn}>
              <Bell size={20} color={colors.textPrimary} />
            </Pressable>
            <Pressable onPress={() => router.push('/settings' as any)} style={styles.headerIconBtn}>
              <SlidersHorizontal size={20} color={colors.textPrimary} />
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
            onMessagePress={() => router.push(('/messages/new_' + item.id) as any)}
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
                <Map size={14} color={colors.blue} />
              </Pressable>
            </View>

            <View style={styles.onlineSection}>
              <OnlineStrip
                players={players}
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
                  onPress={() => setActiveTab(tab.key)}
                  style={[styles.tab, activeTab === tab.key ? styles.tabActive : null]}
                >
                  <Text style={[styles.tabText, activeTab === tab.key ? styles.tabTextActive : null]}>
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </View>
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
    headerLogo: { fontSize: 24 },
    headerTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerIconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceLight, alignItems: 'center', justifyContent: 'center' },
    listContent: { paddingBottom: 100 },
    listHeader: { paddingTop: 4, marginBottom: 4 },
    locationBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 14 },
    locationChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder },
    locationChipActive: { borderColor: colors.blue + '55', backgroundColor: colors.blueMuted },
    locationText: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
    locationTextActive: { color: colors.blue },
    mapBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.blueMuted, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.blue + '33' },
    onlineSection: { marginHorizontal: 16, marginBottom: 4 },
    searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 12, height: 40, paddingHorizontal: 16, backgroundColor: colors.inputBg, borderRadius: 20 },
    searchInput: { flex: 1, fontSize: 15, color: colors.textPrimary },
    tabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, gap: 8 },
    tab: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20, backgroundColor: colors.surface },
    tabActive: { backgroundColor: colors.accent },
    tabText: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
    tabTextActive: { color: '#fff', fontWeight: '600' },
  });
}
