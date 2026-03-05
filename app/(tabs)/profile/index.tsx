import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  InteractionManager,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
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
  Users,
  Languages,
} from 'lucide-react-native';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useChess } from '@/providers/ChessProvider';
import { t, getCountryFlag, getCountryName } from '@/utils/translations';
import { translateText, getTargetLanguage, decodeForDisplay, onTranslationComplete } from '@/utils/translateText';
import { PlayStyle } from '@/types';
import { resolveAvatarUrl } from '@/utils/avatarUrl';
import { SafeImage } from '@/components/SafeImage';
import { supabase } from '@/utils/supabaseClient';

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


interface HostedEventWithParticipants {
  eventId: string;
  postId: string;
  title: string;
  date: string | null;
  time: string | null;
  participants: { id: string; name: string; avatar: string | null }[];
}

const PROFILE_BIO_ITEM_ID = 'profile-bio';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { user, logout } = useAuth();
  const { profile, language, accessToken } = useChess();
  const router = useRouter();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [hostedEvents, setHostedEvents] = useState<HostedEventWithParticipants[]>([]);
  const [loadingHosted, setLoadingHosted] = useState(false);
  const [bioTranslationState, setBioTranslationState] = useState<{ loading: boolean; localTranslatedContent: string | null }>({ loading: false, localTranslatedContent: null });

  const bioText = profile?.bio || user?.bio || '';
  const bioToShow = bioTranslationState.localTranslatedContent ?? bioText;
  const hasBio = !!bioText?.trim();

  useEffect(() => {
    const sub = onTranslationComplete((e) => {
      if (e.itemId !== PROFILE_BIO_ITEM_ID) return;
      const text = decodeForDisplay(e.text);
      if (!text?.trim()) return;
      InteractionManager.runAfterInteractions(() => {
        setBioTranslationState({ loading: false, localTranslatedContent: text });
      });
    });
    return () => sub.remove();
  }, []);

  const handleTranslateBio = useCallback(async () => {
    if (!hasBio || bioTranslationState.loading) return;
    if (bioTranslationState.localTranslatedContent) {
      setBioTranslationState({ loading: false, localTranslatedContent: null });
      return;
    }
    setBioTranslationState((prev) => ({ ...prev, loading: true }));
    let didSet = false;
    try {
      const targetLang = getTargetLanguage(language);
      const result = await translateText(bioText, targetLang, accessToken ?? undefined, { itemId: PROFILE_BIO_ITEM_ID });
      if ('text' in result) {
        const decoded = decodeForDisplay(result.text);
        if (decoded.trim()) {
          setBioTranslationState({ loading: false, localTranslatedContent: decoded });
          didSet = true;
        }
      } else {
        Alert.alert(t('error', language), t('translation_failed', language));
      }
    } finally {
      if (!didSet) setBioTranslationState((prev) => ({ ...prev, loading: false }));
    }
  }, [hasBio, bioText, language, bioTranslationState.loading, bioTranslationState.localTranslatedContent, accessToken]);

  const loadHostedEvents = useCallback(async () => {
    if (!user?.id || !profile?.id) return;
    setLoadingHosted(true);
    try {
      const { data: myPosts } = await supabase
        .from('posts')
        .select('id, content')
        .eq('user_id', user.id)
        .eq('type', 'event');
      if (!myPosts?.length) {
        setHostedEvents([]);
        return;
      }
      const postIds = myPosts.map((p: { id: string }) => p.id);
      const { data: eventsRows } = await supabase
        .from('events')
        .select('id, post_id, title, date, time')
        .in('post_id', postIds);
      if (!eventsRows?.length) {
        setHostedEvents([]);
        return;
      }
      const eventIds = eventsRows.map((e: { id: string }) => e.id);
      const { data: participantsRows } = await supabase
        .from('event_participants')
        .select('event_id, user_id')
        .in('event_id', eventIds);
      const participantsByEvent = new Map<string, string[]>();
      (participantsRows ?? []).forEach((r: { event_id: string; user_id: string }) => {
        const arr = participantsByEvent.get(r.event_id) ?? [];
        arr.push(r.user_id);
        participantsByEvent.set(r.event_id, arr);
      });
      const allUserIds = [...new Set((participantsRows ?? []).map((r: { user_id: string }) => r.user_id))];
      const { data: profilesRows } = allUserIds.length > 0
        ? await supabase.from('profiles').select('id, name, avatar').in('id', allUserIds)
        : { data: [] };
      const profileMap = new Map<string, { name: string; avatar: string | null }>();
      (profilesRows ?? []).forEach((p: { id: string; name: string | null; avatar: string | null }) => {
        profileMap.set(p.id, { name: p.name ?? 'Unknown', avatar: p.avatar });
      });
      const result: HostedEventWithParticipants[] = eventsRows.map((ev: { id: string; post_id: string; title: string; date: string | null; time: string | null }) => {
        const post = myPosts.find((p: { id: string }) => p.id === ev.post_id);
        return {
          eventId: ev.id,
          postId: ev.post_id,
          title: ev.title || (post as { content?: string })?.content || t('event', language),
          date: ev.date,
          time: ev.time,
          participants: (participantsByEvent.get(ev.id) ?? []).map(uid => ({
            id: uid,
            name: profileMap.get(uid)?.name ?? 'Unknown',
            avatar: profileMap.get(uid)?.avatar ?? null,
          })),
        };
      });
      setHostedEvents(result);
    } catch (e) {
      console.log('Profile: loadHostedEvents failed', e);
      setHostedEvents([]);
    } finally {
      setLoadingHosted(false);
    }
  }, [user?.id, profile?.id, language]);

  useFocusEffect(
    useCallback(() => {
      loadHostedEvents();
    }, [loadHostedEvents])
  );

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
              source={{ uri: resolveAvatarUrl(profile.avatar || user.avatar, profile.name || user.name) }}
              style={styles.avatar}
              contentFit="cover"
            />
            <View style={styles.verifiedBadge}>
              <ShieldCheck size={14} color="#fff" />
            </View>
          </View>

          <Text style={styles.userName}>{profile.name || user.name}</Text>
          <Text style={styles.userHandle}>@{user.email.split('@')[0]}</Text>

          {/* Location + Country：1つのチップに集約（重複表示を防止） */}
          {(profile.location || countryDisplay) && (
            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <MapPin size={13} color={colors.textMuted} />
                <Text style={styles.metaChipText}>
                  {[profile.location, countryDisplay].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
          )}

          {/* Bio + 翻訳 */}
          {hasBio && (
            <Pressable
              onPress={handleTranslateBio}
              disabled={bioTranslationState.loading}
              style={({ pressed }) => [
                styles.bioTranslateRow,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Languages size={14} color={bioTranslationState.localTranslatedContent ? colors.gold : colors.textMuted} />
              <Text style={[styles.bioTranslateText, bioTranslationState.localTranslatedContent && { color: colors.gold }]}>
                {bioTranslationState.loading ? t('translating', language) : bioTranslationState.localTranslatedContent ? t('original', language) : t('translate', language)}
              </Text>
            </Pressable>
          )}
          <View style={styles.bioContainer}>
            <Text style={styles.bioText}>
              {bioToShow || 'チェス歴5年。平日の夜にオンラインで対局できる方を探しています！'}
            </Text>
            {bioTranslationState.localTranslatedContent != null && (
              <Text style={[styles.bioText, { fontSize: 11, color: colors.textMuted, marginTop: 4, fontStyle: 'italic' }]}>
                {t('translated_by_ai', language)}
              </Text>
            )}
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

        {/* 主催イベントの参加者 */}
        <View style={styles.hostedEventsSection}>
          <Text style={styles.sectionTitle}>{t('hosted_event_participants', language)}</Text>
          {loadingHosted ? (
            <View style={styles.hostedLoading}>
              <ActivityIndicator size="small" color={colors.accent} />
            </View>
          ) : hostedEvents.length === 0 ? (
            <View style={styles.hostedEmpty}>
              <Calendar size={32} color={colors.textMuted} />
              <Text style={styles.hostedEmptyText}>{t('no_hosted_events', language)}</Text>
            </View>
          ) : (
            hostedEvents.map(ev => (
              <View key={ev.eventId} style={styles.hostedEventCard}>
                <View style={styles.hostedEventHeader}>
                  <Text style={styles.hostedEventTitle} numberOfLines={1}>{ev.title}</Text>
                  <Text style={styles.hostedEventMeta}>
                    {ev.date ?? '-'} {ev.time ?? ''}
                  </Text>
                </View>
                <View style={styles.hostedParticipantsRow}>
                  <Users size={14} color={colors.textMuted} />
                  <Text style={styles.hostedParticipantsLabel}>
                    {ev.participants.length} {t('participants', language)}
                  </Text>
                </View>
                {ev.participants.length > 0 ? (
                  <View style={styles.hostedAvatarsRow}>
                    {ev.participants.map(p => (
                      <Pressable
                        key={p.id}
                        onPress={() => router.push(`/player/${p.id}` as any)}
                        style={styles.hostedAvatarWrap}
                      >
                        <SafeImage
                          uri={resolveAvatarUrl(p.avatar, p.name)}
                          name={p.name}
                          style={styles.hostedAvatar}
                          contentFit="cover"
                        />
                        <Text style={styles.hostedAvatarName} numberOfLines={1}>{p.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            ))
          )}
        </View>

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

    /* Bio 翻訳 */
    bioTranslateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'center',
      marginBottom: 8,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: 'transparent',
    },
    bioTranslateText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },

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

    /* Hosted events participants */
    hostedEventsSection: { marginTop: 24, paddingHorizontal: 24 },
    hostedLoading: { paddingVertical: 24, alignItems: 'center' },
    hostedEmpty: {
      alignItems: 'center',
      paddingVertical: 32,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    hostedEmptyText: { fontSize: 14, color: colors.textMuted, marginTop: 8 },
    hostedEventCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    hostedEventHeader: { marginBottom: 8 },
    hostedEventTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
    hostedEventMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    hostedParticipantsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    hostedParticipantsLabel: { fontSize: 13, color: colors.textMuted },
    hostedAvatarsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    hostedAvatarWrap: { alignItems: 'center', maxWidth: 64 },
    hostedAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceHighlight },
    hostedAvatarName: { fontSize: 11, color: colors.textSecondary, marginTop: 4, maxWidth: 64 },

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
