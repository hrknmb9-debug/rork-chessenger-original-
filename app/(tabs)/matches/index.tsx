import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
  memo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  Pressable,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  X,
  Heart,
  MessageCircle,
  Bell,
  MapPin,
  Trophy,
  RotateCcw,
} from 'lucide-react-native';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useChess } from '@/providers/ChessProvider';
import { Player } from '@/types';
import { supabase } from '@/utils/supabaseClient';
import { resolveAvatarUrl } from '@/utils/avatarUrl';
import { getCountryFlag, getCountryName } from '@/utils/translations';
import { ReportButton } from '@/components/ReportButton';

// ─── 型定義 ──────────────────────────────────────────────────────────────────

interface DiscoverProfile {
  id: string;
  name: string;
  avatar: string | null;
  location: string | null;
  country: string | null;
  skillLevel: string | null;
  rating: number | null;
  chessComRating: number | null;
  playStyles: string[];
  preferredTimeControl: string | null;
  bio: string | null;
  games_played?: number | null;
  wins?: number | null;
  losses?: number | null;
  draws?: number | null;
}

// ─── 定数 ────────────────────────────────────────────────────────────────────

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_W - 40, 420);
const CARD_HEIGHT = Math.min(SCREEN_H * 0.62, 520);
const SWIPE_THRESHOLD = 80;
const SWIPE_OUT_DURATION = 260;

const PLAY_STYLE_META: Record<string, { label: string; emoji: string }> = {
  casual:            { label: 'Casual',            emoji: '🎲' },
  beginner_welcome:  { label: 'Beginner Friendly',  emoji: '🌱' },
  competitive:       { label: 'Competitive',         emoji: '⚔️' },
  spectator_welcome: { label: 'Spectator OK',        emoji: '👀' },
  tournament:        { label: 'Tournament',          emoji: '🏆' },
};

const SKILL_META: Record<string, { label: string; emoji: string }> = {
  beginner:    { label: 'Beginner',     emoji: '🌱' },
  intermediate:{ label: 'Intermediate', emoji: '♟️' },
  advanced:    { label: 'Advanced',     emoji: '🔥' },
  expert:      { label: 'Expert',       emoji: '👑' },
};

function getRoomId(a: string, b: string): string {
  return [a, b].sort().join('_');
}

function discoverProfileToPlayer(p: DiscoverProfile): Player {
  return {
    id: p.id,
    name: p.name,
    avatar: resolveAvatarUrl(p.avatar, p.name),
    rating: p.rating ?? p.chessComRating ?? 0,
    chessComRating: p.chessComRating ?? null,
    lichessRating: null,
    skillLevel: (p.skillLevel as Player['skillLevel']) ?? 'intermediate',
    gamesPlayed: p.games_played ?? 0,
    wins: p.wins ?? 0,
    losses: p.losses ?? 0,
    draws: p.draws ?? 0,
    distance: 0,
    isOnline: false,
    lastActive: '',
    bio: p.bio ?? '',
    bioEn: '',
    preferredTimeControl: p.preferredTimeControl ?? '15+10',
    location: p.location ?? '',
    coordinates: { latitude: 0, longitude: 0 },
    languages: [],
    country: p.country ?? undefined,
    playStyles: p.playStyles as Player['playStyles'],
  };
}

// ─── データ取得フック ─────────────────────────────────────────────────────────

function useDiscoverProfiles(currentUserId: string | undefined) {
  const [profiles, setProfiles] = useState<DiscoverProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: profileRows, error: profileErr } = await supabase
        .from('profiles')
        .select('id, name, avatar, location, country, skill_level, rating, chess_com_rating, play_styles, preferred_time_control, bio')
        .neq('id', currentUserId)
        .limit(30);

      if (profileErr) throw profileErr;

      if (!profileRows?.length) {
        setProfiles([]);
        return;
      }

      const ids = profileRows.map((r: { id: string }) => r.id);
      const { data: statsRows } = await supabase.rpc('get_profile_match_stats_batch', { p_profile_ids: ids });
      const statsMap = new Map<string, { games_played: number; wins: number; losses: number; draws: number }>();
      (statsRows ?? []).forEach((r: { profile_id: string; games_played: number; wins: number; losses: number; draws: number }) => {
        statsMap.set(r.profile_id, { games_played: r.games_played ?? 0, wins: r.wins ?? 0, losses: r.losses ?? 0, draws: r.draws ?? 0 });
      });

      const shuffled: DiscoverProfile[] = profileRows
        .map((r: any) => {
          const s = statsMap.get(r.id) ?? { games_played: 0, wins: 0, losses: 0, draws: 0 };
          return {
            id: r.id,
            name: r.name ?? 'Unknown',
            avatar: r.avatar ?? null,
            location: r.location ?? null,
            country: r.country ?? null,
            skillLevel: r.skill_level ?? null,
            rating: r.rating ?? null,
            chessComRating: r.chess_com_rating ?? null,
            playStyles: Array.isArray(r.play_styles) ? r.play_styles : [],
            preferredTimeControl: r.preferred_time_control ?? null,
            bio: r.bio ?? null,
            games_played: s.games_played,
            wins: s.wins,
            losses: s.losses,
            draws: s.draws,
          };
        })
        .sort(() => Math.random() - 0.5);

      setProfiles(shuffled);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => { load(); }, [load]);

  return { profiles, loading, error, reload: load };
}

