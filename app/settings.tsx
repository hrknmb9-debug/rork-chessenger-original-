import React, { useState, useCallback, useMemo } from 'react';
import Constants from 'expo-constants';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import {
  User,
  Bell,
  Shield,
  Info,
  ChevronRight,
  Mail,
  Lock,
  Trash2,
  MessageCircle,
  Swords,
  Newspaper,
  Eye,
  Wifi,
  MapPin,
  HelpCircle,
  FileText,
  Sun,
  Moon,
  Navigation,
  MapPinOff,
  LogOut,
  UserX,
  Flag,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useLocation } from '@/providers/LocationProvider';
import { supabase } from '@/utils/supabaseClient';
import { t } from '@/utils/translations';
import { Linking } from 'react-native';
import { LanguageSelector } from '@/components/LanguageSelector';
import { BackNavButton } from '@/components/BackNavButton';

export default function SettingsScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { language } = useChess();
  const { logout, isLoggedIn } = useAuth();
  const { userLocation, locationEnabled, toggleLocationEnabled } = useLocation();
  const router = useRouter();

  const [pushEnabled, setPushEnabled] = useState<boolean>(true);
  const [matchNotif, setMatchNotif] = useState<boolean>(true);
  const [messageNotif, setMessageNotif] = useState<boolean>(true);
  const [timelineNotif, setTimelineNotif] = useState<boolean>(true);
  const [profileVisible, setProfileVisible] = useState<boolean>(true);
  const [onlineStatus, setOnlineStatus] = useState<boolean>(true);
  const [distanceVisible, setDistanceVisible] = useState<boolean>(true);

  const handleToggleTheme = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleTheme();
  }, [toggleTheme]);

  const handleToggleLocation = useCallback(() => {
    Haptics.selectionAsync();
    toggleLocationEnabled();
  }, [toggleLocationEnabled]);

  const handleReport = useCallback(() => {
    Haptics.selectionAsync();
    const subject = encodeURIComponent(language === 'ja' ? '【CHESSENGER 通報】' : '【CHESSENGER Report】');
    Linking.openURL(`mailto:chessenger.co.ltd@gmail.com?subject=${subject}`);
  }, [language]);

  const handleLogout = useCallback(() => {
    Alert.alert(
      t('logout', language),
      t('logout_confirm', language),
      [
        { text: t('cancel', language), style: 'cancel' },
        {
          text: t('logout', language),
          style: 'destructive',
          onPress: () => {
            logout();
          },
        },
      ]
    );
  }, [logout, router, language]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      t('delete_account', language),
      t('delete_account_confirm', language),
      [
        { text: t('cancel', language), style: 'cancel' },
        {
          text: t('delete_account', language),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('delete_account', language),
              t('delete_account_final', language),
              [
                { text: t('cancel', language), style: 'cancel' },
                {
                  text: t('delete_account', language),
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      // アクセストークンを明示的に付与して Edge Function を呼び出す
                      const { data: { session } } = await supabase.auth.getSession();
                      if (!session?.access_token) {
                        Alert.alert(t('error', language), t('delete_account_error', language));
                        return;
                      }
                      const { data, error } = await supabase.functions.invoke('delete-user', {
                        headers: { Authorization: `Bearer ${session.access_token}` },
                      });
                      if (error) throw error;
                      if (data?.error) throw new Error(data.error);
                      await logout();
                      // ナビゲーションは AuthProvider の SIGNED_OUT ハンドラに任せる
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : String(e);
                      Alert.alert(
                        t('error', language),
                        `${t('delete_account_error', language)}\n\n${msg}`,
                        [{ text: 'OK' }]
                      );
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }, [logout, router, language]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('settings_page', language),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerLeft: () => <BackNavButton onPress={() => router.back()} />,
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('account_management', language)}</Text>
          <View style={styles.sectionCard}>
            <Pressable onPress={() => router.push('/edit-profile' as any)} style={styles.row}>
              <View style={[styles.iconCircle, { backgroundColor: colors.goldMuted }]}>
                <User size={16} color={colors.gold} />
              </View>
              <Text style={styles.rowText}>{t('profile_edit', language)}</Text>
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>

            <View style={styles.rowDivider} />

            <Pressable onPress={() => router.push('/change-email' as any)} style={styles.row}>
              <View style={[styles.iconCircle, { backgroundColor: colors.blueMuted }]}>
                <Mail size={16} color={colors.blue} />
              </View>
              <Text style={styles.rowText}>{t('change_email', language)}</Text>
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>

            <View style={styles.rowDivider} />

            <Pressable onPress={() => router.push('/change-password' as any)} style={styles.row}>
              <View style={[styles.iconCircle, { backgroundColor: colors.orangeMuted }]}>
                <Lock size={16} color={colors.orange} />
              </View>
              <Text style={styles.rowText}>{t('change_password', language)}</Text>
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>

            <View style={styles.rowDivider} />

            <Pressable onPress={handleDeleteAccount} style={styles.row}>
              <View style={[styles.iconCircle, { backgroundColor: colors.redMuted }]}>
                <Trash2 size={16} color={colors.red} />
              </View>
              <Text style={[styles.rowText, { color: colors.red }]}>{t('delete_account', language)}</Text>
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('notification_management', language)}</Text>
          <View style={styles.sectionCard}>
            <View style={styles.switchRow}>
              <View style={[styles.iconCircle, { backgroundColor: colors.goldMuted }]}>
                <Bell size={16} color={colors.gold} />
              </View>
              <Text style={styles.rowText}>{t('push_notifications', language)}</Text>
              <Switch
                value={pushEnabled}
                onValueChange={(v) => { Haptics.selectionAsync(); setPushEnabled(v); }}
                trackColor={{ false: colors.surfaceHighlight, true: colors.gold + '55' }}
                thumbColor={pushEnabled ? colors.gold : colors.textMuted}
              />
            </View>

            <View style={styles.rowDivider} />

            <View style={styles.switchRow}>
              <View style={[styles.iconCircle, { backgroundColor: colors.blueMuted }]}>
                <Swords size={16} color={colors.blue} />
              </View>
              <Text style={styles.rowText}>{t('match_notifications', language)}</Text>
              <Switch
                value={matchNotif}
                onValueChange={(v) => { Haptics.selectionAsync(); setMatchNotif(v); }}
                trackColor={{ false: colors.surfaceHighlight, true: colors.gold + '55' }}
                thumbColor={matchNotif ? colors.gold : colors.textMuted}
              />
            </View>

            <View style={styles.rowDivider} />

            <View style={styles.switchRow}>
              <View style={[styles.iconCircle, { backgroundColor: colors.greenMuted }]}>
                <MessageCircle size={16} color={colors.green} />
              </View>
              <Text style={styles.rowText}>{t('message_notifications', language)}</Text>
              <Switch
                value={messageNotif}
                onValueChange={(v) => { Haptics.selectionAsync(); setMessageNotif(v); }}
                trackColor={{ false: colors.surfaceHighlight, true: colors.gold + '55' }}
                thumbColor={messageNotif ? colors.gold : colors.textMuted}
              />
            </View>

            <View style={styles.rowDivider} />

            <View style={styles.switchRow}>
              <View style={[styles.iconCircle, { backgroundColor: colors.orangeMuted }]}>
                <Newspaper size={16} color={colors.orange} />
              </View>
              <Text style={styles.rowText}>{t('timeline_notifications', language)}</Text>
              <Switch
                value={timelineNotif}
                onValueChange={(v) => { Haptics.selectionAsync(); setTimelineNotif(v); }}
                trackColor={{ false: colors.surfaceHighlight, true: colors.gold + '55' }}
                thumbColor={timelineNotif ? colors.gold : colors.textMuted}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('privacy_management', language)}</Text>
          <View style={styles.sectionCard}>
            <View style={styles.switchRow}>
              <View style={[styles.iconCircle, { backgroundColor: colors.goldMuted }]}>
                <Eye size={16} color={colors.gold} />
              </View>
              <Text style={styles.rowText}>{t('profile_visibility', language)}</Text>
              <Switch
                value={profileVisible}
                onValueChange={(v) => { Haptics.selectionAsync(); setProfileVisible(v); }}
                trackColor={{ false: colors.surfaceHighlight, true: colors.gold + '55' }}
                thumbColor={profileVisible ? colors.gold : colors.textMuted}
              />
            </View>

            <View style={styles.rowDivider} />

            <View style={styles.switchRow}>
              <View style={[styles.iconCircle, { backgroundColor: colors.greenMuted }]}>
                <Wifi size={16} color={colors.green} />
              </View>
              <Text style={styles.rowText}>{t('online_status', language)}</Text>
              <Switch
                value={onlineStatus}
                onValueChange={(v) => { Haptics.selectionAsync(); setOnlineStatus(v); }}
                trackColor={{ false: colors.surfaceHighlight, true: colors.gold + '55' }}
                thumbColor={onlineStatus ? colors.gold : colors.textMuted}
              />
            </View>

            <View style={styles.rowDivider} />

            <View style={styles.switchRow}>
              <View style={[styles.iconCircle, { backgroundColor: colors.blueMuted }]}>
                <MapPin size={16} color={colors.blue} />
              </View>
              <Text style={styles.rowText}>{t('distance_visibility', language)}</Text>
              <Switch
                value={distanceVisible}
                onValueChange={(v) => { Haptics.selectionAsync(); setDistanceVisible(v); }}
                trackColor={{ false: colors.surfaceHighlight, true: colors.gold + '55' }}
                thumbColor={distanceVisible ? colors.gold : colors.textMuted}
              />
            </View>

            <View style={styles.rowDivider} />

            <Pressable onPress={() => router.push('/blocked-players' as any)} style={styles.row}>
              <View style={[styles.iconCircle, { backgroundColor: colors.redMuted }]}>
                <UserX size={16} color={colors.red} />
              </View>
              <Text style={styles.rowText}>{t('blocked_users', language)}</Text>
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('other_settings', language)}</Text>
          <View style={styles.sectionCard}>
            <Pressable onPress={handleToggleTheme} style={styles.row}>
              <View style={[styles.iconCircle, { backgroundColor: isDark ? colors.orangeMuted : colors.blueMuted }]}>
                {isDark ? <Sun size={16} color={colors.orange} /> : <Moon size={16} color={colors.blue} />}
              </View>
              <Text style={styles.rowText}>
                {isDark ? t('light_mode', language) : t('dark_mode', language)}
              </Text>
              <View style={[styles.togglePill, isDark && styles.togglePillActive]}>
                <View style={[styles.toggleDot, isDark && styles.toggleDotActive]} />
              </View>
            </Pressable>

            <View style={styles.rowDivider} />

            <LanguageSelector variant="full" />

            <View style={styles.rowDivider} />

            <Pressable onPress={handleToggleLocation} style={styles.row}>
              <View style={[styles.iconCircle, { backgroundColor: locationEnabled ? colors.blueMuted : colors.surfaceHighlight }]}>
                {locationEnabled ? <Navigation size={16} color={colors.blue} /> : <MapPinOff size={16} color={colors.textMuted} />}
              </View>
              <Text style={styles.rowText}>
                {locationEnabled ? t('location_enabled', language) : t('location_off', language)}
              </Text>
              <View style={[styles.togglePill, locationEnabled && styles.togglePillLocation]}>
                <View style={[styles.toggleDot, locationEnabled && styles.toggleDotLocation]} />
              </View>
            </Pressable>

            <View style={styles.rowDivider} />

            <Pressable onPress={() => router.push('/help-support' as any)} style={styles.row}>
              <View style={[styles.iconCircle, { backgroundColor: colors.blueMuted }]}>
                <HelpCircle size={16} color={colors.blue} />
              </View>
              <Text style={styles.rowText}>{t('help_support', language)}</Text>
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>

            <View style={styles.rowDivider} />

            <Pressable onPress={() => router.push('/terms-of-service' as any)} style={styles.row}>
              <View style={[styles.iconCircle, { backgroundColor: colors.surfaceHighlight }]}>
                <FileText size={16} color={colors.textSecondary} />
              </View>
              <Text style={styles.rowText}>{t('terms_of_service', language)}</Text>
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>

            <View style={styles.rowDivider} />

            <Pressable onPress={() => router.push('/privacy-policy' as any)} style={styles.row}>
              <View style={[styles.iconCircle, { backgroundColor: colors.surfaceHighlight }]}>
                <Shield size={16} color={colors.textSecondary} />
              </View>
              <Text style={styles.rowText}>{t('privacy_policy', language)}</Text>
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>

            <View style={styles.rowDivider} />

            <View style={styles.row}>
              <View style={[styles.iconCircle, { backgroundColor: colors.surfaceHighlight }]}>
                <Info size={16} color={colors.textSecondary} />
              </View>
              <Text style={styles.rowText}>{t('app_version', language)}</Text>
              <Text style={styles.versionText}>
                {Constants.expoConfig?.version ?? Constants.manifest?.version ?? '1.0.0'}
              </Text>
            </View>
          </View>
        </View>

        {isLoggedIn && (
          <Pressable onPress={handleLogout} style={styles.logoutButton} testID="settings-logout">
            <LogOut size={18} color={colors.red} />
            <Text style={styles.logoutText}>{t('logout', language)}</Text>
          </Pressable>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  const cardShadow = Platform.select({
    ios: { shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16 },
    android: { elevation: 3 },
    web: { boxShadow: '0 4px 16px rgba(139,92,246,0.08)' } as any,
  });

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 20,
    },
    section: {
      marginBottom: 28,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: '700' as const,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginBottom: 10,
      marginLeft: 6,
    },
    sectionCard: {
      backgroundColor: colors.card,
      borderRadius: 20,
      overflow: 'hidden',
      ...(cardShadow ?? {}),
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 15,
      paddingHorizontal: 18,
      gap: 14,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 18,
      gap: 14,
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.divider,
      marginLeft: 62,
    },
    iconCircle: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowText: {
      flex: 1,
      fontSize: 15,
      color: colors.textPrimary,
      fontWeight: '500' as const,
      letterSpacing: 0.1,
    },
    togglePill: {
      width: 46,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.surfaceHighlight,
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    togglePillActive: {
      backgroundColor: colors.gold + '40',
    },
    togglePillLocation: {
      backgroundColor: colors.blue + '40',
    },
    toggleDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.textMuted,
    },
    toggleDotActive: {
      backgroundColor: colors.gold,
      alignSelf: 'flex-end' as const,
    },
    toggleDotLocation: {
      backgroundColor: colors.blue,
      alignSelf: 'flex-end' as const,
    },
    versionText: {
      fontSize: 14,
      color: colors.textMuted,
    },
    logoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: colors.redMuted,
      borderRadius: 20,
      paddingVertical: 17,
    },
    logoutText: {
      fontSize: 16,
      fontWeight: '700' as const,
      color: colors.red,
    },
    bottomSpacer: {
      height: 48,
    },
  });
}
