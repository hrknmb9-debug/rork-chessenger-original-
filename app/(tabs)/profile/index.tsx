import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  Settings,
  Share,
  Trophy,
  Swords,
  Calendar,
  ExternalLink,
  ShieldCheck,
  MapPin,
  Clock,
  Flag,
  Star,
} from 'lucide-react-native';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useChess } from '@/providers/ChessProvider';
import { t, getCountryFlag, getCountryName } from '@/utils/translations';
import { PlayStyle } from '@/types';

const PLAY_STYLE_META: { key: PlayStyle; labelKey: string; emoji: string }[] = [
  { key: 'casual', labelKey: 'play_style_casual', emoji: '🎲' },
  { key: 'beginner_welcome', labelKey: 'play_style_beginner_welcome', emoji: '🌱' },
  { key: 'competitive', labelKey: 'play_style_competitive', emoji: '⚔️' },
  { key: 'spectator_welcome', labelKey: 'play_style_spectator_welcome', emoji: '👀' },
  { key: 'tournament', labelKey: 'play_style_tournament', emoji: '🏆' },
];

const SKILL_EMOJI: Record<string, string> = {
  beginner: '🌱',
  intermediate: '♟️',
  advanced: '🔥',
  expert: '👑',
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face';

function resolveAvatarUrl(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_AVATAR;
  if (raw.startsWith('http')) return raw;
  return SUPABASE_URL + '/storage/v1/object/public/avatars/' + raw;
}

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { user, logout } = useAuth();
  const { profile, language } = useChess();
  const router = useRouter();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!user) return null;
  if (!profile) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12, color: '#888' }}>{'Loading Profile (ID: ' + (user?.id ?? '...') + ')'}</Text>
      </View>
    );
  }

  const stats = [
    {
      label: 'Chess.com',
      value: profile.chessComRating ?? user.chessComRating ?? '—',
      icon: <Trophy size={16} color={colors.accent} />,
    },
    {
      label: 'Lichess',
      value: profile.lichessRating ?? '—',
      icon: <Star size={16} color={colors.accent} />,
    },
    {
      label: t('matches', language) || 'Matches',
      value: profile.gamesPlayed ?? '0',
      icon: <Swords size={16} color={colors.accent} />,
    },
  ];

  const activePlayStyles = (profile.playStyles ?? []).map(key =>
    PLAY_STYLE_META.find(p => p.key === key)
  ).filter(Boolean) as typeof PLAY_STYLE_META;

  const countryDisplay = profile.country
    ? `${getCountryFlag(profile.country)} ${getCountryName(profile.country, language)}`
    : null;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable style={styles.headerBtn}>
            <Share size={22} color={colors.textPrimary} />
          </Pressable>
          <Pressable onPress={() => router.push('/settings' as any)} style={styles.headerBtn}>
            <Settings size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Avatar + Name */}
        <View style={styles.profileInfo}>
          <View style={styles.avatarContainer}>
            <Image
              source={{ uri: resolveAvatarUrl(profile.avatar || user.avatar) }}
              style={styles.avatar}
              contentFit="cover"
            />
            <View style={styles.verifiedBadge}>
              <ShieldCheck size={14} color="#fff" />
            </View>
          </View>

          <Text style={styles.userName}>{profile.name || user.name}</Text>
          <Text style={styles.userHandle}>@{user.email.split('@')[0]}</Text>

          {/* Location + Country row */}
          {(profile.location || countryDisplay) && (
            <View style={styles.metaRow}>
              {profile.location ? (
                <View style={styles.metaChip}>
                  <MapPin size={13} color={colors.textMuted} />
                  <Text style={styles.metaChipText}>{profile.location}</Text>
                </View>
              ) : null}
              {countryDisplay ? (
                <View style={styles.metaChip}>
                  <Flag size={13} color={colors.textMuted} />
                  <Text style={styles.metaChipText}>{countryDisplay}</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* Bio */}
          <View style={styles.bioContainer}>
            <Text style={styles.bioText}>
              {profile.bio || user.bio || 'チェス歴5年。平日の夜にオンラインで対局できる方を探しています！'}
            </Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {stats.map((item, idx) => (
            <View key={idx} style={styles.statBox}>
              <View style={styles.statIconWrap}>{item.icon}</View>
              <Text style={styles.statValue}>{item.value}</Text>
              <Text style={styles.statLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Skill Level + Time Control */}
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            {/* Skill Level */}
            <View style={styles.infoCard}>
              <Text style={styles.infoCardLabel}>{t('skill_level', language)}</Text>
              <View style={styles.singleChip}>
                <Text style={styles.singleChipEmoji}>
                  {SKILL_EMOJI[profile.skillLevel] ?? '♟️'}
                </Text>
                <Text style={styles.singleChipText}>
                  {t(profile.skillLevel, language)}
                </Text>
              </View>
            </View>

            {/* Preferred Time Control */}
            <View style={styles.infoCard}>
              <Text style={styles.infoCardLabel}>{t('preferred_time_label', language)}</Text>
              <View style={styles.singleChip}>
                <Clock size={14} color={colors.accent} />
                <Text style={styles.singleChipText}>
                  {profile.preferredTimeControl || '15+10'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Play Styles */}
        {activePlayStyles.length > 0 && (
          <View style={styles.tagsSection}>
            <Text style={styles.tagsSectionTitle}>{t('play_styles', language)}</Text>
            <View style={styles.tagsRow}>
              {activePlayStyles.map(ps => (
                <View key={ps.key} style={styles.tagChip}>
                  <Text style={styles.tagChipEmoji}>{ps.emoji}</Text>
                  <Text style={styles.tagChipText}>{t(ps.labelKey, language)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Edit Profile Button */}
        <View style={styles.actionSection}>
          <Pressable
            style={styles.editBtn}
            onPress={() => router.push('/edit-profile' as any)}
          >
            <Text style={styles.editBtnText}>{t('edit_profile', language)}</Text>
          </Pressable>
        </View>

        {/* Link Accounts */}
        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Link Accounts</Text>
          <Pressable style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Text style={styles.menuItemText}>Chess.com</Text>
            </View>
            <View style={styles.menuItemRight}>
              <Text style={styles.linkStatus}>
                {profile.chessComRating || user.chessComRating ? 'Connected' : 'Not Linked'}
              </Text>
              <ExternalLink size={16} color={colors.textMuted} />
            </View>
          </Pressable>
        </View>

        <Pressable onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>{t('logout', language)}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    safeArea: { backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 16,
    },
    headerBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollContent: { paddingBottom: 48 },

    /* Profile top */
    profileInfo: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 20 },
    avatarContainer: { position: 'relative', marginBottom: 16 },
    avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.surface },
    verifiedBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      backgroundColor: colors.accent,
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 3,
      borderColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    userName: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 },
    userHandle: { fontSize: 15, color: colors.textMuted, marginBottom: 12 },

    /* Location + Country */
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 14,
    },
    metaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    metaChipText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },

    /* Bio */
    bioContainer: {
      backgroundColor: colors.surface,
      padding: 16,
      borderRadius: 16,
      width: '100%',
    },
    bioText: { fontSize: 14, color: colors.textPrimary, textAlign: 'center', lineHeight: 20 },

    /* Stats */
    statsRow: { flexDirection: 'row', paddingHorizontal: 24, marginTop: 24, gap: 12 },
    statBox: {
      flex: 1,
      backgroundColor: colors.surface,
      paddingVertical: 16,
      borderRadius: 20,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    statIconWrap: { marginBottom: 8 },
    statValue: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
    statLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

    /* Skill + Time */
    infoSection: { paddingHorizontal: 24, marginTop: 16 },
    infoRow: { flexDirection: 'row', gap: 12 },
    infoCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    infoCardLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    singleChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    singleChipEmoji: { fontSize: 16 },
    singleChipText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },

    /* Play Styles */
    tagsSection: { paddingHorizontal: 24, marginTop: 20 },
    tagsSectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 10,
    },
    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tagChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    tagChipEmoji: { fontSize: 14 },
    tagChipText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },

    /* Actions */
    actionSection: { paddingHorizontal: 24, marginTop: 24 },
    editBtn: {
      height: 50,
      borderRadius: 25,
      backgroundColor: colors.textPrimary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editBtnText: { color: colors.background, fontWeight: '700', fontSize: 16 },

    /* Menu */
    menuSection: { marginTop: 32, paddingHorizontal: 24 },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      marginBottom: 12,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    menuItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    menuItemText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
    menuItemRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    linkStatus: { fontSize: 14, color: colors.textMuted },

    /* Logout */
    logoutBtn: { marginTop: 40, paddingVertical: 12, alignItems: 'center' },
    logoutText: { color: '#FF3B30', fontWeight: '600', fontSize: 15 },
  });
}
