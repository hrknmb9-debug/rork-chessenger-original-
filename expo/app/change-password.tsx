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
import { Lock, CheckCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { useAuth } from '@/providers/AuthProvider';
import { t } from '@/utils/translations';
import { BackNavButton } from '@/components/BackNavButton';
import { supabase } from '@/utils/supabaseClient';

export default function ChangePasswordScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { language } = useChess();
  const { user } = useAuth();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = useCallback(async () => {
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      Alert.alert(t('error', language), t('field_required', language));
      return;
    }

    if (currentPassword.length < 6) {
      Alert.alert(t('error', language), t('password_wrong', language));
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert(t('error', language), t('password_too_short', language));
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert(t('error', language), t('password_mismatch', language));
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Verify current password by re-authenticating
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email ?? '',
        password: currentPassword,
      });
      if (signInError) {
        Alert.alert(t('error', language), t('password_wrong', language));
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        Alert.alert(t('error', language), error.message || t('password_change_error', language));
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        t('password_change_success', language),
        '',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (e) {
      Alert.alert(t('error', language), t('password_change_error', language));
    } finally {
      setIsSubmitting(false);
    }
  }, [currentPassword, newPassword, confirmPassword, user?.email, language, router]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('change_password', language),
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
            <Lock size={32} color={colors.orange} />
          </View>

          <View style={styles.formSection}>
            <Text style={styles.label}>{t('current_password', language)}</Text>
            <TextInput
              style={styles.input}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder={t('current_password', language)}
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              testID="current-password-input"
            />

            <Text style={styles.label}>{t('new_password', language)}</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder={t('new_password', language)}
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              testID="new-password-input"
            />

            <Text style={styles.label}>{t('confirm_password', language)}</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={t('confirm_password', language)}
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              testID="confirm-password-input"
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
            testID="submit-password-change"
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
      backgroundColor: colors.orangeMuted,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: 28,
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
      backgroundColor: colors.orange,
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
