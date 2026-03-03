import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  Platform,
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
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useLocation } from '@/providers/LocationProvider';
import { t } from '@/utils/translations';
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
            router.replace('/login' as any);
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
            logout();
            router.replace('/login' as any);
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
              <Text style={styles.versionText}>1.0.0</Text>
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
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 16,
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
    sectionCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      gap: 12,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 16,
      gap: 12,
    },
    rowDivider: {
      height: 1,
      backgroundColor: colors.divider,
      marginLeft: 56,
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
    togglePill: {
      width: 44,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.surfaceHighlight,
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    togglePillActive: {
      backgroundColor: colors.gold + '33',
    },
    togglePillLocation: {
      backgroundColor: colors.blue + '33',
    },
    toggleDot: {
      width: 18,
      height: 18,
      borderRadius: 9,
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
      borderRadius: 16,
      paddingVertical: 16,
      borderWidth: 1,
      borderColor: colors.red + '33',
    },
    logoutText: {
      fontSize: 16,
      fontWeight: '700' as const,
      color: colors.red,
    },
    bottomSpacer: {
      height: 40,
    },
  });
}
