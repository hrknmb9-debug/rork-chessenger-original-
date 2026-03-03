import React, { useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Bell, Clock, Swords, CheckCircle2, XCircle, AlertCircle, MessageCircle } from 'lucide-react-native';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { ThemeColors } from '@/constants/colors';
import { AppNotification } from '@/types';
import { t } from '@/utils/translations';
import { BackNavButton } from '@/components/BackNavButton';

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { notifications, language, markNotificationRead, markAllNotificationsRead } = useChess();
  const router = useRouter();

  useEffect(() => {
    if (notifications.length > 0) {
      markAllNotificationsRead();
    }
  }, []);

  const handlePressItem = (item: AppNotification) => {
    if (!item.read) {
      markNotificationRead(item.id);
    }
    if (item.relatedId) {
      if (item.type === 'match_request') {
        router.push(('/matches' as any));
      } else if (item.type === 'new_message') {
        router.push(('/messages/' + item.relatedId) as any);
      }
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('notifications', language),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerLeft: () => <BackNavButton onPress={() => router.back()} />,
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
                <Text style={styles.itemTitle}>{getNotificationPlayerName(item)}</Text>
                <Text style={styles.itemMessage} numberOfLines={1}>
                  {language === 'ja'
                    ? `${getNotificationPlayerName(item)} から通知が届いています`
                    : `You have a notification from ${getNotificationPlayerName(item)}`
                  }
                </Text>
              </View>
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
    case 'new_message':
      return <MessageCircle size={20} color={colors.blue} />;
    case 'result_report':
    case 'result_confirmed':
      return <AlertCircle size={20} color={colors.orange} />;
    case 'blocked':
    default:
      return <Bell size={20} color={colors.textSecondary} />;
  }
}

function getNotificationPlayerName(item: AppNotification): string {
  if (item.type === 'new_message' && item.message) {
    const idx = item.message.indexOf(':');
    if (idx > 0) {
      return item.message.slice(0, idx);
    }
  }
  if (item.message) return item.message;
  return 'プレイヤー';
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

