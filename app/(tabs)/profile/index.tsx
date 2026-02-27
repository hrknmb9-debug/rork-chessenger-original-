import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { MapPin, Calendar, Clock, ChevronRight, Navigation, Globe, Edit3, Star, ShieldBan, Settings, Flag, Camera, TrendingUp } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useLocation } from '@/providers/LocationProvider';
import { StatBox } from '@/components/StatBox';
import { getSkillLabel, getSkillColor, getSkillBgColor, getWinRate, formatRating } from '@/utils/helpers';
import { t, getLanguageFlag, getLanguageName, getCountryFlag, getCountryName } from '@/utils/translations';
import { PlayStyle } from '@/types';
import { supabaseNoAuth } from '@/utils/supabaseClient';

function getPlayStyleDisplay(ps: PlayStyle, lang: string): { label: string; emoji: string } {
  const emojiMap: Record<PlayStyle, string> = {
    casual: '🎲',
    beginner_welcome: '🌱',
    competitive: '⚔️',
    spectator_welcome: '👀',
    tournament: '🏆',
  };
  const labelKeyMap: Record<PlayStyle, string> = {
    casual: 'play_style_casual',
    beginner_welcome: 'play_style_beginner_welcome',
    competitive: 'play_style_competitive',
    spectator_welcome: 'play_style_spectator_welcome',
    tournament: 'play_style_tournament',
  };
  return { label: t(labelKeyMap[ps] ?? ps, lang), emoji: emojiMap[ps] ?? '' };
}

