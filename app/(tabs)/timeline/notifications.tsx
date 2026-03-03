import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { AppNotification } from '@/types';
import { getTimeAgo } from '@/utils/translations';

const TIMELINE_NOTIFICATION_TYPES = ['post_like', 'post_reply', 'event_join', 'event_full', 'event_deadline_passed'] as const;

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const { notifications, markAllNotificationsRead, language } = useChess();
  const filteredNotifications = notifications.filter(n =>
    TIMELINE_NOTIFICATION_TYPES.includes(n.type as typeof TIMELINE_NOTIFICATION_TYPES[number])
  );

  useFocusEffect(
    useCallback(() => {
      markAllNotificationsRead();
    }, [markAllNotificationsRead])
  );

  const renderItem = useCallback(
    ({ item }: { item: AppNotification }) => (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Text style={[styles.message, { color: colors.textPrimary }]} numberOfLines={2}>
          {item.message}
        </Text>
        <Text style={[styles.time, { color: colors.textMuted }]}>
          {getTimeAgo(item.createdAt, language)}
        </Text>
      </View>
    ),
    [colors, language]
  );

  const keyExtractor = useCallback((item: AppNotification) => item.id, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {filteredNotifications.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>通知はありません</Text>
        </View>
      ) : (
        <FlatList
          data={filteredNotifications}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
  },
  time: {
    fontSize: 12,
    marginTop: 8,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
  },
});
