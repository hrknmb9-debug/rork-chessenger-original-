import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Mail, CheckCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { useAuth } from '@/providers/AuthProvider';
import { t } from '@/utils/translations';
import { supabase } from '@/utils/supabaseClient';
import { BackNavButton } from '@/components/BackNavButton';

export default function ChangeEmailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { language } = useChess();
  const { user, reloadUser } = useAuth();
  const router = useRouter();

  const [newEmail, setNewEmail] = useState<string>('');
  const [confirmEmail, setConfirmEmail] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = useCallback(async () => {
    if (!newEmail.trim() || !confirmEmail.trim()) {
      Alert.alert(t('error', language), t('field_required', language));
      return;
    }

    if (!newEmail.includes('@') || !newEmail.includes('.')) {
      Alert.alert(t('error', language), t('email_invalid', language));
      return;
    }

    if (newEmail !== confirmEmail) {
      Alert.alert(t('error', language), t('email_mismatch', language));
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) {
        Alert.alert(t('error', language), error.message || t('email_change_error', language));
        return;
      }
      await reloadUser();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        t('email_change_success', language),
        t('email_change_verification_sent', language),
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (e) {
      Alert.alert(t('error', language), t('email_change_error', language));
    } finally {
      setIsSubmitting(false);
    }
  }, [newEmail, confirmEmail, language, reloadUser, router]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('change_email', language),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerLeft: () => <BackNavButton onPress={() => router.back()} />,
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.iconContainer}>
            <Mail size={32} color={colors.blue} />
          </View>

          <Text style={styles.description}>
            {user?.email ? `${t('current_email', language)}: ${user.email}` : ''}
          </Text>

          <View style={styles.formSection}>
            <Text style={styles.label}>{t('new_email', language)}</Text>
            <TextInput
              style={styles.input}
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder={t('new_email', language)}
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              testID="new-email-input"
            />

            <Text style={styles.label}>{t('confirm_email', language)}</Text>
            <TextInput
              style={styles.input}
              value={confirmEmail}
              onChangeText={setConfirmEmail}
              placeholder={t('confirm_email', language)}
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              testID="confirm-email-input"
            />

          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={({ pressed }) => [
              styles.submitButton,
              pressed && styles.submitButtonPressed,
              isSubmitting && styles.submitButtonDisabled,
            ]}
            testID="submit-email-change"
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <CheckCircle size={18} color={colors.white} />
                <Text style={styles.submitText}>{t('save', language)}</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      paddingTop: 32,
    },
    iconContainer: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: colors.blueMuted,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: 20,
    },
    description: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: 28,
      lineHeight: 20,
    },
    formSection: {
      gap: 4,
      marginBottom: 28,
    },
    label: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.textSecondary,
      marginBottom: 6,
      marginTop: 12,
      marginLeft: 4,
    },
    input: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 15,
      color: colors.textPrimary,
    },
    submitButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.blue,
      borderRadius: 14,
      paddingVertical: 16,
    },
    submitButtonPressed: {
      opacity: 0.85,
    },
    submitButtonDisabled: {
      opacity: 0.6,
    },
    submitText: {
      fontSize: 16,
      fontWeight: '700' as const,
      color: colors.white,
    },
  });
}
