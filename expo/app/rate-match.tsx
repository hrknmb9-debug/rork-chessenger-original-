import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { SafeImage } from '@/components/SafeImage';
import * as Haptics from 'expo-haptics';
import { Star, X, Trophy, Minus } from 'lucide-react-native';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { t } from '@/utils/translations';
import { BackNavButton } from '@/components/BackNavButton';

function StarRating({ value, onChange, label, colors }: { value: number; onChange: (v: number) => void; label: string; colors: ThemeColors }) {
  const ratingStyles = useMemo(() => createRatingStyles(colors), [colors]);
  return (
    <View style={ratingStyles.ratingGroup}>
      <Text style={ratingStyles.ratingLabel}>{label}</Text>
      <View style={ratingStyles.starsRow}>
        {[1, 2, 3, 4, 5].map(star => (
          <Pressable
            key={star}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(star);
            }}
            style={ratingStyles.starButton}
          >
            <Star
              size={28}
              color={star <= value ? colors.gold : colors.surfaceHighlight}
              fill={star <= value ? colors.gold : 'transparent'}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function RateMatchScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { matches, rateMatch, language } = useChess();
  const router = useRouter();

  const { edit } = useLocalSearchParams<{ matchId: string; edit?: string }>();
  const isEditing = edit === 'true';
  const match = matches.find(m => m.id === matchId);

  const [sportsmanship, setSportsmanship] = useState<number>(match?.rating?.sportsmanship ?? 0);
  const [skillAccuracy, setSkillAccuracy] = useState<number>(match?.rating?.skillAccuracy ?? 0);
  const [punctuality, setPunctuality] = useState<number>(match?.rating?.punctuality ?? 0);
  const [comment, setComment] = useState<string>(match?.rating?.comment ?? '');

  const handleSubmit = useCallback(() => {
    if (sportsmanship === 0 || skillAccuracy === 0 || punctuality === 0) {
      Alert.alert(t('error', language), t('rating_error', language));
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    rateMatch(matchId ?? '', {
      sportsmanship,
      skillAccuracy,
      punctuality,
      comment,
    });
    const titleKey = isEditing ? 'rating_updated' : 'rating_complete';
    const descKey = isEditing ? 'rating_updated_desc' : 'rating_complete_desc';
    Alert.alert(t(titleKey, language), t(descKey, language), [
      { text: 'OK', onPress: () => router.back() },
    ]);
  }, [matchId, sportsmanship, skillAccuracy, punctuality, comment, rateMatch, router]);

  if (!match) {
    return (
      <View style={styles.errorContainer}>
        <Stack.Screen
          options={{
            title: t('error', language),
            headerLeft: () => <BackNavButton onPress={() => router.back()} />,
          }}
        />
        <Text style={styles.errorText}>{t('match_not_found', language)}</Text>
      </View>
    );
  }

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

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('rate_match_title', language),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          presentation: 'modal',
          headerLeft: () => <BackNavButton onPress={() => router.back()} />,
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.matchInfo}>
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
          <Text style={styles.timeControlText}>{match.timeControl}</Text>
        </View>

        <View style={styles.ratingsSection}>
          <StarRating
            label={t('sportsmanship', language)}
            value={sportsmanship}
            onChange={setSportsmanship}
            colors={colors}
          />
          <StarRating
            label={t('skill_accuracy', language)}
            value={skillAccuracy}
            onChange={setSkillAccuracy}
            colors={colors}
          />
          <StarRating
            label={t('punctuality', language)}
            value={punctuality}
            onChange={setPunctuality}
            colors={colors}
          />
        </View>

        <View style={styles.commentSection}>
          <Text style={styles.commentLabel}>{t('rating_comment', language)}</Text>
          <TextInput
            style={styles.commentInput}
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={3}
            placeholder={t('rating_placeholder', language)}
            placeholderTextColor={colors.textMuted}
            testID="rating-comment"
          />
        </View>

        <Pressable onPress={handleSubmit} style={styles.submitButton} testID="submit-rating">
          <Text style={styles.submitText}>{t('submit_rating', language)}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function createRatingStyles(colors: ThemeColors) {
  return StyleSheet.create({
    ratingGroup: {
      marginBottom: 24,
    },
    ratingLabel: {
      fontSize: 15,
      fontWeight: '600' as const,
      color: colors.textPrimary,
      marginBottom: 10,
    },
    starsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    starButton: {
      padding: 4,
    },
  });
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 24,
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
    matchInfo: {
      alignItems: 'center',
      marginBottom: 36,
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.surfaceLight,
      marginBottom: 12,
      borderWidth: 2,
      borderColor: colors.cardBorder,
    },
    opponentName: {
      fontSize: 22,
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
    timeControlText: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: '500' as const,
    },
    ratingsSection: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      marginBottom: 24,
    },
    commentSection: {
      marginBottom: 32,
    },
    commentLabel: {
      fontSize: 15,
      fontWeight: '600' as const,
      color: colors.textPrimary,
      marginBottom: 10,
    },
    commentInput: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 15,
      color: colors.textPrimary,
      minHeight: 100,
      textAlignVertical: 'top',
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    submitButton: {
      backgroundColor: colors.gold,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
    },
    submitText: {
      fontSize: 17,
      fontWeight: '700' as const,
      color: colors.white,
    },
  });
}
