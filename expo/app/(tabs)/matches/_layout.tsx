import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { BackNavButton } from '@/components/BackNavButton';
import { t } from '@/utils/translations';

export default function MatchesLayout() {
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
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="notifications"
        options={{
          title: t('matches', language),
          headerLeft: () => <BackNavButton onPress={() => router.back()} />,
        }}
      />
    </Stack>
  );
}
