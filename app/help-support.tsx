import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { HelpCircle, ChevronDown, ChevronUp, Mail, MessageCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { t } from '@/utils/translations';
import { BackNavButton } from '@/components/BackNavButton';

interface FAQItem {
  questionKey: string;
  answerKey: string;
}

const FAQ_ITEMS: FAQItem[] = [
  { questionKey: 'faq_1_q', answerKey: 'faq_1_a' },
  { questionKey: 'faq_2_q', answerKey: 'faq_2_a' },
  { questionKey: 'faq_3_q', answerKey: 'faq_3_a' },
  { questionKey: 'faq_4_q', answerKey: 'faq_4_a' },
  { questionKey: 'faq_5_q', answerKey: 'faq_5_a' },
];

function FAQSection({ item, language, colors, styles }: {
  item: FAQItem;
  language: string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const [expanded, setExpanded] = useState<boolean>(false);

  const toggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded(prev => !prev);
  }, []);

  return (
    <Pressable onPress={toggle} style={styles.faqItem}>
      <View style={styles.faqHeader}>
        <Text style={styles.faqQuestion}>{t(item.questionKey, language)}</Text>
        {expanded ? (
          <ChevronUp size={18} color={colors.textMuted} />
        ) : (
          <ChevronDown size={18} color={colors.textMuted} />
        )}
      </View>
      {expanded && (
        <Text style={styles.faqAnswer}>{t(item.answerKey, language)}</Text>
      )}
    </Pressable>
  );
}

export default function HelpSupportScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { language } = useChess();
  const router = useRouter();

  const handleEmailPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const email = t('support_email_address', language);
    if (Platform.OS === 'web') {
      window.open(`mailto:${email}`, '_blank');
    } else {
      Linking.openURL(`mailto:${email}`);
    }
  }, [language]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('help_support_title', language),
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
            <MessageCircle size={36} color={colors.gold} />
          </View>
          <Text style={styles.heroTitle}>{t('help_support_title', language)}</Text>
          <Text style={styles.heroDescription}>{t('support_description', language)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('faq', language)}</Text>
          <View style={styles.faqCard}>
            {FAQ_ITEMS.map((item, index) => (
              <View key={item.questionKey}>
                {index > 0 && <View style={styles.faqDivider} />}
                <FAQSection
                  item={item}
                  language={language}
                  colors={colors}
                  styles={styles}
                />
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('contact_support', language)}</Text>
          <Pressable onPress={handleEmailPress} style={styles.contactCard}>
            <View style={[styles.contactIcon, { backgroundColor: colors.blueMuted }]}>
              <Mail size={22} color={colors.blue} />
            </View>
            <View style={styles.contactContent}>
              <Text style={styles.contactLabel}>{t('contact_email', language)}</Text>
              <Text style={styles.contactValue}>{t('support_email_address', language)}</Text>
            </View>
          </Pressable>
          <Text style={[styles.reportNote, { color: colors.textMuted }]}>{t('report_email_note', language)}</Text>
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
      gap: 10,
    },
    heroIcon: {
      width: 72,
      height: 72,
      borderRadius: 22,
      backgroundColor: colors.goldMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    heroTitle: {
      fontSize: 22,
      fontWeight: '700' as const,
      color: colors.textPrimary,
    },
    heroDescription: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 21,
      paddingHorizontal: 20,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700' as const,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 10,
      marginLeft: 4,
    },
    faqCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      overflow: 'hidden',
    },
    faqItem: {
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    faqHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    faqQuestion: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600' as const,
      color: colors.textPrimary,
      lineHeight: 22,
    },
    faqAnswer: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 22,
      marginTop: 10,
    },
    faqDivider: {
      height: 1,
      backgroundColor: colors.divider,
      marginLeft: 16,
    },
    contactCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      padding: 16,
      gap: 14,
    },
    contactIcon: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contactContent: {
      flex: 1,
      gap: 3,
    },
    contactLabel: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: '500' as const,
    },
    contactValue: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: colors.blue,
    },
    reportNote: {
      fontSize: 13,
      lineHeight: 20,
      marginTop: 12,
      marginHorizontal: 4,
    },
    bottomSpacer: {
      height: 40,
    },
  });
}
