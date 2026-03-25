import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { SafeImage } from '@/components/SafeImage';
import * as Haptics from 'expo-haptics';
import { X, Trophy, Minus, ChevronRight } from 'lucide-react-native';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { t } from '@/utils/translations';
import { BackNavButton } from '@/components/BackNavButton';

type ResultOption = 'win' | 'loss' | 'draw';

export default function ReportResultScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { matches, submitResultReport, language } = useChess();
  const router = useRouter();
  const [selectedResult, setSelectedResult] = useState<ResultOption | null>(null);

  const match = useMemo(() => matches.find(m => m.id === matchId), [matches, matchId]);

  const handleSelectResult = useCallback((result: ResultOption) => {
    Haptics.selectionAsync();
    setSelectedResult(result);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!selectedResult || !matchId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    submitResultReport(matchId, selectedResult);
    Alert.alert(
      t('report_submitted', language),
      t('report_wait', language),
      [{ text: 'OK', onPress: () => router.back() }]
    );
  }, [selectedResult, matchId, submitResultReport, language, router]);

  if (!match) {
    return (
      <View style={styles.errorContainer}>
        <Stack.Screen options={{ title: t('report_result_title', language) }} />
        <Text style={styles.errorText}>{t('match_not_found', language)}</Text>
      </View>
    );
  }

  const resultOptions: { key: ResultOption; label: string; icon: React.ReactNode; color: string; bg: string }[] = [
    {
      key: 'win',
      label: t('you_won', language),
      icon: <Trophy size={24} color={colors.green} />,
      color: colors.green,
      bg: colors.greenMuted,
    },
    {
      key: 'loss',
      label: t('you_lost', language),
      icon: <X size={24} color={colors.red} />,
      color: colors.red,
      bg: colors.redMuted,
    },
    {
      key: 'draw',
      label: t('it_was_draw', language),
      icon: <Minus size={24} color={colors.orange} />,
      color: colors.orange,
      bg: colors.orangeMuted,
    },
  ];

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('report_result_title', language),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          presentation: 'modal',
          headerLeft: () => <BackNavButton onPress={() => router.back()} />,
        }}
      />

      <View style={styles.content}>
        <View style={styles.matchInfo}>
          <SafeImage uri={match.opponent.avatar} name={match.opponent.name} style={styles.avatar} contentFit="cover" />
          <Text style={styles.vsText}>vs</Text>
          <Text style={styles.opponentName}>{match.opponent.name}</Text>
          <Text style={styles.timeControl}>{match.timeControl}</Text>
        </View>

        <Text style={styles.sectionTitle}>{t('select_result', language)}</Text>

        <View style={styles.resultOptions}>
          {resultOptions.map(option => (
            <Pressable
              key={option.key}
              onPress={() => handleSelectResult(option.key)}
              style={[
                styles.resultOption,
                selectedResult === option.key && {
                  backgroundColor: option.bg,
                  borderColor: option.color,
                },
              ]}
              testID={`result-${option.key}`}
            >
              {option.icon}
              <Text
                style={[
                  styles.resultOptionText,
                  selectedResult === option.key && { color: option.color },
                ]}
              >
                {option.label}
              </Text>
              {selectedResult === option.key && (
                <View style={[styles.selectedDot, { backgroundColor: option.color }]} />
              )}
            </Pressable>
          ))}
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            {t('report_wait', language)}
          </Text>
        </View>

        <Pressable
          onPress={handleSubmit}
          style={[styles.submitButton, !selectedResult && styles.submitButtonDisabled]}
          disabled={!selectedResult}
          testID="submit-report"
        >
          <Text style={[styles.submitText, !selectedResult && styles.submitTextDisabled]}>
            {t('report_result', language)}
          </Text>
          <ChevronRight size={18} color={selectedResult ? colors.white : colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 24,
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
      marginBottom: 32,
    },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.surfaceLight,
      marginBottom: 8,
      borderWidth: 2,
      borderColor: colors.cardBorder,
    },
    vsText: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: '600' as const,
      marginBottom: 4,
    },
    opponentName: {
      fontSize: 20,
      fontWeight: '700' as const,
      color: colors.textPrimary,
      marginBottom: 4,
    },
    timeControl: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: '500' as const,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 14,
    },
    resultOptions: {
      gap: 10,
      marginBottom: 24,
    },
    resultOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 18,
      borderRadius: 14,
      backgroundColor: colors.card,
      borderWidth: 2,
      borderColor: colors.cardBorder,
    },
    resultOptionText: {
      flex: 1,
      fontSize: 17,
      fontWeight: '600' as const,
      color: colors.textSecondary,
    },
    selectedDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    infoBox: {
      backgroundColor: colors.blueMuted,
      borderRadius: 12,
      padding: 14,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: colors.blue + '33',
    },
    infoText: {
      fontSize: 13,
      color: colors.blue,
      lineHeight: 20,
      textAlign: 'center',
    },
    submitButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.gold,
      borderRadius: 14,
      paddingVertical: 16,
    },
    submitButtonDisabled: {
      backgroundColor: colors.surfaceLight,
    },
    submitText: {
      fontSize: 17,
      fontWeight: '700' as const,
      color: colors.white,
    },
    submitTextDisabled: {
      color: colors.textMuted,
    },
  });
}
