import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Bell, Clock, Swords, CheckCircle2, XCircle, AlertCircle } from 'lucide-react-native';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { ThemeColors } from '@/constants/colors';
import { AppNotification } from '@/types';
import { t } from '@/utils/translations';

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { notifications, language, markNotificationRead, markAllNotificationsRead } = useChess();
  const router = useRouter();

  const handlePressItem = (item: AppNotification) => {
    if (!item.read) {
      markNotificationRead(item.id);
    }
    if (item.relatedId && item.type === 'match_request') {
      router.push(('/matches' as any));
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('notifications', language),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerRight: () =>
            notifications.length > 0 ? (
              <Pressable onPress={markAllNotificationsRead} style={styles.clearBtn}>
                <Text style={styles.clearText}>{t('done', language)}</Text>
              </Pressable>
            ) : null,
        }}
      />

      {notifications.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <Bell size={32} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>{t('no_notifications', language)}</Text>
          <Text style={styles.emptySubtitle}>{t('timeline', language)}</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handlePressItem(item)}
              style={[styles.item, !item.read && styles.itemUnread]}
            >
              <View style={styles.itemIconWrap}>{renderIcon(item, colors)}</View>
              <View style={styles.itemBody}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemMessage} numberOfLines={2}>
                  {item.message}
                </Text>
                <View style={styles.itemMetaRow}>
                  <Clock size={12} color={colors.textMuted} />
                  <Text style={styles.itemMetaText}>{item.createdAt}</Text>
                </View>
              </View>
              {!item.read && <View style={styles.unreadDot} />}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function renderIcon(item: AppNotification, colors: ThemeColors) {
  switch (item.type) {
    case 'match_request':
      return <Swords size={20} color={colors.gold} />;
    case 'match_accepted':
      return <CheckCircle2 size={20} color={colors.green} />;
    case 'match_declined':
      return <XCircle size={20} color={colors.red} />;
    case 'result_report':
    case 'result_confirmed':
      return <AlertCircle size={20} color={colors.orange} />;
    case 'blocked':
    default:
      return <Bell size={20} color={colors.textSecondary} />;
  }
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    clearBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.surface,
    },
    clearText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    emptyIconWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    emptySubtitle: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
    },
    listContent: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 8,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      gap: 10,
    },
    itemUnread: {
      borderColor: colors.gold,
      backgroundColor: colors.goldMuted,
    },
    itemIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: colors.surfaceHighlight,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    itemBody: {
      flex: 1,
      gap: 4,
    },
    itemTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    itemMessage: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    itemMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 4,
    },
    itemMetaText: {
      fontSize: 11,
      color: colors.textMuted,
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.gold,
      marginLeft: 6,
      marginTop: 4,
    },
  });
}

