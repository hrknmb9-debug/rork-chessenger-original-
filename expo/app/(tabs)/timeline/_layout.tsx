import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { BackNavButton } from '@/components/BackNavButton';
import { t } from '@/utils/translations';

function BellHeaderButton() {
  const { colors } = useTheme();
  const { unreadTimelineNotificationCount } = useChess();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push('/timeline/notifications')}
      style={{ marginRight: 12, padding: 6, position: 'relative' }}
    >
      <Bell size={22} color={colors.textPrimary} />
      {unreadTimelineNotificationCount > 0 && (
        <View
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            backgroundColor: colors.red,
            borderRadius: 8,
            minWidth: 16,
            height: 16,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 4,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>
            {unreadTimelineNotificationCount > 99 ? '99+' : unreadTimelineNotificationCount}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export default function TimelineLayout() {
  const { colors } = useTheme();
  const { language } = useChess();
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerBackTitle: ' ',
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: t('tab_timeline', language),
          headerRight: () => <BellHeaderButton />,
        }}
      />
      <Stack.Screen
        name="notifications"
        options={{
          title: t('notifications', language),
          headerBackTitle: ' ',
          headerLeft: () => <BackNavButton onPress={() => router.back()} />,
        }}
      />
    </Stack>
  );
}