// ─── アクションボタン ─────────────────────────────────────────────────────────

interface ActionButtonProps {
  onPress: () => void;
  icon: React.ReactNode;
  bgColor: string;
  size?: 'sm' | 'lg';
  shadow?: boolean;
}

const ActionButton = memo(function ActionButton({
  onPress,
  icon,
  bgColor,
  size = 'sm',
  shadow = true,
}: ActionButtonProps) {
  const dim = size === 'lg' ? 72 : 58;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          backgroundColor: bgColor,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.8 : 1,
          ...(shadow && Platform.OS !== 'web'
            ? {
                shadowColor: bgColor,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.35,
                shadowRadius: 10,
                elevation: 8,
              }
            : {}),
        },
      ]}
    >
      {icon}
    </Pressable>
  );
});

// ─── カードコンポーネント ──────────────────────────────────────────────────────

interface SwipeCardProps {
  profile: DiscoverProfile;
  isTop: boolean;
  pan: Animated.ValueXY;
  panHandlers: any;
  likeOpacity: Animated.AnimatedInterpolation<number>;
  nopeOpacity: Animated.AnimatedInterpolation<number>;
}

const SwipeCard = memo(function SwipeCard({
  profile,
  isTop,
  pan,
  panHandlers,
  likeOpacity,
  nopeOpacity,
}: SwipeCardProps) {
  const rotate = pan.x.interpolate({
    inputRange: [-SCREEN_W / 2, 0, SCREEN_W / 2],
    outputRange: ['-10deg', '0deg', '10deg'],
    extrapolate: 'clamp',
  });

  const animStyle = isTop
    ? { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] }
    : {};

  const chips = [
    profile.skillLevel ? SKILL_META[profile.skillLevel] : null,
    ...profile.playStyles.slice(0, 2).map(k => PLAY_STYLE_META[k] ?? null),
  ].filter(Boolean) as { label: string; emoji: string }[];

  const ratingDisplay = profile.chessComRating ?? profile.rating;
  const locationDisplay = [
    profile.location,
    profile.country ? `${getCountryFlag(profile.country)}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Animated.View
      style={[styles.card, animStyle]}
      {...(isTop ? panHandlers : {})}
    >
      {/* 背景画像 */}
      <Image
        source={{ uri: resolveAvatarUrl(profile.avatar, profile.name) }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />

      {/* グラデーションオーバーレイ */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.72)']}
        locations={[0.3, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* LIKE / NOPE インジケーター */}
      {isTop && (
        <>
          <Animated.View style={[styles.indicator, styles.likeIndicator, { opacity: likeOpacity }]}>
            <Text style={styles.likeText}>LIKE</Text>
          </Animated.View>
          <Animated.View style={[styles.indicator, styles.nopeIndicator, { opacity: nopeOpacity }]}>
            <Text style={styles.nopeText}>NOPE</Text>
          </Animated.View>
        </>
      )}

      {/* カード下部テキスト */}
      <View style={styles.cardFooter}>
        <View style={styles.cardNameRow}>
          <Text style={styles.cardName} numberOfLines={1}>{profile.name}</Text>
          {ratingDisplay ? (
            <View style={styles.ratingBadge}>
              <Trophy size={11} color="#FFD700" />
              <Text style={styles.ratingText}>{ratingDisplay}</Text>
            </View>
          ) : null}
        </View>

        {locationDisplay ? (
          <View style={styles.locationRow}>
            <MapPin size={13} color="rgba(255,255,255,0.8)" />
            <Text style={styles.locationText} numberOfLines={1}>{locationDisplay}</Text>
          </View>
        ) : null}

        {profile.preferredTimeControl ? (
          <Text style={styles.timeControlText}>⏱ {profile.preferredTimeControl}</Text>
        ) : null}

        {chips.length > 0 && (
          <View style={styles.chipsRow}>
            {chips.map((c, i) => (
              <View key={i} style={styles.chip}>
                <Text style={styles.chipText}>{c.emoji} {c.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );
});

// ─── 次のカード（背景に表示）─────────────────────────────────────────────────

interface BackCardProps {
  profile: DiscoverProfile;
  pan: Animated.ValueXY;
  depth: number; // 1 = すぐ後ろ, 2 = その後ろ
}

const BackCard = memo(function BackCard({ profile, pan, depth }: BackCardProps) {
  const base = depth === 1 ? 0.93 : 0.86;
  const scale = pan.x.interpolate({
    inputRange: [-SCREEN_W, 0, SCREEN_W],
    outputRange: [1, base, 1],
    extrapolate: 'clamp',
  });
  const translateY = pan.x.interpolate({
    inputRange: [-SCREEN_W, 0, SCREEN_W],
    outputRange: [0, depth * 10, 0],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      style={[
        styles.card,
        { transform: [{ scale }, { translateY }], zIndex: -depth },
      ]}
    >
      <Image
        source={{ uri: resolveAvatarUrl(profile.avatar, profile.name) }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.55)']}
        locations={[0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.cardFooter}>
        <Text style={styles.cardName} numberOfLines={1}>{profile.name}</Text>
      </View>
    </Animated.View>
  );
});

// ─── メイン画面 ───────────────────────────────────────────────────────────────

export default function MatchDiscoverScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { sendMatchRequest, pendingIncoming } = useChess();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarH = 68 + Math.max(insets.bottom, 8);

  const [currentIndex, setCurrentIndex] = useState(0);
  const { profiles, loading, error, reload } = useDiscoverProfiles(user?.id);

  const pan = useRef(new Animated.ValueXY()).current;

  // プロファイルが変わったらリセット
  useEffect(() => { setCurrentIndex(0); }, [profiles]);

  const advanceCard = useCallback(() => {
    pan.setValue({ x: 0, y: 0 });
    setCurrentIndex(i => i + 1);
  }, [pan]);

  const handleLike = useCallback(() => {
    const p = profiles[currentIndex];
    if (p) {
      const player = discoverProfileToPlayer(p);
      sendMatchRequest(player, p.preferredTimeControl ?? '15+10');
    }
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.timing(pan, {
      toValue: { x: SCREEN_W + 120, y: 0 },
      duration: SWIPE_OUT_DURATION,
      useNativeDriver: false,
    }).start(advanceCard);
  }, [profiles, currentIndex, sendMatchRequest, pan, advanceCard]);

  const handleSkip = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(pan, {
      toValue: { x: -SCREEN_W - 120, y: 0 },
      duration: SWIPE_OUT_DURATION,
      useNativeDriver: false,
    }).start(advanceCard);
  }, [pan, advanceCard]);

  const handleMessage = useCallback(() => {
    const p = profiles[currentIndex];
    if (!p || !user?.id) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const roomId = getRoomId(user.id, p.id);
    router.push(`/messages/${roomId}` as any);
  }, [profiles, currentIndex, user?.id, router]);

  const resetCard = useCallback(() => {
    Animated.spring(pan, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
      tension: 40,
      friction: 7,
    }).start();
  }, [pan]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > SWIPE_THRESHOLD) {
            handleLike();
          } else if (gesture.dx < -SWIPE_THRESHOLD) {
            handleSkip();
          } else {
            resetCard();
          }
        },
        onPanResponderTerminate: resetCard,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentIndex]
  );

  const likeOpacity = pan.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const nopeOpacity = pan.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const bg = isDark ? '#0E1A12' : '#F5F7F5';
  const headerBg = isDark ? '#0E1A12' : '#FFFFFF';
  const cardShadowColor = isDark ? '#000' : '#2B9B50';
  const matchBadgeCount = pendingIncoming?.length ?? 0;

  // ─── ローディング ──
  if (loading) {
    return (
      <View style={[styles.centerScreen, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading players...</Text>
      </View>
    );
  }

  const currentProfile = profiles[currentIndex];
  const nextProfile = profiles[currentIndex + 1];
  const afterNextProfile = profiles[currentIndex + 2];
  const allSwiped = !currentProfile;

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* ─── ヘッダー ── */}
      <SafeAreaView style={{ backgroundColor: headerBg }}>
        <View style={[styles.header, { backgroundColor: headerBg }]}>
          {/* 左: アバター + ウェルカムメッセージ */}
          <View style={styles.headerLeft}>
            <Image
              source={{ uri: resolveAvatarUrl(user?.avatar, user?.name) }}
              style={styles.headerAvatar}
              contentFit="cover"
            />
            <View>
              <Text style={[styles.headerSub, { color: colors.textMuted }]}>Welcome Back 👋</Text>
              <Text style={[styles.headerName, { color: colors.textPrimary }]} numberOfLines={1}>
                {user?.name ?? 'Player'}
              </Text>
            </View>
          </View>

          {/* 右: 通報 + マッチ通知ベル */}
          <View style={styles.headerRight}>
            <ReportButton />
            <Pressable
              onPress={() => router.push('/matches/notifications' as any)}
              style={[styles.headerIconBtn, { backgroundColor: isDark ? colors.surface : '#F3F4F6' }]}
            >
              <Bell size={20} color={colors.textPrimary} />
              {matchBadgeCount > 0 && (
                <View style={styles.headerBadge}>
                  <Text style={styles.headerBadgeText}>{matchBadgeCount > 9 ? '9+' : matchBadgeCount}</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {/* ─── カードスタック ── */}
      <View style={styles.cardStack}>
        {allSwiped ? (
          /* 全カード使い切った */
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>♔</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              You've seen everyone!
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
              Check back later for new players
            </Text>
            <Pressable
              onPress={reload}
              style={[styles.reloadBtn, { backgroundColor: colors.accent }]}
            >
              <RotateCcw size={16} color="#fff" />
              <Text style={styles.reloadBtnText}>Reload</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* 後ろのカード2枚 */}
            {afterNextProfile && (
              <BackCard profile={afterNextProfile} pan={pan} depth={2} />
            )}
            {nextProfile && (
              <BackCard profile={nextProfile} pan={pan} depth={1} />
            )}
            {/* メインカード */}
            <SwipeCard
              profile={currentProfile}
              isTop
              pan={pan}
              panHandlers={panResponder.panHandlers}
              likeOpacity={likeOpacity}
              nopeOpacity={nopeOpacity}
            />
          </>
        )}
      </View>

      {/* ─── アクションボタン ── */}
      {!allSwiped && (
        <View style={styles.actionRow}>
          <ActionButton
            onPress={handleSkip}
            bgColor="#FF5F6D"
            icon={<X size={26} color="#fff" strokeWidth={2.5} />}
          />
          <ActionButton
            onPress={handleMessage}
            bgColor="#8B5CF6"
            size="lg"
            icon={<MessageCircle size={30} color="#fff" strokeWidth={2} />}
          />
          <ActionButton
            onPress={handleLike}
            bgColor={colors.accent}
            icon={<Heart size={26} color="#fff" fill="#fff" strokeWidth={2} />}
          />
        </View>
      )}

      {/* ─── スワイプヒント ── */}
      {!allSwiped && (
        <Text style={[styles.hintText, { color: colors.textMuted, paddingBottom: tabBarH }]}>
          Swipe right to like · left to skip
        </Text>
      )}
    </View>
  );
}

// ─── スタイル ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // ヘッダー
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  headerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E5E7EB',
  },
  headerSub: {
    fontSize: 11,
    fontWeight: '500',
  },
  headerName: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 10,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#FF5F6D',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  headerBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },

  // カードスタック
  cardStack: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    paddingBottom: 8,
  },
  card: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#1A1A2E',
    ...(Platform.OS !== 'web'
      ? {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.18,
          shadowRadius: 20,
          elevation: 12,
        }
      : {}),
  },

  // LIKE / NOPE インジケーター
  indicator: {
    position: 'absolute',
    top: 40,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 3,
    zIndex: 10,
  },
  likeIndicator: {
    left: 24,
    borderColor: '#4ADE80',
    backgroundColor: 'rgba(74,222,128,0.15)',
    transform: [{ rotate: '-15deg' }],
  },
  nopeIndicator: {
    right: 24,
    borderColor: '#FF5F6D',
    backgroundColor: 'rgba(255,95,109,0.15)',
    transform: [{ rotate: '15deg' }],
  },
  likeText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#4ADE80',
    letterSpacing: 2,
  },
  nopeText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FF5F6D',
    letterSpacing: 2,
  },

  // カードフッター
  cardFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 22,
    gap: 6,
  },
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    flex: 1,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFD700',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  locationText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },
  timeControlText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  chipText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // アクションボタン（タブバー分の余白は動的に付与するためここでは0）
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    paddingBottom: 8,
    paddingTop: 12,
  },

  // ヒント
  hintText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '500',
    paddingBottom: 16,
    opacity: 0.6,
  },

  // 空状態
  emptyContainer: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  reloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  reloadBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
