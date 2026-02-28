import React, { useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Platform } from 'react-native';
import { Image } from 'expo-image';
import { MapPin, Clock, Zap, Globe } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { Player, PlayStyle } from '@/types';
import { getSkillLabel, getSkillColor, getSkillBgColor, formatDistance, formatRating } from '@/utils/helpers';
import { Language, t, getLanguageFlag } from '@/utils/translations';

interface PlayerCardProps {
  player: Player;
  onPress: (player: Player) => void;
  language?: Language;
}

function PlayerCardComponent({ player, onPress, language = 'ja' }: PlayerCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scaleAnim]);

  const handlePress = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress(player);
  }, [onPress, player]);

  const skillColor = getSkillColor(player.skillLevel, colors);
  const skillBg = getSkillBgColor(player.skillLevel, colors);
  const bioText = language === 'en' && player.bioEn ? player.bioEn : player.bio;

  return (
    <Animated.View style={[styles.container, { transform: [{ scale: scaleAnim }] }]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.pressable}
        testID={`player-card-${player.id}`}
      >
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            <Image
              source={{ uri: player.avatar || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(player.name) + '&size=104&background=random&color=fff&bold=true') }}
              style={styles.avatar}
              contentFit="cover"
            />
            {player.isOnline && <View style={styles.onlineIndicator} />}
          </View>
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{player.name}</Text>
              {player.languages.length > 1 && (
                <View style={styles.langBadge}>
                  <Globe size={10} color={colors.blue} />
                  <Text style={styles.langCount}>{player.languages.length}</Text>
                </View>
              )}
            </View>
            <View style={styles.ratingRow}>
              {player.chessComRating !== null && (
                <View style={styles.platformRating}>
                  <Text style={styles.platformLabel}>C</Text>
                  <Text style={styles.rating}>{player.chessComRating}</Text>
                </View>
              )}
              {player.lichessRating !== null && (
                <View style={styles.platformRating}>
                  <Text style={styles.platformLabel}>L</Text>
                  <Text style={styles.rating}>{player.lichessRating}</Text>
                </View>
              )}
              {player.chessComRating === null && player.lichessRating === null && (
                <Text style={styles.noExperience}>{formatRating(null, language)}</Text>
              )}
              <View style={[styles.skillBadge, { backgroundColor: skillBg }]}>
                <Text style={[styles.skillText, { color: skillColor }]}>
                  {getSkillLabel(player.skillLevel, language)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.bio} numberOfLines={2}>{bioText}</Text>

        {player.playStyles && player.playStyles.length > 0 && (
          <View style={styles.playStylesRow}>
            {player.playStyles.slice(0, 3).map(ps => (
              <View key={ps} style={styles.playStyleTag}>
                <Text style={styles.playStyleText}>{getPlayStyleLabel(ps, language)}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer}>
          <View style={styles.footerItem}>
            <MapPin size={13} color={colors.blue} />
            <Text style={styles.footerTextDistance}>{formatDistance(player.distance)}</Text>
          </View>
          <View style={styles.footerItem}>
            <Clock size={13} color={colors.textMuted} />
            <Text style={styles.footerText}>{player.preferredTimeControl}</Text>
          </View>
          <View style={styles.footerItem}>
            <Zap size={13} color={colors.textMuted} />
            <Text style={styles.footerText}>{player.gamesPlayed}{t('games_count', language)}</Text>
          </View>
          <View style={styles.langRow}>
            {player.languages.map(lang => (
              <Text key={lang} style={styles.langFlag}>{getLanguageFlag(lang)}</Text>
            ))}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function getPlayStyleLabel(ps: PlayStyle, lang: string): string {
  const labels: Record<PlayStyle, Record<string, string>> = {
    casual: { ja: '\u{1F3B2} \u3086\u308B\u304F', en: '\u{1F3B2} Casual' },
    beginner_welcome: { ja: '\u{1F331} \u521D\u5FC3\u8005\u6B53\u8FCE', en: '\u{1F331} Beginners' },
    competitive: { ja: '\u2694\uFE0F \u30AC\u30C1', en: '\u2694\uFE0F Competitive' },
    spectator_welcome: { ja: '\u{1F440} \u89B3\u6226OK', en: '\u{1F440} Spectators' },
    tournament: { ja: '\u{1F3C6} \u5927\u4F1A', en: '\u{1F3C6} Tournament' },
  };
  return labels[ps]?.[lang] ?? labels[ps]?.['en'] ?? ps;
}

export const PlayerCard = React.memo(PlayerCardComponent);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      marginHorizontal: 16,
      marginBottom: 12,
    },
    pressable: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    avatarContainer: {
      position: 'relative',
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.surfaceLight,
    },
    onlineIndicator: {
      position: 'absolute',
      bottom: 1,
      right: 1,
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: colors.green,
      borderWidth: 2.5,
      borderColor: colors.card,
    },
    info: {
      flex: 1,
      marginLeft: 12,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    name: {
      fontSize: 17,
      fontWeight: '600' as const,
      color: colors.textPrimary,
      flex: 1,
    },
    langBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: colors.blueMuted,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    langCount: {
      fontSize: 10,
      fontWeight: '700' as const,
      color: colors.blue,
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    rating: {
      fontSize: 15,
      fontWeight: '700' as const,
      color: colors.gold,
    },
    skillBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    skillText: {
      fontSize: 11,
      fontWeight: '600' as const,
    },
    platformRating: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 3,
    },
    platformLabel: {
      fontSize: 10,
      fontWeight: '700' as const,
      color: colors.textMuted,
    },
    noExperience: {
      fontSize: 13,
      fontWeight: '500' as const,
      color: colors.orange,
    },
    bio: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
      marginBottom: 12,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    footerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    footerText: {
      fontSize: 12,
      color: colors.textMuted,
    },
    footerTextDistance: {
      fontSize: 12,
      color: colors.blue,
      fontWeight: '600' as const,
    },
    langRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      marginLeft: 'auto',
    },
    langFlag: {
      fontSize: 12,
    },
    playStylesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 10,
    },
    playStyleTag: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: colors.goldMuted,
    },
    playStyleText: {
      fontSize: 10,
      fontWeight: '600' as const,
      color: colors.gold,
    },
  });
}
