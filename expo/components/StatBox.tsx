import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/providers/ThemeProvider';
import { ThemeColors } from '@/constants/colors';

interface StatBoxProps {
  label: string;
  value: string | number;
  color?: string;
}

function StatBoxComponent({ label, value, color }: StatBoxProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={[styles.value, color ? { color } : undefined]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

export const StatBox = React.memo(StatBoxComponent);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 14,
      backgroundColor: colors.surface,
      borderRadius: 12,
    },
    value: {
      fontSize: 20,
      fontWeight: '700' as const,
      color: colors.textPrimary,
      marginBottom: 2,
    },
    label: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: '500' as const,
    },
  });
}
