import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Platform, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';

type BackNavButtonProps = {
  onPress: () => void;
  /** true = floating style (e.g. over map) with stronger glass; false = inline in header */
  floating?: boolean;
};

export function BackNavButton({ onPress, floating = false }: BackNavButtonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, floating), [colors, floating]);

  const handlePress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const content = (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.touchable,
        pressed && styles.touchablePressed,
      ]}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel="戻る"
    >
      <ArrowLeft size={24} color={colors.textPrimary} strokeWidth={2.5} />
    </Pressable>
  );

  if (floating) {
    const glassStyle = [styles.glass, colors.background === '#0B140E' ? styles.glassDark : styles.glassLight];
    return (
      <View style={styles.wrapper}>
        {Platform.OS === 'web' ? (
          <View style={[styles.glass, styles.glassWeb]}>{content}</View>
        ) : (
          <BlurView intensity={80} tint={colors.background === '#0B140E' ? 'dark' : 'light'} style={glassStyle}>
            {content}
          </BlurView>
        )}
      </View>
    );
  }

  const inlineGlass = [styles.glassInline, colors.background === '#0B140E' ? styles.glassInlineDark : styles.glassInlineLight];
  return (
    <View style={styles.inlineWrapper}>
      {Platform.OS === 'web' ? (
        <View style={[styles.glassInline, styles.glassInlineWeb]}>{content}</View>
      ) : (
        <BlurView intensity={56} tint={colors.background === '#0B140E' ? 'dark' : 'light'} style={inlineGlass}>
          {content}
        </BlurView>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors, floating: boolean) {
  const isDark = colors.background === '#0B140E';
  const borderColor = isDark ? 'rgba(34, 56, 42, 0.9)' : 'rgba(212, 226, 212, 0.9)';
  const webBg = isDark ? 'rgba(28, 46, 34, 0.92)' : 'rgba(255, 255, 255, 0.88)';
  const webBgInline = isDark ? 'rgba(28, 46, 34, 0.85)' : 'rgba(255, 255, 255, 0.82)';

  return StyleSheet.create({
    wrapper: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 56 : 48,
      left: 16,
      zIndex: 100,
      borderRadius: 16,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 6,
    },
    glass: {
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor,
    },
    glassLight: {
      borderColor: 'rgba(212, 226, 212, 0.6)',
    },
    glassDark: {
      borderColor: 'rgba(34, 56, 42, 0.7)',
    },
    glassWeb: {
      backgroundColor: webBg,
    },
    touchable: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    touchablePressed: {
      opacity: 0.78,
    },
    inlineWrapper: {
      marginLeft: 8,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 3,
    },
    glassInline: {
      borderRadius: 14,
      overflow: 'hidden',
    },
    glassInlineLight: {
      borderColor: 'rgba(212, 226, 212, 0.5)',
    },
    glassInlineDark: {
      borderColor: 'rgba(34, 56, 42, 0.6)',
    },
    glassInlineWeb: {
      backgroundColor: webBgInline,
    },
  });
}
