import React, { useState, useCallback, useMemo, useRef } from 'react';
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
import { useRouter } from 'expo-router';
import {
  Search,
  MapPin,
  Navigation,
  Map,
  LogIn,
  ChevronRight,
  Bell,
  SlidersHorizontal,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { Player, SkillLevel } from '@/types';
import { useChess } from '@/providers/ChessProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useLocation } from '@/providers/LocationProvider';
import { PlayerCard } from '@/components/PlayerCard';
import { t } from '@/utils/translations';

type TabKey = 'all' | 'nearby' | 'online';

const SKILL_FILTERS: { key: SkillLevel | 'all'; labelKey: string }[] = [
  { key: 'all', labelKey: 'all' },
  { key: 'beginner', labelKey: 'beginner' },
  { key: 'intermediate', labelKey: 'intermediate' },
  { key: 'advanced', labelKey: 'advanced' },
  { key: 'expert', labelKey: 'expert' },
];

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
  const online = useMemo(() => players.filter(p => p.isOnline).slice(0, 12), [players]);
  if (online.length === 0) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={strip.headerRow}>
        <View style={strip.dot} />
        <Text style={[strip.title, { color: '#22C55E' }]}>
          {language === 'ja' ? 'オンライン中' : 'Online Now'}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={strip.scroll}
      >
        {online.map(player => (
          <TouchableOpacity
            key={player.id}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.selectionAsync();
              onPress(player);
            }}
            style={[strip.item, { borderColor: colors.cardBorder }]}
          >
            <View style={strip.avatarWrap}>
              <Image source={{ uri: player.avatar }} style={strip.avatar} contentFit="cover" />
              <View style={[strip.onlineBadge, { backgroundColor: '#22C55E', borderColor: colors.card }]} />
            </View>
            <Text style={[strip.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {player.name.split(' ')[0]}
            </Text>
          </TouchableOpacity>
        ))}
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
  const { players, language, unreadNotificationCount, refreshPlayers } = useChess();
  const { isLoggedIn } = useAuth();
  const { userLocation, isLoading: locationLoading, toggleLocationEnabled } = useLocation();
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSkill, setActiveSkill] = useState<SkillLevel | 'all'>('all');
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  const filteredPlayers = useMemo(() => {
    let result = [...players];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q) || p.location.toLowerCase().includes(q));
    }
    if (activeSkill !== 'all') result = result.filter(p => p.skillLevel === activeSkill);
    if (activeTab === 'nearby' && userLocation) result = result.filter(p => p.distance <= 10);
    else if (activeTab === 'online') result = result.filter(p => p.isOnline);
    return result.sort((a, b) => (a.isOnline === b.isOnline ? a.distance - b.distance : a.isOnline ? -1 : 1));
  }, [players, searchQuery, activeSkill, activeTab, userLocation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshPlayers();
    setRefreshing(false);
  }, [refreshPlayers]);

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'all', label: language === 'ja' ? 'すべて' : 'All' },
    { key: 'nearby', label: language === 'ja' ? '近く' : 'Nearby' },
    { key: 'online', label: language === 'ja' ? 'オンライン' : 'Online' },
  ];

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeHeader}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerLogo}>♟</Text>
            <Text style={styles.headerTitle}>Chessenger</Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable onPress={() => router.push('/notifications' as any)} style={styles.headerIconBtn}>
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
          <PlayerCard player={item} onPress={() => router.push(`/player/${item.id}` as any)} onMessagePress={() => router.push(`/chat/new_${item.id}` as any)} language={language} />
        )}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={styles.locationBar}>
              <Pressable onPress={toggleLocationEnabled} style={[styles.locationChip, userLocation && styles.locationChipActive]}>
                <Navigation size={13} color={userLocation ? colors.blue : colors.textMuted} />
                <Text style={[styles.locationText, userLocation && styles.locationTextActive]}>
                  {userLocation ? t('location_enabled', language) : t('location_off', language)}
                </Text>
              </Pressable>
              <Pressable onPress={() => router.push('/(tabs)/(home)/map' as any)} style={styles.mapBtn}>
                <Map size={14} color={colors.blue} />
              </Pressable>
            </View>

            <View style={styles.onlineSection}>
              <OnlineStrip players={players} onPress={p => router.push(`/player/${p.id}` as any)} colors={colors} language={language} />
            </View>

            <View style={styles.searchBar}>
              <Search size={16} color={colors.textMuted} />
              <TextInput style={styles.searchInput} placeholder={t('search_placeholder', language)} placeholderTextColor={colors.textMuted} value={searchQuery} onChangeText={setSearchQuery} />
            </View>

            <View style={styles.tabs}>
              {TABS.map(tab => (
                <Pressable key={tab.key} onPress={() => setActiveTab(tab.key)} style={[styles.tab, activeTab === tab.key && styles.tabActive]}>
                  <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
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
    safeHeader: { backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    headerLogo: { fontSize: 20 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.4 },
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