export default function ProfileScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { profile, profileLoaded, completedMatches, unratedMatches, language, blockedUsers, unblockUser, notifications, unreadNotificationCount, markAllNotificationsRead, reloadProfile, updateProfile, players } = useChess();
  const { isLoggedIn, user, updateProfile: updateAuthProfile, reloadUser } = useAuth();
  const { userLocation, requestLocation, locationEnabled } = useLocation();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState<boolean>(false);
  const avatarScale = useMemo(() => new Animated.Value(1), []);

  useEffect(() => {
    if (!profileLoaded) {
      console.log('Profile: Waiting for Supabase data...');
      reloadProfile().catch(e => console.log('Profile: Initial load failed', e));
    }
  }, [profileLoaded, reloadProfile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (locationEnabled) {
      requestLocation();
    }
    try {
      await reloadProfile();
    } catch (e) {
      console.log('Profile refresh failed', e);
    }
    setRefreshing(false);
  }, [locationEnabled, requestLocation, reloadProfile]);

  const winRate = useMemo(
    () => getWinRate(profile.wins, profile.gamesPlayed),
    [profile.wins, profile.gamesPlayed]
  );

  const skillColor = getSkillColor(profile.skillLevel, colors);
  const skillBg = getSkillBgColor(profile.skillLevel, colors);

  const handleSettingsPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/settings' as any);
  }, [router]);

  const handleEditProfile = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/edit-profile' as any);
  }, [router]);

  const uploadAvatarToSupabase = useCallback(async (uri: string): Promise<string | null> => {
    if (!user?.id || user.id === 'me') {
      console.log('Profile avatar upload: No valid user ID');
      return uri;
    }
    try {
      setIsUploadingAvatar(true);
      console.log('Profile avatar upload: Starting for user', user.id);
      const response = await fetch(uri);
      const blob = await response.blob();
      const filePath = `${user.id}/avatar.jpg`;
      const { error: uploadError } = await supabaseNoAuth.storage
        .from('avatars')
        .upload(filePath, blob, {
          cacheControl: '3600',
          upsert: true,
          contentType: 'image/jpeg',
        });
      if (uploadError) {
        console.log('Profile avatar upload error:', uploadError.message);
        return uri;
      }
      const { data: publicUrlData } = supabaseNoAuth.storage
        .from('avatars')
        .getPublicUrl(filePath);
      const publicUrl = publicUrlData.publicUrl + '?t=' + Date.now();
      console.log('Profile avatar upload success:', publicUrl);
      await supabaseNoAuth.from('profiles').upsert({ id: user.id, avatar: publicUrl });
      return publicUrl;
    } catch (e) {
      console.log('Profile avatar upload failed:', e);
      return uri;
    } finally {
      setIsUploadingAvatar(false);
    }
  }, [user]);

  const handlePickAvatar = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Animated.sequence([
        Animated.timing(avatarScale, { toValue: 0.92, duration: 100, useNativeDriver: true }),
        Animated.timing(avatarScale, { toValue: 1, duration: 100, useNativeDriver: true }),
      ]).start();
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const localUri = result.assets[0].uri;
        await updateProfile({ avatar: localUri });
        await updateAuthProfile({ avatar: localUri });
        const uploadedUrl = await uploadAvatarToSupabase(localUri);
        if (uploadedUrl && uploadedUrl !== localUri) {
          await updateProfile({ avatar: uploadedUrl });
          await updateAuthProfile({ avatar: uploadedUrl });
          await reloadUser();
          await reloadProfile();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          console.log('Profile: Avatar updated everywhere');
        }
      }
    } catch (e) {
      console.log('Profile: Avatar pick error', e);
    }
  }, [uploadAvatarToSupabase, updateProfile, updateAuthProfile, reloadUser, reloadProfile, avatarScale]);

  const handleRateMatch = useCallback((matchId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/rate-match?matchId=${matchId}` as any);
  }, [router]);

  const handleViewRating = useCallback((matchId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/view-rating?matchId=${matchId}` as any);
  }, [router]);

  const handleUnblock = useCallback((userId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      t('unblock_user', language),
      '',
      [
        { text: t('cancel', language), style: 'cancel' },
        { text: t('unblock_user', language), onPress: () => unblockUser(userId) },
      ]
    );
  }, [unblockUser, language]);

  const ratedMatches = useMemo(
    () => completedMatches.filter(m => m.rating),
    [completedMatches]
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      testID="profile-screen"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.gold}
          colors={[colors.gold]}
        />
      }
    >
      <View style={styles.heroSection}>
        <Pressable onPress={handlePickAvatar} style={styles.avatarWrapper} disabled={isUploadingAvatar}>
          <Animated.View style={{ transform: [{ scale: avatarScale }] }}>
            <Image source={{ uri: profile.avatar }} style={styles.avatar} contentFit="cover" />
            {isUploadingAvatar && (
              <View style={styles.avatarUploadOverlay}>
                <ActivityIndicator size="small" color={colors.white} />
              </View>
            )}
          </Animated.View>
          <View style={styles.onlineIndicator} />
          <View style={styles.editBadge}>
            <Camera size={12} color={colors.white} />
          </View>
        </Pressable>
        <Text style={styles.name}>{profile.name}</Text>
        <View style={styles.ratingRow}>
          <View style={styles.platformRatings}>
            <View style={styles.platformRatingItem}>
              <Text style={styles.platformLabel}>Chess.com</Text>
              <Text style={[styles.ratingValue, profile.chessComRating === null && styles.noExpText]}>
                {formatRating(profile.chessComRating, language)}
              </Text>
            </View>
            <View style={styles.ratingDivider} />
            <View style={styles.platformRatingItem}>
              <Text style={styles.platformLabel}>Lichess</Text>
              <Text style={[styles.ratingValue, profile.lichessRating === null && styles.noExpText]}>
                {formatRating(profile.lichessRating, language)}
              </Text>
            </View>
          </View>
        </View>
        <View style={[styles.skillBadge, { backgroundColor: skillBg }]}>
          <Text style={[styles.skillText, { color: skillColor }]}>
            {getSkillLabel(profile.skillLevel, language)}
          </Text>
        </View>
      </View>

      <View style={styles.infoRow}>
        <View style={styles.infoItem}>
          {userLocation ? (
            <Navigation size={14} color={colors.blue} />
          ) : (
            <MapPin size={14} color={colors.textMuted} />
          )}
          <Text style={[styles.infoText, userLocation ? styles.infoTextHighlight : undefined]}>
            {profile.location}
          </Text>
        </View>
        {profile.joinedDate ? (
          <View style={styles.infoItem}>
            <Calendar size={14} color={colors.gold} />
            <Text style={styles.infoTextGold}>{t('registered_date', language)}: {profile.joinedDate}</Text>
          </View>
        ) : null}
        <View style={styles.infoItem}>
          <Clock size={14} color={colors.textMuted} />
          <Text style={styles.infoText}>{profile.preferredTimeControl}</Text>
        </View>
      </View>

      {(profile.bio || (language === 'en' && profile.bioEn)) ? (
        <View style={styles.bioCard}>
          <View style={styles.bioCardHeader}>
            <Edit3 size={14} color={colors.gold} />
            <Text style={styles.bioCardTitle}>{t('about_me', language)}</Text>
          </View>
          <Text style={styles.bioCardText}>
            {language === 'en' && profile.bioEn ? profile.bioEn : profile.bio}
          </Text>
        </View>
      ) : (
        <Pressable onPress={handleEditProfile} style={styles.bioCardEmpty}>
          <Edit3 size={14} color={colors.textMuted} />
          <Text style={styles.bioCardEmptyText}>{t('no_bio', language)}</Text>
        </Pressable>
      )}

      {profile.playStyles && profile.playStyles.length > 0 && (
        <View style={styles.playStylesSection}>
          <Text style={styles.playStylesSectionTitle}>{t('play_styles', language)}</Text>
          <View style={styles.playStylesTags}>
            {profile.playStyles.map(ps => {
              const { label, emoji } = getPlayStyleDisplay(ps, language);
              return (
                <View key={ps} style={styles.playStyleTag}>
                  <Text style={styles.playStyleEmoji}>{emoji}</Text>
                  <Text style={styles.playStyleLabel}>{label}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      <View style={styles.languagesSection}>
        {profile.country && (
          <View style={styles.countryRow}>
            <Flag size={14} color={colors.textMuted} />
            <Text style={styles.countryFlag}>{getCountryFlag(profile.country)}</Text>
            <Text style={styles.countryText}>{getCountryName(profile.country, language)}</Text>
          </View>
        )}
        {profile.languages.length > 0 && (
          <>
            <View style={styles.languagesHeader}>
              <Globe size={14} color={colors.textMuted} />
              <Text style={styles.languagesTitle}>{t('languages', language)}</Text>
            </View>
            <View style={styles.languagesTags}>
              {profile.languages.map(lang => (
                <View key={lang} style={styles.langTag}>
                  <Text style={styles.langTagFlag}>{getLanguageFlag(lang)}</Text>
                  <Text style={styles.langTagText}>{getLanguageName(lang)}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      <View style={styles.statsSection}>
        <View style={styles.statsSectionHeader}>
          <TrendingUp size={14} color={colors.gold} />
          <Text style={styles.statsSectionTitle}>{t('stats', language)}</Text>
        </View>
        <View style={styles.statsGrid}>
          <StatBox label={t('games', language)} value={profile.gamesPlayed} />
          <StatBox label={t('wins', language)} value={profile.wins} color={colors.green} />
          <StatBox label={t('losses', language)} value={profile.losses} color={colors.red} />
          <StatBox label={t('draws', language)} value={profile.draws} />
        </View>

        <View style={styles.winRateCard}>
          <View style={styles.winRateHeader}>
            <Text style={styles.winRateLabel}>{t('win_rate', language)}</Text>
            <Text style={styles.winRateValue}>{winRate}%</Text>
          </View>
          <View style={styles.winRateBarBg}>
            <View style={[styles.winRateBarFill, { width: `${winRate}%` }]} />
          </View>
        </View>
      </View>

      {unratedMatches.length > 0 && (
        <View style={styles.unratedSection}>
          <Text style={styles.sectionTitle}>{t('rate_match', language)}</Text>
          {unratedMatches.map(match => (
            <Pressable
              key={match.id}
              onPress={() => handleRateMatch(match.id)}
              style={styles.unratedItem}
            >
              <Image source={{ uri: match.opponent.avatar }} style={styles.unratedAvatar} contentFit="cover" />
              <View style={styles.unratedInfo}>
                <Text style={styles.unratedName}>{match.opponent.name}</Text>
                <Text style={styles.unratedTime}>{match.timeControl}</Text>
              </View>
              <Star size={18} color={colors.gold} />
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      )}

      {ratedMatches.length > 0 && (
        <View style={styles.unratedSection}>
          <Text style={styles.sectionTitle}>{t('match_ratings', language)}</Text>
          {ratedMatches.map(match => (
            <Pressable
              key={match.id}
              onPress={() => handleViewRating(match.id)}
              style={styles.ratedItem}
            >
              <Image source={{ uri: match.opponent.avatar }} style={styles.unratedAvatar} contentFit="cover" />
              <View style={styles.unratedInfo}>
                <Text style={styles.unratedName}>{match.opponent.name}</Text>
                <Text style={styles.unratedTime}>
                  {((match.rating!.sportsmanship + match.rating!.skillAccuracy + match.rating!.punctuality) / 3).toFixed(1)} ★
                </Text>
              </View>
              <Star size={16} color={colors.gold} fill={colors.gold} />
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>
      )}

      {notifications.length > 0 && (
        <View style={styles.unratedSection}>
          <View style={styles.notifHeader}>
            <Text style={styles.sectionTitle}>{t('notifications', language)}</Text>
            {unreadNotificationCount > 0 && (
              <Pressable onPress={markAllNotificationsRead} style={styles.markReadBtn}>
                <Text style={styles.markReadText}>{t('mark_all_read', language)}</Text>
              </Pressable>
            )}
          </View>
          {notifications.slice(0, 5).map(notif => (
            <View
              key={notif.id}
              style={[styles.notifItem, !notif.read && styles.notifItemUnread]}
            >
              <View style={[
                styles.notifDot,
                notif.type === 'result_confirmed' ? styles.notifDotGreen : styles.notifDotGold,
                notif.read && styles.notifDotRead,
              ]} />
              <View style={styles.unratedInfo}>
                <Text style={styles.notifTitle}>{notif.title}</Text>
                <Text style={styles.notifMessage} numberOfLines={2}>{notif.message}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {blockedUsers.length > 0 && (
        <View style={styles.unratedSection}>
          <Text style={styles.sectionTitle}>{t('blocked_users', language)}</Text>
          {blockedUsers.map(userId => {
            const blockedPlayer = players.find(p => p.id === userId);
            return (
              <Pressable
                key={userId}
                onPress={() => handleUnblock(userId)}
                style={styles.blockedItem}
              >
                <Image source={{ uri: blockedPlayer?.avatar ?? 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face' }} style={styles.unratedAvatar} contentFit="cover" />
                <View style={styles.unratedInfo}>
                  <Text style={styles.unratedName}>{blockedPlayer?.name ?? userId.slice(0, 8)}</Text>
                  <Text style={styles.blockedLabel}>{t('blocked', language)}</Text>
                </View>
                <ShieldBan size={16} color={colors.red} />
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.menuSection}>
        <Pressable onPress={handleEditProfile} style={styles.menuItem}>
          <Edit3 size={18} color={colors.gold} />
          <Text style={styles.menuItemText}>{t('profile_edit', language)}</Text>
          <ChevronRight size={16} color={colors.textMuted} />
        </Pressable>

        <Pressable onPress={handleSettingsPress} style={styles.menuItem}>
          <Settings size={18} color={colors.textSecondary} />
          <Text style={styles.menuItemText}>{t('settings_page', language)}</Text>
          <ChevronRight size={16} color={colors.textMuted} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingBottom: 40,
    },
    heroSection: {
      alignItems: 'center',
      paddingTop: 20,
      paddingBottom: 20,
      paddingHorizontal: 20,
    },
    avatarWrapper: {
      position: 'relative',
      marginBottom: 16,
    },
    avatar: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: colors.surfaceLight,
      borderWidth: 3,
      borderColor: colors.gold,
    },
    onlineIndicator: {
      position: 'absolute',
      bottom: 4,
      right: 4,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.green,
      borderWidth: 3,
      borderColor: colors.background,
    },
    editBadge: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.gold,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.background,
    },
    name: {
      fontSize: 24,
      fontWeight: '700' as const,
      color: colors.textPrimary,
      marginBottom: 8,
    },
    ratingRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      marginBottom: 10,
    },
    platformRatings: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 16,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    platformRatingItem: {
      alignItems: 'center' as const,
    },
    platformLabel: {
      fontSize: 10,
      fontWeight: '600' as const,
      color: colors.textMuted,
      marginBottom: 2,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },
    ratingValue: {
      fontSize: 20,
      fontWeight: '800' as const,
      color: colors.gold,
    },
    noExpText: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.orange,
    },
    ratingDivider: {
      width: 1,
      height: 28,
      backgroundColor: colors.divider,
    },
    skillBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      marginBottom: 12,
    },
    skillText: {
      fontSize: 12,
      fontWeight: '600' as const,
    },
    avatarUploadOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
      borderRadius: 48,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 20,
      paddingHorizontal: 16,
      paddingBottom: 16,
    },
    infoItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    infoText: {
      fontSize: 12,
      color: colors.textMuted,
    },
    infoTextGold: {
      fontSize: 12,
      color: colors.gold,
      fontWeight: '500' as const,
    },
    infoTextHighlight: {
      color: colors.blue,
      fontWeight: '500' as const,
    },
    bioCard: {
      marginHorizontal: 16,
      marginBottom: 16,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    bioCardHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      marginBottom: 10,
    },
    bioCardTitle: {
      fontSize: 12,
      fontWeight: '600' as const,
      color: colors.gold,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },
    bioCardText: {
      fontSize: 15,
      color: colors.textPrimary,
      lineHeight: 22,
    },
    bioCardEmpty: {
      marginHorizontal: 16,
      marginBottom: 16,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingVertical: 16,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderStyle: 'dashed' as const,
    },
    bioCardEmptyText: {
      fontSize: 13,
      color: colors.textMuted,
    },
    languagesSection: {
      marginHorizontal: 16,
      marginBottom: 16,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
    },
    languagesHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 10,
    },
    languagesTitle: {
      fontSize: 12,
      fontWeight: '600' as const,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    languagesTags: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
    langTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.surfaceHighlight,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
    },
    langTagFlag: {
      fontSize: 14,
    },
    langTagText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '500' as const,
    },
    statsSection: {
      marginHorizontal: 16,
      marginBottom: 24,
    },
    statsSectionHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      marginBottom: 12,
    },
    statsSectionTitle: {
      fontSize: 12,
      fontWeight: '600' as const,
      color: colors.gold,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },
    statsGrid: {
      flexDirection: 'row' as const,
      gap: 8,
      marginBottom: 12,
    },
    winRateCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    winRateHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: 10,
    },
    winRateLabel: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: '500' as const,
    },
    winRateBarBg: {
      height: 8,
      backgroundColor: colors.surfaceHighlight,
      borderRadius: 4,
      marginBottom: 8,
      overflow: 'hidden',
    },
    winRateBarFill: {
      height: '100%',
      backgroundColor: colors.gold,
      borderRadius: 4,
    },
    winRateValue: {
      fontSize: 20,
      fontWeight: '700' as const,
      color: colors.gold,
      textAlign: 'right',
    },
    unratedSection: {
      marginHorizontal: 16,
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.textMuted,
      marginBottom: 10,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    unratedItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      marginBottom: 8,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.goldMuted,
    },
    unratedAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceLight,
    },
    unratedInfo: {
      flex: 1,
    },
    unratedName: {
      fontSize: 15,
      fontWeight: '600' as const,
      color: colors.textPrimary,
    },
    unratedTime: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    menuSection: {
      marginHorizontal: 16,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 14,
      backgroundColor: colors.card,
      borderRadius: 12,
      marginBottom: 8,
      gap: 12,
    },
    menuItemText: {
      flex: 1,
      fontSize: 15,
      color: colors.textPrimary,
      fontWeight: '500' as const,
    },
    countryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 10,
    },
    countryFlag: {
      fontSize: 16,
    },
    countryText: {
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: '500' as const,
    },
    ratedItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      marginBottom: 8,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    notifHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    markReadBtn: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: colors.blueMuted,
    },
    markReadText: {
      fontSize: 11,
      fontWeight: '600' as const,
      color: colors.blue,
    },
    notifItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      marginBottom: 8,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    notifItemUnread: {
      backgroundColor: colors.goldMuted,
      borderColor: colors.gold + '26',
    },
    notifDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    notifDotGold: {
      backgroundColor: colors.gold,
    },
    notifDotGreen: {
      backgroundColor: colors.green,
    },
    notifDotRead: {
      backgroundColor: colors.surfaceHighlight,
    },
    notifTitle: {
      fontSize: 14,
      fontWeight: '600' as const,
      color: colors.textPrimary,
      marginBottom: 2,
    },
    notifMessage: {
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 18,
    },
    blockedItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.redMuted,
      borderRadius: 12,
      padding: 14,
      marginBottom: 8,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.red + '26',
    },
    blockedLabel: {
      fontSize: 12,
      color: colors.red,
      fontWeight: '500' as const,
      marginTop: 2,
    },
    playStylesSection: {
      marginHorizontal: 16,
      marginBottom: 16,
    },
    playStylesSectionTitle: {
      fontSize: 12,
      fontWeight: '600' as const,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    playStylesTags: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    playStyleTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.goldMuted,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.gold + '33',
    },
    playStyleEmoji: {
      fontSize: 14,
    },
    playStyleLabel: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.gold,
    },
  });
}
