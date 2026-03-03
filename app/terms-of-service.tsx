import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { FileText } from 'lucide-react-native';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { t } from '@/utils/translations';
import { BackNavButton } from '@/components/BackNavButton';

const SECTIONS = [
  { titleKey: 'terms_section_1_title', contentKey: 'terms_section_1' },
  { titleKey: 'terms_section_2_title', contentKey: 'terms_section_2' },
  { titleKey: 'terms_section_3_title', contentKey: 'terms_section_3' },
  { titleKey: 'terms_section_4_title', contentKey: 'terms_section_4' },
  { titleKey: 'terms_section_5_title', contentKey: 'terms_section_5' },
  { titleKey: 'terms_section_6_title', contentKey: 'terms_section_6' },
  { titleKey: 'terms_section_7_title', contentKey: 'terms_section_7' },
];

export default function TermsOfServiceScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { language } = useChess();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('terms_title', language),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerLeft: () => <BackNavButton onPress={() => router.back()} />,
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroSection}>
          <View style={styles.heroIcon}>
            <FileText size={32} color={colors.textSecondary} />
          </View>
          <Text style={styles.heroTitle}>{t('terms_title', language)}</Text>
          <Text style={styles.lastUpdated}>{t('terms_last_updated', language)}</Text>
        </View>

        <View style={styles.contentCard}>
          {SECTIONS.map((section, index) => (
            <View key={section.titleKey}>
              {index > 0 && <View style={styles.sectionDivider} />}
              <View style={styles.sectionItem}>
                <Text style={styles.sectionTitle}>{t(section.titleKey, language)}</Text>
                <Text style={styles.sectionContent}>{t(section.contentKey, language)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    heroSection: {
      alignItems: 'center',
      paddingVertical: 28,
      gap: 8,
    },
    heroIcon: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: colors.surfaceHighlight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    heroTitle: {
      fontSize: 22,
      fontWeight: '700' as const,
      color: colors.textPrimary,
    },
    lastUpdated: {
      fontSize: 13,
      color: colors.textMuted,
    },
    contentCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      overflow: 'hidden',
    },
    sectionItem: {
      paddingHorizontal: 18,
      paddingVertical: 16,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700' as const,
      color: colors.textPrimary,
      marginBottom: 8,
    },
    sectionContent: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    sectionDivider: {
      height: 1,
      backgroundColor: colors.divider,
      marginHorizontal: 18,
    },
    bottomSpacer: {
      height: 40,
    },
  });
}
