import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  Platform,
  Alert,
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
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { useLocation } from '@/providers/LocationProvider';
import { StatBox } from '@/components/StatBox';
import {
  getSkillLabel,
  getSkillColor,
  getSkillBgColor,
  getWinRate,
  formatDistance,
  formatRating,
} from '@/utils/helpers';
import { t, getLanguageFlag, getLanguageName } from '@/utils/translations';
import { LanguageSelector } from '@/components/LanguageSelector';

const TIME_CONTROLS = ['5+0', '10+0', '15+10', '30+0', '60+30'];

export default function PlayerDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { players, sendMatchRequest, language, blockUser, unblockUser, isUserBlocked, currentUserId } = useChess();
  const { userLocation } = useLocation();
  const router = useRouter();
  const [selectedTime, setSelectedTime] = useState('15+10');
  const [showTimeSelector, setShowTimeSelector] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [showTranslatedBio, setShowTranslatedBio] = useState(false);

  const buttonAnim = useRef(new Animated.Value(1)).current;
  const sentAnim = useRef(new Animated.Value(0)).current;

  const player = useMemo(() => players.find(p => p.id === id), [players, id]);
  const winRate = useMemo(() => (player ? getWinRate(player.wins, player.gamesPlayed) : 0), [player]);
  const playerBlocked = useMemo(() => (id ? isUserBlocked(id) : false), [id, isUserBlocked]);

  const handleSendRequest = useCallback(() => {
    if (!player) return;
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    Animated.sequence([
      Animated.timing(buttonAnim, { toValue: 0.92, duration: 100, useNativeDriver: true }),
      Animated.timing(buttonAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    sendMatchRequest(player, selectedTime);
    setRequestSent(true);
    Animated.timing(sentAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
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

  const handleToggleBioTranslation = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    setShowTranslatedBio(prev => !prev);
  }, []);

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
        <Stack.Screen options={{ title: t('error', language) }} />
        <Text style={styles.errorText}>{t('player_not_found', language)}</Text>
      </View>
    );
  }

  const skillColor = getSkillColor(player.skillLevel, colors);
  const skillBg = getSkillBgColor(player.skillLevel, colors);
  const bioText = showTranslatedBio && player.bioEn ? player.bioEn : player.bio;
  const locationText = player.location + ' ' + formatDistance(player.distance);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: player.name,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerRight: () => (
            <View style={styles.headerRight}>
              <Pressable onPress={handleBlockToggle} style={styles.headerBlockBtn}>
                {playerBlocked ? (
                  <ShieldCheck size={20} color={colors.green} />
                ) : (
                  <ShieldBan size={20} color={colors.red} />
                )}
              </Pressable>
              <LanguageSelector variant="compact" />
            </View>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.avatarWrapper}>
            <SafeImage uri={player.avatar} name={player.name} style={styles.avatar} contentFit="cover" />
            {player.isOnline ? <View style={styles.onlineIndicator} /> : null}
          </View>

          <Text style={styles.name}>{player.name}</Text>

          <View style={styles.ratingRow}>
            <View style={styles.platformRatings}>
              <View style={styles.platformRatingItem}>
                <Text style={styles.platformLabel}>Chess.com</Text>
                <Text style={[styles.ratingValue, player.chessComRating === null ? styles.noExpText : null]}>
                  {formatRating(player.chessComRating, language)}
                </Text>
              </View>
              <View style={styles.ratingDivider} />
              <View style={styles.platformRatingItem}>
                <Text style={styles.platformLabel}>Lichess</Text>
                <Text style={[styles.ratingValue, player.lichessRating === null ? styles.noExpText : null]}>
                  {formatRating(player.lichessRating, language)}
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.skillBadge, { backgroundColor: skillBg }]}>
            <Text style={[styles.skillText, { color: skillColor }]}>
              {getSkillLabel(player.skillLevel, language)}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              {userLocation ? (
                <Navigation size={14} color={colors.blue} />
              ) : (
                <MapPin size={14} color={colors.textMuted} />
              )}
              <Text style={[styles.metaText, userLocation ? styles.metaTextHighlight : null]}>
                {locationText}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Clock size={14} color={colors.textMuted} />
              <Text style={styles.metaText}>{player.lastActive}</Text>
            </View>
          </View>

          {player.languages.length > 0 ? (
            <View style={styles.languagesRow}>
              <Globe size={13} color={colors.textMuted} />
              {player.languages.map(lang => (
                <View key={lang} style={styles.langTag}>
                  <Text style={styles.langTagFlag}>{getLanguageFlag(lang)}</Text>
                  <Text style={styles.langTagText}>{getLanguageName(lang)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>{t('bio', language)}</Text>
            {player.bioEn ? (
              <Pressable
                onPress={handleToggleBioTranslation}
                style={[styles.bioTranslateBtn, showTranslatedBio ? styles.bioTranslateBtnActive : null]}
              >
                <Languages size={13} color={showTranslatedBio ? colors.gold : colors.textMuted} />
                <Text style={[styles.bioTranslateText, showTranslatedBio ? styles.bioTranslateTextActive : null]}>
                  {showTranslatedBio ? t('original', language) : t('translate', language)}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.bioCard}>
            <Text style={styles.bioText}>{bioText}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('stats', language)}</Text>
          <View style={styles.statsGrid}>
            <StatBox label={t('games', language)} value={player.gamesPlayed} />
            <StatBox label={t('wins', language)} value={player.wins} color={colors.green} />
            <StatBox label={t('losses', language)} value={player.losses} color={colors.red} />
            <StatBox label={t('draws', language)} value={player.draws} />
          </View>
          <View style={styles.winRateRow}>
            <View style={styles.winRateInfo}>
              <Trophy size={16} color={colors.gold} />
              <Text style={styles.winRateLabel}>{t('win_rate', language)}</Text>
            </View>
            <View style={styles.winRateBarBg}>
              <View style={[styles.winRateBarFill, { width: (winRate + '%') as any }]} />
            </View>
            <Text style={styles.winRatePercent}>{winRate + '%'}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('preferred_time', language)}</Text>
          <View style={styles.preferredTime}>
            <Zap size={16} color={colors.gold} />
            <Text style={styles.preferredTimeText}>{player.preferredTimeControl}</Text>
          </View>
        </View>

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
    scrollContent: { paddingBottom: 20 },
    errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    errorText: { fontSize: 16, color: colors.textMuted },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    headerBlockBtn: { padding: 6 },
    headerTranslateBtn: { padding: 6 },
    hero: { alignItems: 'center', paddingTop: 20, paddingBottom: 24, paddingHorizontal: 24 },
    avatarWrapper: { position: 'relative', marginBottom: 16 },
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
    name: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, marginBottom: 8 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    platformRatings: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, gap: 16, borderWidth: 1, borderColor: colors.cardBorder },
    platformRatingItem: { alignItems: 'center' },
    platformLabel: { fontSize: 10, fontWeight: '600', color: colors.textMuted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
    ratingValue: { fontSize: 20, fontWeight: '800', color: colors.gold },
    noExpText: { fontSize: 14, fontWeight: '600', color: colors.orange },
    ratingDivider: { width: 1, height: 28, backgroundColor: colors.divider },
    skillBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 14 },
    skillText: { fontSize: 12, fontWeight: '600' },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 14,
    },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: 13, color: colors.textMuted },
    metaTextHighlight: { color: colors.blue, fontWeight: '500' },
    languagesRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    langTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    langTagFlag: { fontSize: 12 },
    langTagText: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
    section: { marginHorizontal: 16, marginBottom: 20 },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    bioTranslateBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder },
    bioTranslateBtnActive: { borderColor: colors.gold + '4D', backgroundColor: colors.goldMuted },
    bioTranslateText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
    bioTranslateTextActive: { color: colors.gold },
    bioCard: { backgroundColor: colors.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.cardBorder },
    bioText: { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
    statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    winRateRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 10 },
    winRateInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    winRateLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
    winRateBarBg: { flex: 1, height: 6, backgroundColor: colors.surfaceHighlight, borderRadius: 3, overflow: 'hidden' },
    winRateBarFill: { height: '100%', backgroundColor: colors.gold, borderRadius: 3 },
    winRatePercent: { fontSize: 15, fontWeight: '700', color: colors.gold, minWidth: 40, textAlign: 'right' },
    preferredTime: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 12, padding: 14 },
    preferredTimeText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 34, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.divider },
    messageButton: { alignItems: 'center', justifyContent: 'center', width: 48, height: 48, backgroundColor: colors.goldMuted, borderRadius: 12, borderWidth: 1, borderColor: colors.gold + '33' },
    timeSelector: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 14, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder },
    timeSelectorText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    sendButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.gold },
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
