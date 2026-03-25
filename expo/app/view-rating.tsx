import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { SafeImage } from '@/components/SafeImage';
import { Star, X, Trophy, Minus, ThumbsUp, Target, Clock, Edit3 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { t } from '@/utils/translations';
import { BackNavButton } from '@/components/BackNavButton';

export default function ViewRatingScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { matches, language } = useChess();
  const router = useRouter();

  const match = useMemo(() => matches.find(m => m.id === matchId), [matches, matchId]);

  if (!match || !match.rating) {
    return (
      <View style={styles.errorContainer}>
        <Stack.Screen options={{ title: t('match_ratings', language) }} />
        <Text style={styles.errorText}>{t('no_ratings', language)}</Text>
      </View>
    );
  }

  const avgRating = (
    (match.rating.sportsmanship + match.rating.skillAccuracy + match.rating.punctuality) / 3
  ).toFixed(1);

  const getResultColor = () => {
    switch (match.result) {
      case 'win': return colors.green;
      case 'loss': return colors.red;
      default: return colors.textSecondary;
    }
  };

  const getResultText = () => {
    switch (match.result) {
      case 'win': return t('win', language);
      case 'loss': return t('loss', language);
      default: return t('draw', language);
    }
  };

  const renderStars = (value: number) => (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map(star => (
        <Star
          key={star}
          size={22}
          color={star <= value ? colors.gold : colors.surfaceHighlight}
          fill={star <= value ? colors.gold : 'transparent'}
        />
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('match_ratings', language),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          presentation: 'modal',
          headerLeft: () => <BackNavButton onPress={() => router.back()} />,
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.opponentSection}>
          <SafeImage uri={match.opponent.avatar} name={match.opponent.name} style={styles.avatar} contentFit="cover" />
          <Text style={styles.opponentName}>{match.opponent.name}</Text>
          <View style={styles.resultBadge}>
            {match.result === 'win' && <Trophy size={14} color={colors.green} />}
            {match.result === 'loss' && <X size={14} color={colors.red} />}
            {match.result === 'draw' && <Minus size={14} color={colors.textSecondary} />}
            <Text style={[styles.resultText, { color: getResultColor() }]}>
              {getResultText()}
            </Text>
          </View>
          <Text style={styles.timeControl}>{match.timeControl}</Text>
        </View>

        <View style={styles.avgRatingCard}>
          <Star size={28} color={colors.gold} fill={colors.gold} />
          <Text style={styles.avgRatingValue}>{avgRating}</Text>
          <Text style={styles.avgRatingLabel}>{t('avg_rating', language)}</Text>
        </View>

        <View style={styles.ratingsCard}>
          <View style={styles.ratingItem}>
            <View style={styles.ratingHeader}>
              <ThumbsUp size={18} color={colors.green} />
              <Text style={styles.ratingLabel}>{t('sportsmanship', language)}</Text>
            </View>
            {renderStars(match.rating.sportsmanship)}
            <Text style={styles.ratingScore}>{match.rating.sportsmanship}/5</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.ratingItem}>
            <View style={styles.ratingHeader}>
              <Target size={18} color={colors.blue} />
              <Text style={styles.ratingLabel}>{t('skill_accuracy', language)}</Text>
            </View>
            {renderStars(match.rating.skillAccuracy)}
            <Text style={styles.ratingScore}>{match.rating.skillAccuracy}/5</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.ratingItem}>
            <View style={styles.ratingHeader}>
              <Clock size={18} color={colors.orange} />
              <Text style={styles.ratingLabel}>{t('punctuality', language)}</Text>
            </View>
            {renderStars(match.rating.punctuality)}
            <Text style={styles.ratingScore}>{match.rating.punctuality}/5</Text>
          </View>
        </View>

        {match.rating.comment ? (
          <View style={styles.commentCard}>
            <Text style={styles.commentLabel}>{t('rating_comment', language)}</Text>
            <Text style={styles.commentText}>{match.rating.comment}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/rate-match?matchId=${matchId}&edit=true` as any);
          }}
          style={styles.editButton}
          testID="edit-rating-btn"
        >
          <Edit3 size={18} color={colors.white} />
          <Text style={styles.editButtonText}>{t('edit_rating', language)}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 60,
    },
    headerBtn: {
      padding: 6,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    errorText: {
      fontSize: 16,
      color: colors.textMuted,
    },
    opponentSection: {
      alignItems: 'center',
      marginBottom: 24,
    },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.surfaceLight,
      marginBottom: 12,
      borderWidth: 2,
      borderColor: colors.cardBorder,
    },
    opponentName: {
      fontSize: 20,
      fontWeight: '700' as const,
      color: colors.textPrimary,
      marginBottom: 8,
    },
    resultBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.surface,
      marginBottom: 6,
    },
    resultText: {
      fontSize: 14,
      fontWeight: '600' as const,
    },
    timeControl: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: '500' as const,
    },
    avgRatingCard: {
      alignItems: 'center',
      backgroundColor: colors.goldMuted,
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.gold + '40',
    },
    avgRatingValue: {
      fontSize: 36,
      fontWeight: '800' as const,
      color: colors.gold,
      marginTop: 8,
    },
    avgRatingLabel: {
      fontSize: 13,
      color: colors.goldLight,
      fontWeight: '500' as const,
      marginTop: 4,
    },
    ratingsCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      marginBottom: 16,
    },
    ratingItem: {
      paddingVertical: 12,
    },
    ratingHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    ratingLabel: {
      fontSize: 15,
      fontWeight: '600' as const,
      color: colors.textPrimary,
    },
    starsRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 6,
    },
    ratingScore: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: '500' as const,
    },
    divider: {
      height: 1,
      backgroundColor: colors.divider,
    },
    commentCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
    },
    commentLabel: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.textMuted,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    commentText: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    editButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.gold,
      borderRadius: 14,
      paddingVertical: 16,
      marginTop: 20,
    },
    editButtonText: {
      fontSize: 16,
      fontWeight: '700' as const,
      color: colors.white,
    },
  });
}
