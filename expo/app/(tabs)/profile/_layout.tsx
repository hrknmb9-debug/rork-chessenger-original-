import { Stack } from 'expo-router';
import React from 'react';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { t } from '@/utils/translations';

export default function ProfileLayout() {
  const { colors } = useTheme();
  const { language } = useChess();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: '700' as const },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: t('tab_profile', language) }}
      />
      <Stack.Screen
        name="favorites"
        options={{ title: t('favorites_tab', language) }}
      />
    </Stack>
  );
}
