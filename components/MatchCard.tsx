import React, { useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Platform } from 'react-native';
import { SafeImage } from '@/components/SafeImage';
import { MapPin, Clock, Check, X, Trophy, Minus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';
import { Match } from '@/types';
import { Language, t } from '@/utils/translations';
import { formatRating } from '@/utils/helpers';

interface MatchCardProps {
  match: Match;
  onAccept?: (matchId: string) => void;
  onDecline?: (matchId: string) => void;
  onPress?: (match: Match) => void;
  language?: Language;
}

function MatchCardComponent({ match, onAccept, onDecline, onPress, language = 'ja' }: MatchCardProps) {
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
    onPress?.(match);
  }, [onPress, match]);

  const handleAccept = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onAccept?.(match.id);
  }, [onAccept, match.id]);

  const handleDecline = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onDecline?.(match.id);
  }, [onDecline, match.id]);

  const getResultColor = () => {
    switch (match.result) {
      case 'win': return colors.green;
      case 'loss': return colors.red;
      case 'draw': return colors.textSecondary;
      default: return colors.textMuted;
    }
  };

  const getResultIcon = () => {
    switch (match.result) {
      case 'win': return <Trophy size={14} color={colors.green} />;
      case 'loss': return <X size={14} color={colors.red} />;
      case 'draw': return <Minus size={14} color={colors.textSecondary} />;
      default: return null;
    }
  };

  const getResultText = () => {
    switch (match.result) {
      case 'win': return t('win', language);
      case 'loss': return t('loss', language);
      case 'draw': return t('draw', language);
      default: return '';
    }
  };

  const getStatusBadge = () => {
    if (match.status === 'accepted') {
      return (
        <View style={[styles.statusBadge, { backgroundColor: colors.greenMuted }]}>
          <Text style={[styles.statusText, { color: colors.green }]}>{t('confirmed', language)}</Text>
        </View>
      );
    }
    if (match.status === 'pending') {
      return (
        <View style={[styles.statusBadge, { backgroundColor: colors.orangeMuted }]}>
          <Text style={[styles.statusText, { color: colors.orange }]}>
            {match.isIncoming ? t('incoming', language) : t('sending', language)}
          </Text>
        </View>
      );
    }
    return null;
  };

  return (
    <Animated.View style={[styles.container, { transform: [{ scale: scaleAnim }] }]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.pressable}
        testID={`match-card-${match.id}`}
      >
        <View style={styles.header}>
          <SafeImage uri={match.opponent.avatar} name={match.opponent.name} style={styles.avatar} contentFit="cover" />
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{match.opponent.name}</Text>
              {getStatusBadge()}
            </View>
            <Text style={styles.rating}>
              {match.opponent.chessComRating !== null ? `C:${match.opponent.chessComRating}` : ''}
              {match.opponent.chessComRating !== null && match.opponent.lichessRating !== null ? ' ' : ''}
              {match.opponent.lichessRating !== null ? `L:${match.opponent.lichessRating}` : ''}
              {match.opponent.chessComRating === null && match.opponent.lichessRating === null ? formatRating(null, language) : ''}
            </Text>
          </View>
        </View>

        <View style={styles.details}>
          <View style={styles.detailItem}>
            <Clock size={13} color={colors.textMuted} />
            <Text style={styles.detailText}>{match.timeControl}</Text>
          </View>
          {match.location && (
            <View style={styles.detailItem}>
              <MapPin size={13} color={colors.textMuted} />
              <Text style={styles.detailText} numberOfLines={1}>{match.location}</Text>
            </View>
          )}
        </View>

        {match.status === 'completed' && match.result && (
          <View style={styles.resultRow}>
            {getResultIcon()}
            <Text style={[styles.resultText, { color: getResultColor() }]}>
              {getResultText()}
            </Text>
          </View>
        )}

        {match.status === 'pending' && match.isIncoming && (
          <View style={styles.actions}>
            <Pressable
              onPress={handleDecline}
              style={[styles.actionBtn, styles.declineBtn]}
              testID={`decline-${match.id}`}
            >
              <X size={18} color={colors.red} />
              <Text style={styles.declineText}>{t('decline', language)}</Text>
            </Pressable>
            <Pressable
              onPress={handleAccept}
              style={[styles.actionBtn, styles.acceptBtn]}
              testID={`accept-${match.id}`}
            >
              <Check size={18} color={colors.white} />
              <Text style={styles.acceptText}>{t('accept', language)}</Text>
            </Pressable>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

export const MatchCard = React.memo(MatchCardComponent);

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
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surfaceLight,
    },
    info: {
      flex: 1,
      marginLeft: 12,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 2,
    },
    name: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: colors.textPrimary,
      flex: 1,
      marginRight: 8,
    },
    rating: {
      fontSize: 14,
      fontWeight: '700' as const,
      color: colors.gold,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '600' as const,
    },
    details: {
      flexDirection: 'row',
      gap: 16,
      marginBottom: 4,
    },
    detailItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    detailText: {
      fontSize: 12,
      color: colors.textMuted,
    },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 8,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    resultText: {
      fontSize: 13,
      fontWeight: '600' as const,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
    },
    declineBtn: {
      backgroundColor: colors.redMuted,
    },
    acceptBtn: {
      backgroundColor: colors.gold,
    },
    declineText: {
      fontSize: 14,
      fontWeight: '600' as const,
      color: colors.red,
    },
    acceptText: {
      fontSize: 14,
      fontWeight: '600' as const,
      color: colors.white,
    },
  });
}
