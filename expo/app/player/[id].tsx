import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  Platform,
  Alert,
  InteractionManager,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { SafeImage } from '@/components/SafeImage';
import {
  MapPin,
  Clock,
  Zap,
  Trophy,
  Send,
  ChevronDown,
  Navigation,
  ShieldBan,
  ShieldCheck,
  MessageCircle,
  Languages,
  Star,
  Swords,
  Flag,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { useLocation } from '@/providers/LocationProvider';
import {
  getSkillLabel,
  formatDistance,
  formatRating,
} from '@/utils/helpers';
import { t, getCountryFlag, getCountryName } from '@/utils/translations';
import { translateText, getTargetLanguage, decodeForDisplay, onTranslationComplete } from '@/utils/translateText';
import { BackNavButton } from '@/components/BackNavButton';
import { ReportButton } from '@/components/ReportButton';
import { PlayStyle } from '@/types';

const TIME_CONTROLS = ['5+0', '10+0', '15+10', '30+0', '60+30'];

const PLAY_STYLE_META: { key: PlayStyle; labelKey: string; emoji: string }[] = [
  { key: 'casual', labelKey: 'play_style_casual', emoji: '🎲' },
  { key: 'beginner_welcome', labelKey: 'play_style_beginner_welcome', emoji: '🌱' },
  { key: 'competitive', labelKey: 'play_style_competitive', emoji: '⚔️' },
  { key: 'spectator_welcome', labelKey: 'play_style_spectator_welcome', emoji: '👀' },
  { key: 'tournament', labelKey: 'play_style_tournament', emoji: '🏆' },
];

const SKILL_EMOJI: Record<string, string> = {
  beginner: '🌱',
  intermediate: '♟️',
  advanced: '🔥',
  expert: '👑',
};

export default function PlayerDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { players, sendMatchRequest, language, blockUser, unblockUser, isUserBlocked, currentUserId, accessToken, toggleFavorite, favoritePlayerIds, fetchPlayerProfile } = useChess();
  const { userLocation } = useLocation();
  const router = useRouter();
  const [selectedTime, setSelectedTime] = useState('15+10');
  const [showTimeSelector, setShowTimeSelector] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [bioApiState, setBioApiState] = useState<{ loading: boolean; translated: string | null }>({ loading: false, translated: null });
  const [fetchedPlayer, setFetchedPlayer] = useState<import('@/types').Player | null>(null);
  const [fetchingPlayer, setFetchingPlayer] = useState(false);

  const buttonAnim = useRef(new Animated.Value(1)).current;
  const sentAnim = useRef(new Animated.Value(0)).current;

  const playerFromList = useMemo(() => players.find(p => p.id === id), [players, id]);
  // 常に最新取得を優先（キャッシュ干渉を避け、マッチ数を確実に表示）
  const player = fetchedPlayer ?? playerFromList;

  // 常に bypassCache で最新プロフィールを取得（リストにいてもマッチ数が古い可能性があるため）
  useEffect(() => {
    if (!id) {
      setFetchedPlayer(null);
      return;
    }
    let mounted = true;
    setFetchingPlayer(true);
    fetchPlayerProfile(id, { bypassCache: true })
      .then((p) => {
        if (mounted && p) setFetchedPlayer(p);
      })
      .finally(() => { if (mounted) setFetchingPlayer(false); });
    return () => { mounted = false; };
  }, [id, fetchPlayerProfile]);
  const playerBlocked = useMemo(() => (id ? isUserBlocked(id) : false), [id, isUserBlocked]);
  const isFavorite = useMemo(() => (id ? favoritePlayerIds.has(id) : false), [id, favoritePlayerIds]);

  const handleToggleFavorite = useCallback(() => {
    if (!id) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleFavorite(id);
  }, [id, toggleFavorite]);

  const handleSendRequest = useCallback(() => {
    if (!player) return;
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    Animated.sequence([
      Animated.timing(buttonAnim, { toValue: 0.92, duration: 100, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(buttonAnim, { toValue: 1, duration: 100, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
    sendMatchRequest(player, selectedTime);
    setRequestSent(true);
    Animated.timing(sentAnim, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }).start();
    Alert.alert(
      t('request_sent_title', language),
      player.name + t('request_sent_desc', language),
      [{ text: 'OK' }]
    );
  }, [player, selectedTime, sendMatchRequest, buttonAnim, sentAnim, language]);

  const toggleTimeSelector = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    setShowTimeSelector(prev => !prev);
  }, []);

  const selectTime = useCallback((time: string) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    setSelectedTime(time);
    setShowTimeSelector(false);
  }, []);

  const PLAYER_BIO_ITEM_ID = `player-bio-${id}`;
  const playerBioText = player?.bio?.trim() ?? '';

  useEffect(() => {
    const sub = onTranslationComplete((e) => {
      if (e.itemId !== PLAYER_BIO_ITEM_ID) return;
      const text = decodeForDisplay(e.text);
      if (!text?.trim()) return;
      InteractionManager.runAfterInteractions(() => {
        setBioApiState({ loading: false, translated: text });
      });
    });
    return () => sub.remove();
  }, [id]);

  const handleTranslateBio = useCallback(async () => {
    if (!playerBioText || bioApiState.loading) return;
    if (bioApiState.translated != null) {
      setBioApiState({ loading: false, translated: null });
      return;
    }
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    setBioApiState((prev) => ({ ...prev, loading: true }));
    let didSet = false;
    try {
      const targetLang = getTargetLanguage(language);
      const result = await translateText(player.bio!, targetLang, accessToken ?? undefined, { itemId: PLAYER_BIO_ITEM_ID });
      if ('text' in result) {
        const decoded = decodeForDisplay(result.text);
        if (decoded.trim()) {
          setBioApiState({ loading: false, translated: decoded });
          didSet = true;
        }
      } else {
        Alert.alert(t('error', language), t('translation_failed', language));
      }
    } finally {
      if (!didSet) setBioApiState((prev) => ({ ...prev, loading: false }));
    }
  }, [player?.bio, playerBioText, language, bioApiState.loading, bioApiState.translated, accessToken, id]);

  const handleSendMessage = useCallback(() => {
    if (!player || !id || !currentUserId) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const roomId = [currentUserId, id].sort().join('_');
    router.push(('/messages/' + roomId) as any);
  }, [player, id, router, currentUserId]);

  const handleBlockToggle = useCallback(() => {
    if (!id) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (playerBlocked) {
      unblockUser(id);
      Alert.alert(t('unblock_user', language), player ? player.name : '');
    } else {
      Alert.alert(
        t('block_confirm', language),
        t('block_confirm_desc', language),
        [
          { text: t('cancel', language), style: 'cancel' },
          { text: t('block_user', language), style: 'destructive', onPress: () => blockUser(id) },
        ]
      );
    }
  }, [id, playerBlocked, blockUser, unblockUser, language, player]);

  if (!player) {
    return (
      <View style={styles.errorContainer}>
        <Stack.Screen
          options={{
            title: t('error', language),
            headerLeft: () => <BackNavButton onPress={() => router.back()} />,
          }}
        />
        {fetchingPlayer ? (
          <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 24 }} />
        ) : (
          <Text style={styles.errorText}>{t('player_not_found', language)}</Text>
        )}
      </View>
    );
  }

  const bioText = bioApiState.translated ?? player.bio;
  const countryDisplay = player.country
    ? `${getCountryFlag(player.country)} ${getCountryName(player.country, language)}`
    : null;
  const activePlayStyles = (player.playStyles ?? []).map(key =>
    PLAY_STYLE_META.find(p => p.key === key)
  ).filter(Boolean) as typeof PLAY_STYLE_META;

  const stats = [
    { label: 'Chess.com', value: formatRating(player.chessComRating, language), icon: <Trophy size={16} color={colors.gold} /> },
    { label: 'Lichess', value: formatRating(player.lichessRating, language), icon: <Star size={16} color={colors.gold} /> },
    { label: t('matches', language) || 'Matches', value: String(player.gamesPlayed ?? 0), icon: <Swords size={16} color={colors.gold} /> },
  ];

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: player.name,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerLeft: () => <BackNavButton onPress={() => router.back()} />,
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <ReportButton context={player ? `User: ${player.name} (ID: ${id})` : ''} />
              <Pressable onPress={handleToggleFavorite} style={styles.headerBlockBtn}>
                <Star size={20} color={isFavorite ? colors.gold : colors.textMuted} fill={isFavorite ? colors.gold : 'transparent'} />
              </Pressable>
              <Pressable onPress={handleBlockToggle} style={styles.headerBlockBtn}>
                {playerBlocked ? (
                  <ShieldCheck size={20} color={colors.green} />
                ) : (
                  <ShieldBan size={20} color={colors.red} />
                )}
              </Pressable>
            </View>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile-style: Avatar + Name + Meta + Bio */}
        <View style={styles.profileInfo}>
          <View style={styles.avatarContainer}>
            <SafeImage uri={player.avatar} name={player.name} style={styles.avatar} contentFit="cover" />
            {player.isOnline ? <View style={styles.onlineIndicator} /> : null}
          </View>

          <Text style={styles.userName}>{player.name}</Text>

          <View style={styles.metaRow}>
            {(player.location || player.distance !== undefined || countryDisplay) && (
              <View style={styles.metaChip}>
                <MapPin size={13} color={colors.textMuted} />
                <Text style={styles.metaChipText}>
                  {[player.location, formatDistance(player.distance), countryDisplay ?? undefined].filter(Boolean).join(' · ')}
                </Text>
              </View>
            )}
          </View>

          {playerBioText ? (
            <View style={styles.bioTranslateRow}>
              <Pressable
                onPress={handleTranslateBio}
                disabled={bioApiState.loading}
                style={[styles.bioTranslateBtn, bioApiState.translated ? styles.bioTranslateBtnActive : null]}
              >
                <Languages size={13} color={bioApiState.translated ? colors.gold : colors.textMuted} />
                <Text style={[styles.bioTranslateText, bioApiState.translated ? styles.bioTranslateTextActive : null]}>
                  {bioApiState.loading ? t('translating', language) : bioApiState.translated ? t('original', language) : t('translate', language)}
                </Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.bioContainer}>
            <Text style={styles.bioText}>{bioText || t('no_bio', language)}</Text>
            {bioApiState.translated != null && (
              <Text style={[styles.bioText, { fontSize: 11, color: colors.textMuted, marginTop: 4, fontStyle: 'italic' }]}>
                {t('translated_by_ai', language)}
              </Text>
            )}
          </View>
        </View>

        {/* Stats row (same as profile) */}
        <View style={styles.statsRow}>
          {stats.map((item, idx) => (
            <View key={idx} style={styles.statBox}>
              <View style={styles.statIconWrap}>{item.icon}</View>
              <Text style={styles.statValue}>{item.value}</Text>
              <Text style={styles.statLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Skill Level + Time Control (same as profile infoSection) */}
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <View style={styles.infoCard}>
              <Text style={styles.infoCardLabel}>{t('skill_level', language)}</Text>
              <View style={styles.singleChip}>
                <Text style={styles.singleChipEmoji}>{SKILL_EMOJI[player.skillLevel] ?? '♟️'}</Text>
                <Text style={styles.singleChipText}>{getSkillLabel(player.skillLevel, language)}</Text>
              </View>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoCardLabel}>{t('preferred_time_label', language)}</Text>
              <View style={styles.singleChip}>
                <Clock size={14} color={colors.gold} />
                <Text style={styles.singleChipText}>{player.preferredTimeControl || '15+10'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Play Styles (same as profile tagsSection) */}
        {activePlayStyles.length > 0 && (
          <View style={styles.tagsSection}>
            <Text style={styles.tagsSectionTitle}>{t('play_styles', language)}</Text>
            <View style={styles.tagsRow}>
              {activePlayStyles.map(ps => (
                <View key={ps.key} style={styles.tagChip}>
                  <Text style={styles.tagChipEmoji}>{ps.emoji}</Text>
                  <Text style={styles.tagChipText}>{t(ps.labelKey, language)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable onPress={handleSendMessage} style={styles.messageButton}>
          <MessageCircle size={18} color={colors.gold} />
        </Pressable>

        <Pressable onPress={toggleTimeSelector} style={styles.timeSelector}>
          <Clock size={16} color={colors.gold} />
          <Text style={styles.timeSelectorText}>{selectedTime}</Text>
          <ChevronDown size={14} color={colors.textMuted} />
        </Pressable>

        <Animated.View style={{ flex: 1, transform: [{ scale: buttonAnim }] }}>
          <Pressable
            onPress={handleSendRequest}
            style={[styles.sendButton, requestSent ? styles.sendButtonSent : null]}
            disabled={requestSent}
          >
            <Send size={18} color={requestSent ? colors.green : colors.white} />
            <Text style={[styles.sendButtonText, requestSent ? styles.sendButtonTextSent : null]}>
              {requestSent ? t('sent', language) : t('send_request', language)}
            </Text>
          </Pressable>
        </Animated.View>
      </View>

      {showTimeSelector ? (
        <View style={styles.timeSelectorOverlay}>
          <Pressable style={styles.overlayBg} onPress={toggleTimeSelector} />
          <View style={styles.timeSelectorSheet}>
            <Text style={styles.sheetTitle}>{t('select_time', language)}</Text>
            {TIME_CONTROLS.map(tc => (
              <Pressable
                key={tc}
                onPress={() => selectTime(tc)}
                style={[styles.timeOption, selectedTime === tc ? styles.timeOptionActive : null]}
              >
                <Text style={[styles.timeOptionText, selectedTime === tc ? styles.timeOptionTextActive : null]}>
                  {tc}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { paddingBottom: 48 },
    errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    errorText: { fontSize: 16, color: colors.textMuted },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    headerBlockBtn: { padding: 6 },

    /* Profile-unified: top block */
    profileInfo: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 20 },
    avatarContainer: { position: 'relative', marginBottom: 16 },
    avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.surface },
    onlineIndicator: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.green,
      borderWidth: 3,
      borderColor: colors.background,
    },
    userName: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, marginBottom: 12 },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 14,
    },
    metaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    metaChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
    bioTranslateRow: { marginBottom: 8 },
    bioTranslateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    bioTranslateBtnActive: { borderColor: colors.gold + '4D', backgroundColor: colors.goldMuted },
    bioTranslateText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
    bioTranslateTextActive: { color: colors.gold },
    bioContainer: {
      backgroundColor: colors.surface,
      padding: 16,
      borderRadius: 16,
      width: '100%',
    },
    bioText: { fontSize: 14, color: colors.textPrimary, textAlign: 'center', lineHeight: 20 },

    /* Stats (same as profile) */
    statsRow: { flexDirection: 'row', paddingHorizontal: 24, marginTop: 24, gap: 12 },
    statBox: {
      flex: 1,
      backgroundColor: colors.surface,
      paddingVertical: 16,
      borderRadius: 20,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    statIconWrap: { marginBottom: 8 },
    statValue: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
    statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

    /* Skill + Time (same as profile) */
    infoSection: { paddingHorizontal: 24, marginTop: 16 },
    infoRow: { flexDirection: 'row', gap: 12 },
    infoCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    infoCardLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    singleChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    singleChipEmoji: { fontSize: 16 },
    singleChipText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },

    /* Play Styles (same as profile) */
    tagsSection: { paddingHorizontal: 24, marginTop: 20 },
    tagsSectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 10,
    },
    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tagChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    tagChipEmoji: { fontSize: 14 },
    tagChipText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },


    /* Player actions bar */
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 34,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    messageButton: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 48,
      height: 48,
      backgroundColor: colors.goldMuted,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.gold + '33',
    },
    timeSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 14,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    timeSelectorText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    sendButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: colors.gold,
    },
    sendButtonSent: { backgroundColor: colors.greenMuted },
    sendButtonText: { fontSize: 15, fontWeight: '700', color: colors.white },
    sendButtonTextSent: { color: colors.green },
    timeSelectorOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' },
    overlayBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay },
    timeSelectorSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
    sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 16, textAlign: 'center' },
    timeOption: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, marginBottom: 6 },
    timeOptionActive: { backgroundColor: colors.goldMuted },
    timeOptionText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', fontWeight: '500' },
    timeOptionTextActive: { color: colors.gold, fontWeight: '700' },
  });
}
