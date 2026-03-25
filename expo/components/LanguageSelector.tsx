import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { Globe, Check, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { SUPPORTED_LANGUAGES, type LanguageInfo } from '@/utils/translations';
import { t } from '@/utils/translations';

type LanguageSelectorProps = {
  /** Compact = icon-only button for header; full = row with label (e.g. settings) */
  variant?: 'compact' | 'full';
};

export function LanguageSelector({ variant = 'compact' }: LanguageSelectorProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { language, changeLanguage } = useChess();
  const [visible, setVisible] = useState(false);

  const open = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    setVisible(true);
  }, []);

  const close = useCallback(() => setVisible(false), []);

  const select = useCallback((lang: LanguageInfo) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    changeLanguage(lang.code);
    setVisible(false);
  }, [changeLanguage]);

  const currentLang = useMemo(
    () => SUPPORTED_LANGUAGES.find(l => l.code === language) ?? SUPPORTED_LANGUAGES[0],
    [language]
  );

  if (variant === 'full') {
    return (
      <>
        <Pressable onPress={open} style={styles.row}>
          <View style={[styles.iconCircle, { backgroundColor: colors.goldMuted }]}>
            <Globe size={16} color={colors.gold} />
          </View>
          <Text style={styles.rowText}>{t('language_setting', language)}</Text>
          <View style={styles.langBadge}>
            <Text style={styles.langBadgeText}>{currentLang.nativeName}</Text>
          </View>
          <ChevronRight size={16} color={colors.textMuted} />
        </Pressable>
        <LanguageModal
          visible={visible}
          onClose={close}
          currentCode={language}
          onSelect={select}
          colors={colors}
          modalStyles={styles}
        />
      </>
    );
  }

  return (
    <>
      <Pressable onPress={open} style={styles.iconButton}>
        <Globe size={20} color={colors.gold} />
      </Pressable>
      <LanguageModal
        visible={visible}
        onClose={close}
        currentCode={language}
        onSelect={select}
        colors={colors}
        modalStyles={styles}
      />
    </>
  );
}

function LanguageModal({
  visible,
  onClose,
  currentCode,
  onSelect,
  colors,
  modalStyles,
}: {
  visible: boolean;
  onClose: () => void;
  currentCode: string;
  onSelect: (lang: LanguageInfo) => void;
  colors: ThemeColors;
  modalStyles: ReturnType<typeof createStyles>;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={modalStyles.modalContainer}>
        <View style={modalStyles.modalHeader}>
          <Text style={modalStyles.modalTitle}>{t('select_language', currentCode)}</Text>
          <Pressable onPress={onClose} style={modalStyles.modalDoneBtn}>
            <Text style={modalStyles.modalDoneText}>{t('done', currentCode)}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={modalStyles.modalList}>
          {SUPPORTED_LANGUAGES.map(lang => {
            const isActive = currentCode === lang.code;
            return (
              <Pressable
                key={lang.code}
                onPress={() => onSelect(lang)}
                style={[modalStyles.modalItem, isActive && modalStyles.modalItemActive]}
              >
                <Text style={modalStyles.modalFlag}>{lang.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[modalStyles.modalName, isActive && modalStyles.modalNameActive]}>
                    {lang.nativeName}
                  </Text>
                  <Text style={modalStyles.modalSubname}>{lang.name}</Text>
                </View>
                {isActive && <Check size={18} color={colors.gold} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      gap: 12,
    },
    iconCircle: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowText: {
      flex: 1,
      fontSize: 15,
      color: colors.textPrimary,
      fontWeight: '500' as const,
    },
    langBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: colors.goldMuted,
    },
    langBadgeText: {
      fontSize: 12,
      fontWeight: '600' as const,
      color: colors.gold,
    },
    iconButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
    },
    modalContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 12,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700' as const,
      color: colors.textPrimary,
    },
    modalDoneBtn: {
      padding: 6,
    },
    modalDoneText: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: colors.gold,
    },
    modalList: {
      paddingHorizontal: 16,
      paddingBottom: 40,
    },
    modalItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 12,
      marginVertical: 2,
      gap: 12,
    },
    modalItemActive: {
      backgroundColor: colors.goldMuted,
    },
    modalFlag: {
      fontSize: 24,
    },
    modalName: {
      fontSize: 16,
      fontWeight: '500' as const,
      color: colors.textPrimary,
    },
    modalNameActive: {
      color: colors.gold,
      fontWeight: '600' as const,
    },
    modalSubname: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 1,
    },
  });
}
