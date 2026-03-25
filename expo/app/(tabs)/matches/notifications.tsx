import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useChess } from '@/providers/ChessProvider';
import { MatchCard } from '@/components/MatchCard';
import { t } from '@/utils/translations';
import { Match } from '@/types';

function getRoomId(a: string, b: string): string {
  return [a, b].sort().join('_');
}

export default function MatchNotificationsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { pendingIncoming, activeMatches, respondToMatch, language } = useChess();
  const router = useRouter();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const handleMessage = useCallback(
    (match: Match) => {
      if (!user?.id) return;
      const roomId = getRoomId(user.id, match.opponent.id);
      router.push(`/messages/${roomId}` as any);
    },
    [user?.id, router]
  );

  const handleAccept = useCallback(
    (matchId: string, match: Match) => {
      respondToMatch(matchId, true);
      Alert.alert(
        t('message_send_prompt', language),
        '',
        [
          { text: t('cancel', language), style: 'cancel' },
          {
            text: t('message_send_action', language),
            onPress: () => handleMessage(match),
          },
        ]
      );
    },
    [respondToMatch, handleMessage, language]
  );

  const handleDecline = useCallback((matchId: string) => {
    respondToMatch(matchId, false);
  }, [respondToMatch]);

  const hasIncoming = pendingIncoming.length > 0;
  const hasAccepted = activeMatches.length > 0;
  const isEmpty = !hasIncoming && !hasAccepted;

  return (
    <View style={styles.container}>
      {isEmpty ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>♔</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            {t('incoming_requests', language)}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
            {t('no_active', language)}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
        >
          {hasIncoming && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                {t('incoming_requests', language)}
              </Text>
              {pendingIncoming.map((item) => (
                <View key={item.id} style={styles.cardWrap}>
                  <MatchCard
                    match={item}
                    onAccept={(id) => handleAccept(id, item)}
                    onDecline={handleDecline}
                    language={language}
                  />
                </View>
              ))}
            </>
          )}
          {hasAccepted && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
                {t('confirmed_matches', language)}
              </Text>
              {activeMatches.map((item) => (
                <View key={item.id} style={styles.cardWrap}>
                  <MatchCard
                    match={item}
                    onMessagePress={handleMessage}
                    language={language}
                  />
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(colors: { cardBorder: string; background: string; textPrimary: string; textMuted: string; accent: string }) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    list: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 24,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 10,
      marginTop: 4,
    },
    cardWrap: {
      marginBottom: 16,
    },
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 40,
    },
    emptyIcon: {
      fontSize: 48,
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 8,
      textAlign: 'center',
    },
    emptySubtitle: {
      fontSize: 14,
      textAlign: 'center',
    },
  });
}
