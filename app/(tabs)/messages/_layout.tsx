import { Stack } from 'expo-router';
import React from 'react';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { t } from '@/utils/translations';

export default function MessagesLayout() {
  const { colors } = useTheme();
  const { language } = useChess();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: '700' as const },
        contentStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: t('tab_messages', language) }}
      />
      <Stack.Screen
        name="[id]"
        options={{ headerShown: true }}
      />
    </Stack>
  );
}
