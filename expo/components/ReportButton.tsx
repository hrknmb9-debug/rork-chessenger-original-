import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  Platform,
  Linking,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { Flag, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { t } from '@/utils/translations';
import { ThemeColors } from '@/constants/colors';

const REPORT_EMAIL = 'chessenger.co.ltd@gmail.com';

export interface ReportButtonProps {
  /** 通報時のコンテキスト（画面名・ユーザーIDなど、本文に自動挿入） */
  context?: string;
  /** アイコンボタン以外の表示（children） */
  children?: React.ReactNode;
  /** コンパクト表示（アイコンのみ） */
  compact?: boolean;
}

export function ReportButton({ context = '', children, compact = true }: ReportButtonProps) {
  const { colors } = useTheme();
  const { language } = useChess();
  const [visible, setVisible] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const defaultSubject = language === 'ja' ? '【CHESSENGER 通報】' : '【CHESSENGER Report】';

  const openModal = useCallback(() => {
    Haptics.selectionAsync();
    setSubject(defaultSubject);
    setBody(context ? `${language === 'ja' ? '通報対象・状況:\n' : 'Report target/situation:\n'}${context}\n\n` : '');
    setVisible(true);
  }, [context, language, defaultSubject]);

  const closeModal = useCallback(() => {
    setVisible(false);
  }, []);

  const handleSend = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const subj = subject.trim() || defaultSubject;
    const b = body.trim();
    const subjectEnc = encodeURIComponent(subj);
    const bodyEnc = encodeURIComponent(b);
    const url = `mailto:${REPORT_EMAIL}?subject=${subjectEnc}${b ? `&body=${bodyEnc}` : ''}`;
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
    closeModal();
  }, [subject, body, defaultSubject, closeModal]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <>
      <Pressable onPress={openModal} style={compact ? styles.iconBtn : undefined}>
        {children ?? <Flag size={compact ? 20 : 22} color={colors.textMuted} />}
      </Pressable>

      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeModal} />
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                {t('report_modal_title', language)}
              </Text>
              <Pressable onPress={closeModal} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close">
                <X size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              <Text style={[styles.label, { color: colors.textSecondary }]}>{t('report_subject', language)}</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.cardBorder }]}
                placeholder={defaultSubject}
                placeholderTextColor={colors.textMuted}
                value={subject}
                onChangeText={setSubject}
              />

              <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>{t('report_body_label', language)}</Text>
              <TextInput
                style={[styles.input, styles.bodyInput, { color: colors.textPrimary, borderColor: colors.cardBorder }]}
                placeholder={t('report_body_placeholder', language)}
                placeholderTextColor={colors.textMuted}
                value={body}
                onChangeText={setBody}
                multiline
                textAlignVertical="top"
              />

              <Pressable onPress={handleSend} style={[styles.sendBtn, { backgroundColor: colors.accent }]}>
                <Text style={styles.sendBtnText}>{t('report_send', language)}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    modalCard: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 20,
      paddingHorizontal: 20,
      paddingBottom: 40,
      maxHeight: '85%',
      borderWidth: 1,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
    },
    closeBtn: {
      padding: 4,
    },
    scrollContent: {
      paddingBottom: 24,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 6,
    },
    input: {
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
    },
    bodyInput: {
      minHeight: 120,
      paddingTop: 12,
    },
    sendBtn: {
      marginTop: 20,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
