import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Match, MatchStatus, MatchRating, Player, UserProfile, TimelinePost, TimelineComment, TimelineEvent, MatchResultReport, AppNotification, SkillLevel, PlayStyle } from '@/types';

import { useLocation, calculateDistance } from '@/providers/LocationProvider';
import { Language } from '@/utils/translations';
import { supabase, supabaseNoAuth, clearStaleSession } from '@/utils/supabaseClient';
import { resolveAvatarUrl } from '@/utils/avatarUrl';
import {
  calculateElo,
  notifyMatchRequest,
  notifyMatchResponse,
  notifyNewMessage,
} from '@/utils/notifications';
import { playMessageNotificationSound } from '@/utils/messageNotificationSound';

const LANGUAGE_KEY = 'chess_language';
const EVENT_CACHE_KEY = 'chess_event_cache';

interface SupabaseProfile {
  id: string;
  name?: string;
  email?: string;
  avatar?: string | null;
  bio?: string;
  rating?: number;
  chess_com_rating?: number | null;
  lichess_rating?: number | null;
  skill_level?: string;
  preferred_time_control?: string;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
  languages?: string[];
  country?: string;
  games_played?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  is_online?: boolean;
  last_active?: string;
  play_styles?: string[];
  last_seen?: string;
}

interface SupabaseMatch {
  id: string;
  requester_id: string;
  opponent_id: string;
  status: string;
  time_control: string;
  requested_at: string;
  scheduled_at?: string;
  location?: string;
  result?: string;
  winner_id?: string;
  is_incoming?: boolean;
}

interface SupabasePost {
  id: string;
  user_id: string;
  content: string;
  image_url?: string | null;
  template_type?: string | null;
  type?: string | null;
  created_at: string;
}

async function fillMissingEventDetails(
  built: TimelinePost[],
  postsData: SupabasePost[],
  client: ReturnType<typeof supabase>
): Promise<TimelinePost[]> {
  const needsEvent = built.filter(p => !p.event).map(p => p.id);
  if (needsEvent.length === 0) return built;
  let result = built;
  const needsEventSet = new Set(needsEvent.map(String));
  let batchEvents: Record<string, unknown>[] | null = null;
  const { data: batchIn, error: batchErr } = await client.from('events').select('*').in('post_id', needsEvent);
  if (batchErr) console.log('ChessProvider: fillMissingEventDetails batch error', batchErr.message);
  batchEvents = (batchIn ?? []) as Record<string, unknown>[];
  if (batchEvents.length === 0 && needsEvent.length > 0) {
    const { data: allEv } = await client.from('events').select('*');
    batchEvents = ((allEv ?? []) as Record<string, unknown>[]).filter(e => needsEventSet.has(String(e.post_id ?? '')));
  }
  const batchMap = new Map<string, Record<string, unknown>>();
  if (batchEvents && batchEvents.length > 0) {
    for (const e of batchEvents) {
      const pid = String(e.post_id ?? '');
      if (pid && needsEventSet.has(pid)) batchMap.set(pid, e);
    }
  }
  for (const postId of needsEvent) {
    let evRow = batchMap.get(postId) as Record<string, unknown> | undefined;
    if (!evRow) {
      const { data: single, error: evErr } = await client.from('events').select('*').eq('post_id', postId).maybeSingle();
      if (evErr) {
        console.log('ChessProvider: fillMissingEventDetails fetch error for', postId, evErr.message);
        continue;
      }
      evRow = single ?? undefined;
    }
    if (!evRow) continue;
    const { data: epRows } = await client.from('event_participants').select('user_id').eq('event_id', evRow.id);
    const participants = (epRows ?? []).map((r: { user_id: string }) => r.user_id);
    let date = (evRow.date as string) ?? '';
    let time = (evRow.time as string) ?? '';
    const eventAt = evRow.event_at as string | null | undefined;
    if ((!date || !time) && eventAt) {
      const d = new Date(eventAt);
      if (!Number.isNaN(d.getTime())) {
        date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
    }
    const supabasePost = postsData.find((p: SupabasePost) => p.id === postId);
    const post = result.find(p => p.id === postId);
    const deadlineVal = evRow.deadline_at;
    const deadlineAt = deadlineVal != null && String(deadlineVal).trim() !== '' ? String(deadlineVal) : undefined;
    const timelineEvent: TimelineEvent = {
      id: evRow.id as string,
      userId: supabasePost?.user_id ?? post?.author?.id ?? '',
      title: ((evRow.title as string) || post?.content || '').trim() || 'イベント',
      date: date || '-',
      time: time || '-',
      location: (evRow.location as string) ?? '',
      maxParticipants: (evRow.max_participants as number) ?? 10,
      participants,
      createdAt: (evRow.created_at as string) ?? post?.createdAt ?? '',
      deadlineAt,
      isClosed: !!(evRow.closed_at as string | null | undefined) || !!(deadlineAt && new Date(deadlineAt) <= new Date()),
    };
    result = result.map(p => p.id === postId ? { ...p, type: 'event' as const, event: timelineEvent } : p);
  }
  return result;
}

interface SupabaseComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  parent_id?: string | null;
  created_at: string;
}

interface SupabaseNotification {
  id: string;
  user_id: string;
  type: string;
  content: string;
  is_read: boolean;
  related_id?: string | null;
  created_at: string;
}

function supabaseProfileToPlayer(profile: SupabaseProfile, userLat?: number, userLon?: number): Player {
  const lat = profile.latitude ?? 0;
  const lon = profile.longitude ?? 0;
  let distance = 999;
  if (userLat && userLon && lat !== 0 && lon !== 0) {
    distance = Math.round(calculateDistance(userLat, userLon, lat, lon) * 10) / 10;
  }

  return {
    id: profile.id,
    name: profile.name ?? 'Unknown',
    avatar: resolveAvatarUrl(profile.avatar, profile.name),
    rating: profile.rating ?? 0,
    chessComRating: profile.chess_com_rating ?? null,
    lichessRating: profile.lichess_rating ?? null,
    skillLevel: (profile.skill_level as SkillLevel) ?? 'beginner',
    gamesPlayed: profile.games_played ?? 0,
    wins: profile.wins ?? 0,
    losses: profile.losses ?? 0,
    draws: profile.draws ?? 0,
    distance,
    isOnline: profile.is_online ?? false,
    lastActive: profile.last_active ?? '',
    bio: profile.bio ?? '',
    bioEn: '',
    preferredTimeControl: profile.preferred_time_control ?? '15+10',
    location: profile.location ?? '',
    coordinates: { latitude: lat, longitude: lon },
    languages: profile.languages ?? [],
    country: profile.country,
    playStyles: (profile.play_styles as PlayStyle[]) ?? [],
    lastSeen: profile.last_seen,
  };
}

export const [ChessProvider, useChess] = createContextHook(() => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [profileLoaded, setProfileLoaded] = useState<boolean>(false);
  const defaultProfile: UserProfile = {
    id: 'me',
    name: '',
    avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face',
    email: '',
    rating: 0,
    chessComRating: null,
    lichessRating: null,
    skillLevel: 'beginner',
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    distance: 0,
    isOnline: true,
    lastActive: '',
    bio: '',
    bioEn: '',
    preferredTimeControl: '15+10',
    location: '',
    joinedDate: '',
    coordinates: { latitude: 0, longitude: 0 },
    languages: [],
    country: undefined,
    playStyles: [],
  };
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [language, setLanguage] = useState<Language>('ja');
  const [timelinePosts, setTimelinePosts] = useState<TimelinePost[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [resultReports, setResultReports] = useState<MatchResultReport[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [supabasePlayers, setSupabasePlayers] = useState<Player[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeUsersCount, setActiveUsersCount] = useState<number>(0);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [unreadCountByUserId, setUnreadCountByUserId] = useState<Record<string, number>>({});
  const { userLocation, getDistanceToPlayer } = useLocation();
  const lastSeenInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const profileCacheRef = useRef<Map<string, Player>>(new Map());
  const eventCacheRef = useRef<Map<string, TimelineEvent>>(new Map());
  const refreshTimelineRef = useRef<() => Promise<void>>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('ChessProvider: Auth state changed', event, session?.user?.id);
      if (event === 'SIGNED_IN' && session?.user) {
        setCurrentUserId(session.user.id);
        setAuthReady(prev => !prev);
      } else if (event === 'SIGNED_OUT') {
        setCurrentUserId(null);
        setProfile(defaultProfile);
        setProfileLoaded(false);
        setSupabasePlayers([]);
        setMatches([]);
        setTimelinePosts([]);
        setNotifications([]);
        setBlockedUsers([]);
        profileCacheRef.current.clear();
        eventCacheRef.current.clear();
        AsyncStorage.removeItem(EVENT_CACHE_KEY).catch(() => {});
      }
    });
    return () => { subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const loadLang = async () => {
      try {
        const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
        if (stored) {
          setLanguage(stored);
          console.log('ChessProvider: Loaded language', stored);
        }
      } catch (e) {
        console.log('ChessProvider: Failed to load language', e);
      }
    };
    loadLang();
  }, []);

  useEffect(() => {
    const loadEventCache = async () => {
      try {
        const stored = await AsyncStorage.getItem(EVENT_CACHE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Array<[string, TimelineEvent]>;
          const m = new Map<string, TimelineEvent>();
          for (const [postId, ev] of parsed) {
            if (postId && ev?.title) m.set(postId, ev);
          }
          eventCacheRef.current = m;
          console.log('ChessProvider: Loaded event cache,', m.size, 'entries');
        }
      } catch (e) {
        console.log('ChessProvider: Failed to load event cache', e);
      }
    };
    loadEventCache();
  }, []);

  const fetchPlayerProfile = useCallback(async (userId: string): Promise<Player | null> => {
    const cached = profileCacheRef.current.get(userId);
    if (cached) return cached;

    try {
      const { data, error } = await supabaseNoAuth
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (data && !error) {
        const player = supabaseProfileToPlayer(data, userLocation?.latitude, userLocation?.longitude);
        profileCacheRef.current.set(userId, player);
        return player;
      }
    } catch (e) {
      console.log('ChessProvider: fetchPlayerProfile failed for', userId, e);
    }
    return null;
  }, [userLocation]);

  const buildTimelinePosts = useCallback(async (
    posts: SupabasePost[],
    allComments: SupabaseComment[],
    allLikes: { post_id: string; user_id: string }[],
    allEvents: Record<string, unknown>[],
    allEventParticipants: { event_id: string; user_id: string }[],
    blockedIds: string[]
  ): Promise<TimelinePost[]> => {
    let events = [...(allEvents ?? [])];
    let epData = [...allEventParticipants];
    const postIdSetFromPosts = new Set(posts.map(p => p.id));
    const hasEventFor = new Set(events.map((e: Record<string, unknown>) => String(e.post_id ?? '')));
    const missingIds = [...postIdSetFromPosts].filter(id => !hasEventFor.has(id));
    if (missingIds.length > 0) {
      let extra: Record<string, unknown>[] | null = null;
      const { data: extraIn } = await supabase.from('events').select('*').in('post_id', missingIds);
      if (extraIn && extraIn.length > 0) {
        extra = extraIn;
      } else {
        const { data: extraFull } = await supabase.from('events').select('*');
        if (extraFull && extraFull.length > 0) {
          extra = extraFull.filter((e: Record<string, unknown>) =>
            missingIds.includes(String(e.post_id ?? ''))
          );
        }
      }
      if (extra && extra.length > 0) {
        events = [...events, ...extra];
        const extraEventIds = extra.map((e: Record<string, unknown>) => e.id as string);
        const existingEpIds = new Set(epData.map(ep => ep.event_id));
        const newIds = extraEventIds.filter(id => !existingEpIds.has(id));
        if (newIds.length > 0) {
          const { data: epExtra } = await supabase
            .from('event_participants')
            .select('event_id, user_id')
            .in('event_id', newIds);
          if (epExtra) epData = [...epData, ...epExtra];
        }
      }
    }
    const filteredPosts = posts.filter(p => !blockedIds.includes(p.user_id));
    const authorIds = [...new Set(filteredPosts.map(p => p.user_id))];
    const commentAuthorIds = [...new Set(allComments.map(c => c.user_id))];
    const allAuthorIds = [...new Set([...authorIds, ...commentAuthorIds])];

    const profileMap = new Map<string, Player>();
    const batchSize = 20;
    for (let i = 0; i < allAuthorIds.length; i += batchSize) {
      const batch = allAuthorIds.slice(i, i + batchSize);
      const { data: profiles } = await supabaseNoAuth
        .from('profiles')
        .select('*')
        .in('id', batch);
      if (profiles) {
        profiles.forEach((p: SupabaseProfile) => {
          const player = supabaseProfileToPlayer(p, userLocation?.latitude, userLocation?.longitude);
          profileMap.set(p.id, player);
          profileCacheRef.current.set(p.id, player);
        });
      }
    }

    const defaultPlayer: Player = {
      id: 'unknown',
      name: 'Unknown',
      avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face',
      rating: 0,
      chessComRating: null,
      lichessRating: null,
      skillLevel: 'beginner',
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      distance: 0,
      isOnline: false,
      lastActive: '',
      bio: '',
      bioEn: '',
      preferredTimeControl: '15+10',
      location: '',
      coordinates: { latitude: 0, longitude: 0 },
      languages: [],
    };

    return filteredPosts.map(post => {
      const author = profileMap.get(post.user_id) ?? { ...defaultPlayer, id: post.user_id };
      const postLikes = allLikes.filter(l => l.post_id === post.id).map(l => l.user_id);
      const postComments = allComments
        .filter(c => c.post_id === post.id && !blockedIds.includes(c.user_id))
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      const topLevel = postComments.filter(c => !c.parent_id);
      const replies = postComments.filter(c => c.parent_id);

      const comments: TimelineComment[] = topLevel.map(c => {
        const cAuthor = profileMap.get(c.user_id) ?? { ...defaultPlayer, id: c.user_id };
        const cReplies = replies
          .filter(r => r.parent_id === c.id)
          .map(r => ({
            id: r.id,
            author: profileMap.get(r.user_id) ?? { ...defaultPlayer, id: r.user_id },
            content: r.content,
            createdAt: r.created_at,
            parentId: r.parent_id ?? undefined,
          }));

        return {
          id: c.id,
          author: cAuthor,
          content: c.content,
          createdAt: c.created_at,
          parentId: c.parent_id ?? undefined,
          replies: cReplies.length > 0 ? cReplies : undefined,
        };
      });

      // 投稿とイベントは post_id で紐づく（events.post_id = posts.id）
      const rawEvent = events.find(
        (e: Record<string, unknown>) => String(e.post_id ?? '') === String(post.id ?? '')
      ) as Record<string, unknown> | undefined;

      let postType: TimelinePost['type'] =
        ((post.type as TimelinePost['type']) ?? 'general');
      let event: TimelineEvent | undefined;

      if (rawEvent) {
        postType = 'event';
        const participants = epData
          .filter(ep => ep.event_id === (rawEvent.id as string))
          .map(ep => ep.user_id);

        let date = (rawEvent.date as string) ?? '';
        let time = (rawEvent.time as string) ?? '';
        const eventAt = rawEvent.event_at as string | null | undefined;
        if ((!date || !time) && eventAt) {
          const d = new Date(eventAt);
          if (!Number.isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            date = `${y}-${m}-${day}`;
            time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          }
        }

        const deadlineVal = rawEvent.deadline_at;
        const deadlineAt = deadlineVal != null && String(deadlineVal).trim() !== '' ? String(deadlineVal) : undefined;
        event = {
          id: rawEvent.id as string,
          userId: post.user_id,
          title: ((rawEvent.title as string) || post.content || '').trim() || 'イベント',
          date: date || '-',
          time: time || '-',
          location: (rawEvent.location as string) ?? '',
          maxParticipants: (rawEvent.max_participants as number) ?? 10,
          participants,
          createdAt: (rawEvent.created_at as string) ?? post.created_at,
          deadlineAt,
          isClosed: !!(rawEvent.closed_at as string | null | undefined) || !!(deadlineAt && new Date(deadlineAt) <= new Date()),
        };
      }

      return {
        id: post.id,
        author,
        type: postType,
        content: post.content,
        imageUrl: post.image_url ?? undefined,
        templateType: post.template_type ?? undefined,
        createdAt: post.created_at,
        likes: postLikes,
        comments,
        event,
      };
    });
  }, [userLocation]);

  const RECENT_OWN_POST_WINDOW_MS = 3 * 60 * 1000;

  const applyEventCacheToPosts = useCallback((posts: TimelinePost[], prev?: TimelinePost[]): TimelinePost[] => {
    const prevMap = prev?.length ? new Map(prev.map(p => [p.id, p])) : null;
    return posts.map(p => {
      if (p.event) {
        eventCacheRef.current.set(p.id, p.event);
        return p;
      }
      const prevPost = prevMap?.get(p.id);
      if (prevPost?.event) return { ...p, type: 'event' as const, event: prevPost.event };
      const cached = eventCacheRef.current.get(p.id);
      if (cached) return { ...p, type: 'event' as const, event: cached };
      return p;
    });
  }, []);

  const persistEventCache = useCallback(async () => {
    try {
      const entries = Array.from(eventCacheRef.current.entries());
      await AsyncStorage.setItem(EVENT_CACHE_KEY, JSON.stringify(entries));
    } catch (e) {
      console.log('ChessProvider: Failed to persist event cache', e);
    }
  }, []);

  const mergeRecentOwnPosts = useCallback((
    userId: string | null,
    built: TimelinePost[],
    prev: TimelinePost[],
    windowMs: number
  ): TimelinePost[] => {
    if (!userId || userId === 'me') return built;
    const builtIds = new Set(built.map(p => p.id));
    const cutoff = Date.now() - windowMs;
    const kept = prev.filter(p => {
      const authorId = p.author?.id;
      const isOwn = authorId === userId || authorId === 'me';
      if (!isOwn) return false;
      if (builtIds.has(p.id)) return false;
      const created = new Date(p.createdAt).getTime();
      // 自分のイベント投稿はバックエンド側のデータ不整合があっても極力消さないように固定する
      if (p.type === 'event') return true;
      return created >= cutoff;
    });
    const merged = [...kept, ...built];
    merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return merged;
  }, []);

  useEffect(() => {
    const loadSupabaseData = async () => {
      try {
        let userId: string | null = null;
        try {
          const { data: { user } } = await supabase.auth.getUser();
          userId = user?.id ?? null;
        } catch (authErr) {
          console.log('ChessProvider: auth.getUser failed (non-blocking)', authErr);
        }

        if (!userId) {
          console.log('ChessProvider: No authenticated user, setting profileLoaded=true for anonymous use');
          setProfileLoaded(true);
        }

        if (userId) {
          setCurrentUserId(userId);
        }

        if (userId) {
          await supabaseNoAuth.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', userId);

          const { data: profileData, error: profileError } = await supabaseNoAuth
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

          if (profileData && !profileError) {
            console.log('ChessProvider: Loaded profile from Supabase', profileData.name);
            setProfile({
              id: userId,
              name: profileData.name ?? '',
              email: profileData.email ?? '',
              avatar: resolveAvatarUrl(profileData.avatar, profileData.name),
              bio: profileData.bio ?? '',
              bioEn: '',
              rating: profileData.rating ?? 0,
              chessComRating: profileData.chess_com_rating ?? null,
              lichessRating: profileData.lichess_rating ?? null,
              skillLevel: (profileData.skill_level as SkillLevel) ?? 'beginner',
              preferredTimeControl: profileData.preferred_time_control ?? '15+10',
              location: profileData.location ?? '',
              joinedDate: profileData.created_at ? new Date(profileData.created_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' }) : '',
              languages: profileData.languages ?? [],
              country: profileData.country ?? undefined,
              gamesPlayed: profileData.games_played ?? 0,
              wins: profileData.wins ?? 0,
              losses: profileData.losses ?? 0,
              draws: profileData.draws ?? 0,
              distance: 0,
              isOnline: true,
              lastActive: '',
              coordinates: {
                latitude: profileData.latitude ?? 0,
                longitude: profileData.longitude ?? 0,
              },
              playStyles: (profileData.play_styles as PlayStyle[]) ?? [],
            });
            setProfileLoaded(true);
          } else {
            console.log('ChessProvider: No profile found in Supabase, using defaults');
            setProfileLoaded(true);
          }
        }

        const safeUserId = userId ?? 'no-user';
        const { data: nearbyProfiles, error: nearbyError } = await supabaseNoAuth
          .from('profiles')
          .select('*')
          .neq('id', safeUserId);

        if (nearbyProfiles && !nearbyError && nearbyProfiles.length > 0) {
          const userLat = userLocation?.latitude;
          const userLon = userLocation?.longitude;
          const converted = nearbyProfiles.map((p: SupabaseProfile) =>
            supabaseProfileToPlayer(p, userLat, userLon)
          );
          setSupabasePlayers(converted);
          console.log('ChessProvider: Loaded', converted.length, 'players from Supabase');

          const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
          const activeCount = nearbyProfiles.filter((p: SupabaseProfile) =>
            p.last_seen && p.last_seen > fifteenMinAgo
          ).length;
          setActiveUsersCount(activeCount + 1);
        }

        let blockedIds: string[] = [];
        if (userId) {
          const { data: blocksData } = await supabase
            .from('blocks')
            .select('blocked_id')
            .eq('blocker_id', userId);
          blockedIds = (blocksData ?? []).map((b: { blocked_id: string }) => b.blocked_id);
        }
        setBlockedUsers(blockedIds);
        console.log('ChessProvider: Loaded', blockedIds.length, 'blocked users');

        if (userId) {
        const { data: matchData, error: matchError } = await supabase
          .from('matches')
          .select('*')
          .or(`requester_id.eq.${userId},opponent_id.eq.${userId}`)
          .order('requested_at', { ascending: false });

        if (matchData && !matchError && matchData.length > 0) {
          console.log('ChessProvider: Loaded', matchData.length, 'matches from Supabase');
          const supabaseMatches = await Promise.all(
            matchData.map(async (m: SupabaseMatch) => {
              const isIncoming = m.opponent_id === userId;
              const opponentId = isIncoming ? m.requester_id : m.opponent_id;

              let opponent = await fetchPlayerProfile(opponentId);

              if (!opponent) {
                opponent = {
                  id: opponentId,
                  name: 'Unknown',
                  avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face',
                  rating: 0,
                  chessComRating: null,
                  lichessRating: null,
                  skillLevel: 'beginner' as SkillLevel,
                  gamesPlayed: 0,
                  wins: 0,
                  losses: 0,
                  draws: 0,
                  distance: 0,
                  isOnline: false,
                  lastActive: '',
                  bio: '',
                  bioEn: '',
                  preferredTimeControl: '15+10',
                  location: '',
                  coordinates: { latitude: 0, longitude: 0 },
                  languages: [],
                };
              }

              const matchResult = m.result as 'win' | 'loss' | 'draw' | undefined;
              let localResult = matchResult;
              if (matchResult && m.winner_id) {
                if (matchResult === 'draw') {
                  localResult = 'draw';
                } else {
                  localResult = m.winner_id === userId ? 'win' : 'loss';
                }
              }

              return {
                id: m.id,
                opponent,
                status: m.status as MatchStatus,
                requestedAt: m.requested_at,
                scheduledAt: m.scheduled_at,
                location: m.location,
                timeControl: m.time_control,
                result: localResult,
                isIncoming,
              } as Match;
            })
          );

          setMatches(supabaseMatches);
        }
        }

        const { data: postsData, error: postsError } = await supabase
          .from('posts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        let eventsData: Record<string, unknown>[] = [];
        if (postsError) {
          console.log('ChessProvider: posts fetch error, keeping previous timeline', postsError.message);
        } else if (postsData && postsData.length > 0) {
          const postIds = postsData.map((p: SupabasePost) => p.id);
          const { data: eventsRaw, error: eventsErr } = await supabase.from('events').select('*').in('post_id', postIds);
          if (eventsErr) console.log('ChessProvider: load events error', eventsErr.message);
          eventsData = (eventsRaw ?? []).filter((e: Record<string, unknown>) =>
            postIds.includes(String(e.post_id ?? ''))
          );
        }

        if (postsData && postsData.length > 0) {
          const postIds = postsData.map((p: SupabasePost) => p.id);

          const { data: commentsData } = await supabase
            .from('comments')
            .select('*')
            .in('post_id', postIds)
            .order('created_at', { ascending: true });

          const { data: likesData } = await supabase
            .from('post_likes')
            .select('post_id, user_id')
            .in('post_id', postIds);

          const eventIds = eventsData.map((e: Record<string, unknown>) => e.id as string);
          let eventParticipantsData: { event_id: string; user_id: string }[] = [];
          if (eventIds.length > 0) {
            const { data: epData } = await supabase
              .from('event_participants')
              .select('event_id, user_id')
              .in('event_id', eventIds);
            eventParticipantsData = epData ?? [];
          }

        let built = await buildTimelinePosts(
          postsData,
          commentsData ?? [],
          likesData ?? [],
          eventsData ?? [],
          eventParticipantsData,
          blockedIds
        );
        built = await fillMissingEventDetails(built, postsData, supabase);
        setTimelinePosts(prev =>
          applyEventCacheToPosts(mergeRecentOwnPosts(userId, built, prev, RECENT_OWN_POST_WINDOW_MS), prev)
        );
        console.log('ChessProvider: Loaded', built.length, 'timeline posts from Supabase');
        } else if (postsData && postsData.length === 0) {
          setTimelinePosts(prev => {
            const merged = mergeRecentOwnPosts(userId, [], prev, RECENT_OWN_POST_WINDOW_MS);
            const result = merged.length > 0 ? merged : [];
            return applyEventCacheToPosts(result, prev);
          });
        }
        /* postsError の場合は既存 timeline を維持（他プレイヤー投稿が消えないようにする） */

        if (userId) {
        const { data: notifsData } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50);

        if (notifsData && notifsData.length > 0) {
          const mapped: AppNotification[] = notifsData.map((n: SupabaseNotification) => ({
            id: n.id,
            type: n.type as AppNotification['type'],
            title: n.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            message: n.content,
            createdAt: n.created_at,
            read: n.is_read,
            relatedId: n.related_id ?? undefined,
          }));
          setNotifications((prev) => {
            const dbIds = new Set(mapped.map((n) => n.id));
            const fromRealtimeOnly = prev.filter((n) => !dbIds.has(n.id));
            const merged = [...mapped, ...fromRealtimeOnly];
            merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            return merged.slice(0, 50);
          });
          console.log('ChessProvider: Loaded', mapped.length, 'notifications from Supabase');
        }
        }
      } catch (e) {
        console.log('ChessProvider: Supabase data load failed', e);
      }
    };
    loadSupabaseData();
  }, [userLocation, authReady, fetchPlayerProfile, buildTimelinePosts, mergeRecentOwnPosts, applyEventCacheToPosts]);

  const reloadProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData, error } = await supabaseNoAuth
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileData && !error) {
        setProfile({
          id: user.id,
          name: profileData.name ?? user.user_metadata?.username ?? 'Player',
          email: profileData.email ?? user.email ?? '',
          avatar: resolveAvatarUrl(profileData.avatar, profileData.name),
          bio: profileData.bio ?? '',
          bioEn: '',
          rating: profileData.rating ?? 0,
          chessComRating: profileData.chess_com_rating ?? null,
          lichessRating: profileData.lichess_rating ?? null,
          skillLevel: (profileData.skill_level as SkillLevel) ?? 'beginner',
          preferredTimeControl: profileData.preferred_time_control ?? '15+10',
          location: profileData.location ?? '',
          joinedDate: profileData.created_at ? new Date(profileData.created_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' }) : '',
          languages: profileData.languages ?? [],
          country: profileData.country ?? undefined,
          gamesPlayed: profileData.games_played ?? 0,
          wins: profileData.wins ?? 0,
          losses: profileData.losses ?? 0,
          draws: profileData.draws ?? 0,
          playStyles: (profileData.play_styles as PlayStyle[]) ?? [],
          distance: 0,
          isOnline: true,
          lastActive: '',
          coordinates: {
            latitude: profileData.latitude ?? 0,
            longitude: profileData.longitude ?? 0,
          },
        });
        console.log('ChessProvider: Profile reloaded from Supabase');
      }
    } catch (e) {
      console.log('ChessProvider: Profile reload failed', e);
    }
  }, []);

  useEffect(() => {
    const updateLastSeen = async () => {
      if (!currentUserId || currentUserId === 'me') return;
      try {
        await supabaseNoAuth.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', currentUserId);
      } catch (e) {
        console.log('ChessProvider: last_seen update failed', e);
      }
    };

    lastSeenInterval.current = setInterval(updateLastSeen, 5 * 60 * 1000);
    return () => {
      if (lastSeenInterval.current) clearInterval(lastSeenInterval.current);
    };
  }, [currentUserId]);

  const fetchUnreadCountByUser = useCallback(async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('room_id, sender_id')
        .ilike('room_id', `%${uid}%`)
        .neq('sender_id', uid)
        .eq('is_read', false);

      if (error || !data) return {};
      const byOther: Record<string, number> = {};
      data.forEach((row: { room_id: string; sender_id: string }) => {
        const parts = row.room_id.split('_');
        const otherId = parts.find(p => p !== uid);
        if (otherId) {
          byOther[otherId] = (byOther[otherId] ?? 0) + 1;
        }
      });
      return byOther;
    } catch (e) {
      console.log('fetchUnreadCountByUser failed', e);
      return {};
    }
  }, []);

  useEffect(() => {
    if (!currentUserId || currentUserId === 'me') {
      setUnreadCountByUserId({});
      return;
    }
    let mounted = true;
    const run = async () => {
      const byUser = await fetchUnreadCountByUser(currentUserId);
      if (mounted) setUnreadCountByUserId(byUser);
    };
    run();
    return () => { mounted = false; };
  }, [currentUserId, fetchUnreadCountByUser]);

  /** メッセージ詳細で既読にした直後に呼び、タブバッジ・未読数を即時同期する */
  const refreshUnreadMessageCounts = useCallback(async () => {
    if (!currentUserId || currentUserId === 'me') return;
    const byUser = await fetchUnreadCountByUser(currentUserId);
    setUnreadCountByUserId(byUser);
  }, [currentUserId, fetchUnreadCountByUser]);

  useEffect(() => {
    const messagesChannel = supabase
      .channel('messages-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const msg = payload.new as { room_id: string; sender_id: string; content: string };
        if (!currentUserId || msg.sender_id === currentUserId) return;
        if (!msg.room_id.includes(currentUserId)) return;
        setUnreadCountByUserId(prev => ({ ...prev, [msg.sender_id]: (prev[msg.sender_id] ?? 0) + 1 }));
        playMessageNotificationSound();
        try {
          const sender = await fetchPlayerProfile(msg.sender_id);
          const preview = (msg.content || '').startsWith('__IMG__') ? '📷 画像' : (msg.content || '').substring(0, 60);
          const content = sender ? `${sender.name}: ${preview}` : `New message: ${preview}`;
          await supabase.from('notifications').insert({
            user_id: currentUserId,
            type: 'new_message',
            content,
            related_id: msg.room_id,
          });
        } catch (e) {
          console.log('Insert message notification failed', e);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, async () => {
        if (!currentUserId) return;
        const byUser = await fetchUnreadCountByUser(currentUserId);
        setUnreadCountByUserId(byUser);
      })
      .subscribe((status) => {
        console.log('Realtime: Messages subscription status:', status);
      });

    const matchesChannel = supabase
      .channel('matches-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, (payload) => {
        console.log('Realtime: Match change received', payload.eventType);
        if (payload.eventType === 'UPDATE' && payload.new) {
          const updated = payload.new as Record<string, unknown>;
          const matchId = updated.id as string;
          const newStatus = updated.status as MatchStatus;

          setMatches(prev =>
            prev.map(m =>
              m.id === matchId ? { ...m, status: newStatus } : m
            )
          );

          if (newStatus === 'accepted' || newStatus === 'declined') {
            const notif: AppNotification = {
              id: `n_rt_${Date.now()}`,
              type: newStatus === 'accepted' ? 'match_accepted' : 'match_declined',
              title: newStatus === 'accepted' ? 'Match Accepted' : 'Match Declined',
              message: newStatus === 'accepted'
                ? 'Your match request was accepted'
                : 'Your match request was declined',
              createdAt: new Date().toISOString(),
              read: false,
              relatedId: matchId,
            };
            setNotifications(prev => [notif, ...prev]);
          }
        }

        if (payload.eventType === 'INSERT' && payload.new) {
          const newMatch = payload.new as Record<string, unknown>;
          if (currentUserId && newMatch.opponent_id === currentUserId) {
            const requesterId = newMatch.requester_id as string;
            fetchPlayerProfile(requesterId).then(opponent => {
              if (!opponent) return;
              const match: Match = {
                id: newMatch.id as string,
                opponent,
                status: (newMatch.status as MatchStatus) ?? 'pending',
                requestedAt: (newMatch.requested_at as string) ?? new Date().toISOString(),
                timeControl: (newMatch.time_control as string) ?? '15+10',
                isIncoming: true,
                scheduledAt: newMatch.scheduled_at as string | undefined,
                location: newMatch.location as string | undefined,
              };
              setMatches(prev => {
                if (prev.some(m => m.id === match.id)) return prev;
                return [match, ...prev];
              });
              console.log('Realtime: New incoming match added from', opponent.name);

              const notif: AppNotification = {
                id: `n_mr_${Date.now()}`,
                type: 'match_request',
                title: 'Match Request',
                message: opponent.name,
                createdAt: new Date().toISOString(),
                read: false,
                relatedId: newMatch.id as string,
              };
              setNotifications(prev => [notif, ...prev]);
            });
          }
        }
      })
      .subscribe((status) => {
        console.log('Realtime: Matches subscription status:', status);
      });

    const profilesChannel = supabase
      .channel('profiles-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (payload) => {
        console.log('Realtime: Profile change received', payload.eventType);
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newProfile = payload.new as SupabaseProfile;

          if (currentUserId && newProfile.id === currentUserId) {
            setProfile(prev => ({
              ...prev,
              rating: newProfile.rating ?? prev.rating,
              gamesPlayed: newProfile.games_played ?? prev.gamesPlayed,
              wins: newProfile.wins ?? prev.wins,
              losses: newProfile.losses ?? prev.losses,
              draws: newProfile.draws ?? prev.draws,
              avatar: newProfile.avatar ? resolveAvatarUrl(newProfile.avatar, newProfile.name) : prev.avatar,
            }));
          }

          const userLat = userLocation?.latitude;
          const userLon = userLocation?.longitude;
          const player = supabaseProfileToPlayer(newProfile, userLat, userLon);
          profileCacheRef.current.set(player.id, player);
          setSupabasePlayers(prev => {
            const existing = prev.findIndex(p => p.id === player.id);
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = player;
              return updated;
            }
            return [...prev, player];
          });
        }
      })
      .subscribe((status) => {
        console.log('Realtime: Profiles subscription status:', status);
      });

    const notificationsChannel = currentUserId ? supabase
      .channel('notifications-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${currentUserId}`,
      }, (payload) => {
        console.log('Realtime: Notification received', payload.new);
        const n = payload.new as SupabaseNotification;
        const notif: AppNotification = {
          id: n.id,
          type: n.type as AppNotification['type'],
          title: n.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          message: n.content,
          createdAt: n.created_at,
          read: n.is_read,
          relatedId: n.related_id ?? undefined,
        };
        setNotifications(prev => [notif, ...prev]);
      })
      .subscribe((status) => {
        console.log('Realtime: Notifications subscription status:', status);
      }) : null;

    const postsChannel = currentUserId ? supabase
      .channel('posts-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'posts',
      }, (payload) => {
        const row = payload.new as SupabasePost;
        if (row.user_id !== currentUserId) {
          refreshTimelineRef.current?.();
          return;
        }
        setTimelinePosts(prev => {
          if (prev.some(p => p.id === row.id)) return prev;
          const author = { ...profile, distance: 0 };
          const isEvent = (row.type as string) === 'event';
          const newPost: TimelinePost = {
            id: row.id,
            author,
            type: (row.type as TimelinePost['type']) ?? 'general',
            content: row.content,
            imageUrl: row.image_url ?? undefined,
            templateType: row.template_type ?? undefined,
            createdAt: row.created_at ?? new Date().toISOString(),
            likes: [],
            comments: [],
          };
          if (isEvent) {
            refreshTimelineRef.current?.();
            return prev;
          }
          return [newPost, ...prev];
        });
      })
      .subscribe((status) => {
        console.log('Realtime: Posts subscription status:', status);
      }) : null;

    const eventsChannel = currentUserId ? supabase
      .channel('events-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'events',
      }, () => {
        refreshTimelineRef.current?.();
      })
      .subscribe((status) => {
        console.log('Realtime: Events subscription status:', status);
      }) : null;

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(matchesChannel);
      supabase.removeChannel(profilesChannel);
      if (notificationsChannel) supabase.removeChannel(notificationsChannel);
      if (postsChannel) supabase.removeChannel(postsChannel);
      if (eventsChannel) supabase.removeChannel(eventsChannel);
    };
  }, [userLocation, currentUserId, fetchPlayerProfile, fetchUnreadCountByUser, profile]);

  const players = useMemo(() => {
    return supabasePlayers.filter(p => !blockedUsers.includes(p.id));
  }, [blockedUsers, supabasePlayers]);

  const nearbyPlayers = useMemo(() => {
    if (!userLocation) return players;
    return players.filter(p => p.distance <= 50).sort((a, b) => a.distance - b.distance);
  }, [players, userLocation]);

  const refreshPlayers = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: nearbyProfiles, error } = await supabaseNoAuth
        .from('profiles')
        .select('*')
        .neq('id', user.id);

      if (nearbyProfiles && !error) {
        const userLat = userLocation?.latitude;
        const userLon = userLocation?.longitude;
        const converted = nearbyProfiles.map((p: SupabaseProfile) =>
          supabaseProfileToPlayer(p, userLat, userLon)
        );
        setSupabasePlayers(converted);

        const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const activeCount = nearbyProfiles.filter((p: SupabaseProfile) =>
          p.last_seen && p.last_seen > fifteenMinAgo
        ).length;
        setActiveUsersCount(activeCount + 1);

        console.log('ChessProvider: Refreshed', converted.length, 'players from Supabase');
      }
    } catch (e) {
      console.log('ChessProvider: Refresh failed', e);
    }
  }, [userLocation]);

  const refreshTimeline = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? null;

      // posts と events は必ず別々に取得（結合はキー名の不整合を招くため廃止）
      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (postsError || !postsData?.length) {
        if (postsError) console.log('ChessProvider: refresh posts error', postsError.message);
        if (postsData?.length === 0) {
          setTimelinePosts(prev => {
            const merged = mergeRecentOwnPosts(userId, [], prev, RECENT_OWN_POST_WINDOW_MS);
            return applyEventCacheToPosts(merged.length > 0 ? merged : [], prev);
          });
        }
        return;
      }

      const postIds = postsData.map((p: SupabasePost) => p.id);
      const { data: eventsRaw, error: eventsErr } = await supabase
        .from('events')
        .select('*')
        .in('post_id', postIds);
      if (eventsErr) console.log('[EVENT_DEBUG] events fetch error', eventsErr.message);
      const eventsData: Record<string, unknown>[] = (eventsRaw ?? []).filter((e: Record<string, unknown>) =>
        postIds.includes(String(e.post_id ?? ''))
      );
      if (postsData.length > 0) {
        const { data: commentsData } = await supabase
          .from('comments')
          .select('*')
          .in('post_id', postIds)
          .order('created_at', { ascending: true });

        const { data: likesData } = await supabase
          .from('post_likes')
          .select('post_id, user_id')
          .in('post_id', postIds);

        const eventIds = eventsData.map((e: Record<string, unknown>) => e.id as string);
        let epData: { event_id: string; user_id: string }[] = [];
        if (eventIds.length > 0) {
          const { data } = await supabase
            .from('event_participants')
            .select('event_id, user_id')
            .in('event_id', eventIds);
          epData = data ?? [];
        }

        let built = await buildTimelinePosts(
          postsData,
          commentsData ?? [],
          likesData ?? [],
          eventsData,
          epData,
          blockedUsers
        );
        built = await fillMissingEventDetails(built, postsData, supabase);
        const eventCount = built.filter(p => p.event).length;
        if (eventCount > 0) {
          console.log('[EVENT_VERIFY] Timeline built:', built.length, 'posts,', eventCount, 'with event | samples:', built.filter(p => p.event).slice(0, 3).map(p => ({ id: p.id, title: p.event?.title, deadlineAt: p.event?.deadlineAt ?? 'none' })));
        }
        setTimelinePosts(prev =>
          applyEventCacheToPosts(mergeRecentOwnPosts(userId, built, prev, RECENT_OWN_POST_WINDOW_MS), prev)
        );
        console.log('ChessProvider: Timeline refreshed with', built.length, 'posts');

        if (userId) {
          const now = new Date();
          const existingDeadlineNotifs = new Set(
            notifications
              .filter(n => n.type === 'event_deadline_passed' && n.relatedId)
              .map(n => n.relatedId as string)
          );
          for (const post of built) {
            if (post.type !== 'event' || !post.event) continue;
            if (post.author.id !== userId) continue;
            if (!post.event.deadlineAt || post.event.isClosed) continue;
            const deadline = new Date(post.event.deadlineAt);
            if (deadline <= now && !existingDeadlineNotifs.has(post.id)) {
              await supabase.from('notifications').insert({
                user_id: userId,
                type: 'event_deadline_passed',
                content: `イベント「${post.event.title}」の募集締切を過ぎました`,
                related_id: post.id,
              });
            }
          }
        }
      } else {
        setTimelinePosts(prev => {
          const merged = mergeRecentOwnPosts(userId, [], prev, RECENT_OWN_POST_WINDOW_MS);
          const result = merged.length > 0 ? merged : [];
          return applyEventCacheToPosts(result, prev);
        });
      }
    } catch (e) {
      console.log('ChessProvider: Timeline refresh failed', e);
    }
  }, [blockedUsers, buildTimelinePosts, notifications, mergeRecentOwnPosts, applyEventCacheToPosts]);

  refreshTimelineRef.current = refreshTimeline;

  const changeLanguage = useCallback(async (lang: Language) => {
    setLanguage(lang);
    try {
      await AsyncStorage.setItem(LANGUAGE_KEY, lang);
    } catch (e) {
      console.log('ChessProvider: Failed to save language', e);
    }
    console.log('Language changed to', lang);
  }, []);

  const toggleLanguage = useCallback(() => {
    const newLang = language === 'ja' ? 'en' : 'ja';
    changeLanguage(newLang);
  }, [language, changeLanguage]);

  const sendMatchRequest = useCallback(async (player: Player, timeControl: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('Match request failed: No authenticated user');
      return;
    }

    const now = new Date().toISOString();

    try {
      const { data: insertedMatch, error: insertError } = await supabase.from('matches').insert({
        requester_id: user.id,
        opponent_id: player.id,
        status: 'pending',
        time_control: timeControl,
        requested_at: now,
      }).select().single();

      if (insertError || !insertedMatch) {
        console.log('Match request insert error:', insertError?.message);
        return;
      }

      const matchId = insertedMatch.id;
      const newMatch: Match = {
        id: matchId,
        opponent: player,
        status: 'pending',
        requestedAt: now,
        timeControl,
        isIncoming: false,
      };
      setMatches(prev => [newMatch, ...prev]);
      console.log('Match request sent to', player.name, 'id:', matchId);

      notifyMatchRequest(player.id, profile.name).catch(e =>
        console.log('Push notification failed (non-blocking)', e)
      );
    } catch (e) {
      console.log('Match request failed', e);
    }
  }, [profile.name]);

  const respondToMatch = useCallback(async (matchId: string, accept: boolean) => {
    const newStatus = (accept ? 'accepted' : 'declined') as MatchStatus;
    const match = matches.find(m => m.id === matchId);

    setMatches(prev =>
      prev.map(m => m.id === matchId ? { ...m, status: newStatus } : m)
    );
    console.log('Match', matchId, accept ? 'accepted' : 'declined');

    try {
      await supabase.from('matches').update({ status: newStatus }).eq('id', matchId);
      console.log('Match response synced to Supabase');

      if (match?.opponent) {
        const { data: { user } } = await supabase.auth.getUser();
        const requesterId = match.isIncoming ? match.opponent.id : (user?.id ?? 'me');

        notifyMatchResponse(
          requesterId !== (user?.id ?? 'me') ? requesterId : match.opponent.id,
          profile.name,
          accept
        ).catch(e => console.log('Push notification failed (non-blocking)', e));
      }
    } catch (e) {
      console.log('Match response Supabase sync failed', e);
    }
  }, [matches, profile.name]);

  const cancelMatch = useCallback(async (matchId: string) => {
    setMatches(prev =>
      prev.map(m => m.id === matchId ? { ...m, status: 'cancelled' as MatchStatus } : m)
    );
    console.log('Match cancelled', matchId);

    try {
      await supabase.from('matches').update({ status: 'cancelled' }).eq('id', matchId);
    } catch (e) {
      console.log('Match cancel Supabase sync failed', e);
    }
  }, []);

  const rateMatch = useCallback(async (matchId: string, rating: MatchRating) => {
    setMatches(prev =>
      prev.map(m => m.id === matchId ? { ...m, rating } : m)
    );
    console.log('Match rated', matchId, rating);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('match_ratings').insert({
        match_id: matchId,
        rater_id: user?.id,
        sportsmanship: rating.sportsmanship,
        skill_accuracy: rating.skillAccuracy,
        punctuality: rating.punctuality,
        comment: rating.comment,
      });
    } catch (e) {
      console.log('Match rating Supabase sync failed', e);
    }
  }, []);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>): Promise<boolean> => {
    setProfile(prev => ({ ...prev, ...updates }));
    console.log('Profile updated locally', updates);

    try {
      let userId: string | null = currentUserId;

      if (!userId || userId === 'me') {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          userId = session?.user?.id ?? null;
        } catch (authErr) {
          console.log('Profile update: getSession failed (non-blocking)', authErr);
        }
      }

      if (!userId || userId === 'me') {
        userId = profile.id !== 'me' ? profile.id : null;
      }

      if (!userId || userId === 'me') {
        const fallbackId = 'anonymous-' + Date.now();
        console.log('Profile update: No user ID available, using fallback', fallbackId);
        userId = fallbackId;
      }

      const supabaseUpdates: Record<string, unknown> = {};
      if (updates.name !== undefined) supabaseUpdates.name = updates.name;
      if (updates.bio !== undefined) supabaseUpdates.bio = updates.bio;
      if (updates.location !== undefined) supabaseUpdates.location = updates.location;
      if (updates.avatar !== undefined) supabaseUpdates.avatar = updates.avatar;
      if (updates.skillLevel !== undefined) supabaseUpdates.skill_level = updates.skillLevel;
      if (updates.preferredTimeControl !== undefined) supabaseUpdates.preferred_time_control = updates.preferredTimeControl;
      if (updates.chessComRating !== undefined) supabaseUpdates.chess_com_rating = updates.chessComRating;
      if (updates.lichessRating !== undefined) supabaseUpdates.lichess_rating = updates.lichessRating;
      if (updates.rating !== undefined) supabaseUpdates.rating = updates.rating;
      if (updates.country !== undefined) supabaseUpdates.country = updates.country;
      if (updates.languages !== undefined) supabaseUpdates.languages = updates.languages;
      if (updates.playStyles !== undefined) supabaseUpdates.play_styles = updates.playStyles;
      if (updates.coordinates !== undefined) {
        supabaseUpdates.latitude = updates.coordinates.latitude;
        supabaseUpdates.longitude = updates.coordinates.longitude;
      }

      if (Object.keys(supabaseUpdates).length > 0) {
        supabaseUpdates.id = userId;
        supabaseUpdates.last_seen = new Date().toISOString();
        console.log('Profile upsert payload:', JSON.stringify(supabaseUpdates));

        const { data, error } = await supabaseNoAuth.from('profiles').upsert(supabaseUpdates).select();

        if (error) {
          console.log('SAVE FAILED:', error.code, error.message, error.details, error.hint);
          return false;
        }
        console.log('SAVE DONE');
        console.log('Save successful:', JSON.stringify(data));
        return true;
      }
      return true;
    } catch (e) {
      console.log('Profile Supabase sync failed', e);

      try {
        console.log('Attempting emergency save with no-auth client...');
        await clearStaleSession();
        const emergencyId = currentUserId && currentUserId !== 'me' ? currentUserId : (profile.id !== 'me' ? profile.id : 'anonymous-' + Date.now());
        const payload: Record<string, unknown> = { id: emergencyId, last_seen: new Date().toISOString() };
        if (updates.name !== undefined) payload.name = updates.name;
        if (updates.bio !== undefined) payload.bio = updates.bio;
        if (updates.location !== undefined) payload.location = updates.location;
        if (updates.avatar !== undefined) payload.avatar = updates.avatar;
        if (updates.skillLevel !== undefined) payload.skill_level = updates.skillLevel;
        if (updates.preferredTimeControl !== undefined) payload.preferred_time_control = updates.preferredTimeControl;
        if (updates.chessComRating !== undefined) payload.chess_com_rating = updates.chessComRating;
        if (updates.lichessRating !== undefined) payload.lichess_rating = updates.lichessRating;
        if (updates.rating !== undefined) payload.rating = updates.rating;
        if (updates.country !== undefined) payload.country = updates.country;
        if (updates.languages !== undefined) payload.languages = updates.languages;
        if (updates.playStyles !== undefined) payload.play_styles = updates.playStyles;

        const { data: emergData, error: emergError } = await supabaseNoAuth.from('profiles').upsert(payload).select();
        if (emergError) {
          console.log('EMERGENCY SAVE FAILED:', emergError.code, emergError.message);
          return false;
        }
        console.log('EMERGENCY SAVE DONE:', JSON.stringify(emergData));
        return true;
      } catch (emergE) {
        console.log('EMERGENCY SAVE EXCEPTION:', emergE);
        return false;
      }
    }
  }, [currentUserId, profile.id]);

  const updateRatingAfterResult = useCallback(async (
    myResult: 'win' | 'loss' | 'draw',
    opponentId: string
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const myRating = profile.rating || 1200;

      const { data: opponentProfile } = await supabaseNoAuth
        .from('profiles')
        .select('rating, games_played, wins, losses, draws')
        .eq('id', opponentId)
        .single();

      const opponentRating = opponentProfile?.rating || 1200;
      const isDraw = myResult === 'draw';

      let eloResult: { winnerNew: number; loserNew: number };

      if (isDraw) {
        eloResult = calculateElo(myRating, opponentRating, true);
      } else if (myResult === 'win') {
        eloResult = calculateElo(myRating, opponentRating, false);
      } else {
        eloResult = calculateElo(opponentRating, myRating, false);
      }

      const myNewRating = myResult === 'win' ? eloResult.winnerNew :
                          myResult === 'loss' ? eloResult.loserNew :
                          eloResult.winnerNew;
      const opponentNewRating = myResult === 'win' ? eloResult.loserNew :
                                myResult === 'loss' ? eloResult.winnerNew :
                                eloResult.loserNew;

      const myUpdate: Record<string, unknown> = {
        rating: Math.max(0, myNewRating),
        games_played: (profile.gamesPlayed || 0) + 1,
      };

      if (myResult === 'win') myUpdate.wins = (profile.wins || 0) + 1;
      else if (myResult === 'loss') myUpdate.losses = (profile.losses || 0) + 1;
      else myUpdate.draws = (profile.draws || 0) + 1;

      await supabaseNoAuth.from('profiles').update(myUpdate).eq('id', user.id);

      setProfile(prev => ({
        ...prev,
        rating: Math.max(0, myNewRating),
        gamesPlayed: (prev.gamesPlayed || 0) + 1,
        wins: myResult === 'win' ? (prev.wins || 0) + 1 : prev.wins,
        losses: myResult === 'loss' ? (prev.losses || 0) + 1 : prev.losses,
        draws: myResult === 'draw' ? (prev.draws || 0) + 1 : prev.draws,
      }));

      const opUpdate: Record<string, unknown> = {
        rating: Math.max(0, opponentNewRating),
        games_played: (opponentProfile?.games_played || 0) + 1,
      };
      const opResult = myResult === 'win' ? 'loss' : myResult === 'loss' ? 'win' : 'draw';
      if (opResult === 'win') opUpdate.wins = (opponentProfile?.wins || 0) + 1;
      else if (opResult === 'loss') opUpdate.losses = (opponentProfile?.losses || 0) + 1;
      else opUpdate.draws = (opponentProfile?.draws || 0) + 1;

      await supabaseNoAuth.from('profiles').update(opUpdate).eq('id', opponentId);

      console.log('Elo updated: Me', myRating, '->', myNewRating, '| Opponent', opponentRating, '->', opponentNewRating);
    } catch (e) {
      console.log('Rating update failed', e);
    }
  }, [profile]);

  const submitResultReport = useCallback(async (matchId: string, result: 'win' | 'loss' | 'draw') => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const report: MatchResultReport = {
      id: `rr_${Date.now()}`,
      matchId,
      reporterId: currentUserId ?? 'me',
      reporterName: profile.name,
      result,
      opponentId: match.opponent.id,
      opponentName: match.opponent.name,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    setResultReports(prev => [report, ...prev]);

    const notification: AppNotification = {
      id: `n_${Date.now()}`,
      type: 'result_report',
      title: 'Result Reported',
      message: match.opponent.name,
      createdAt: new Date().toISOString(),
      read: false,
      relatedId: report.id,
    };
    setNotifications(prev => [notification, ...prev]);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? 'me';

      const winnerId = result === 'win' ? userId :
                       result === 'loss' ? match.opponent.id :
                       null;

      await supabase.from('matches').update({
        status: 'completed',
        result: result === 'draw' ? 'draw' : 'decisive',
        winner_id: winnerId,
      }).eq('id', matchId);

      console.log('Match result synced to Supabase:', matchId, result);

      await updateRatingAfterResult(result, match.opponent.id);

      setResultReports(prev =>
        prev.map(r => r.id === report.id ? { ...r, status: 'confirmed' as const } : r)
      );
      setMatches(prev =>
        prev.map(m => m.id === matchId ? { ...m, status: 'completed' as MatchStatus, result } : m)
      );
    } catch (e) {
      console.log('Result report Supabase sync failed, using local fallback', e);

      setTimeout(() => {
        setResultReports(prev =>
          prev.map(r => r.id === report.id ? { ...r, status: 'confirmed' as const } : r)
        );
        setMatches(prev =>
          prev.map(m => m.id === matchId ? { ...m, status: 'completed' as MatchStatus, result } : m)
        );
      }, 3000);
    }

    console.log('Result report submitted:', report);
  }, [matches, profile.name, currentUserId, updateRatingAfterResult]);

  const toggleLike = useCallback(async (postId: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const userId = authUser?.id ?? currentUserId ?? 'me';
    setTimelinePosts(prev =>
      prev.map(post => {
        if (post.id !== postId) return post;
        const hasLiked = post.likes.includes(userId);
        return {
          ...post,
          likes: hasLiked
            ? post.likes.filter(id => id !== userId)
            : [...post.likes, userId],
        };
      })
    );

    try {
      const post = timelinePosts.find(p => p.id === postId);
      const hasLiked = post?.likes.includes(userId) ?? false;

      if (hasLiked) {
        await supabase
          .from('post_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', userId);
        console.log('Like removed from Supabase for post', postId);
      } else {
        await supabase
          .from('post_likes')
          .insert({ post_id: postId, user_id: userId });
        console.log('Like added to Supabase for post', postId);
        const { data: postRow } = await supabase.from('posts').select('user_id').eq('id', postId).single();
        const ownerId = postRow?.user_id;
        if (ownerId && ownerId !== userId) {
          const actorName = profile?.name ?? 'Someone';
          await supabase.from('notifications').insert({
            user_id: ownerId,
            type: 'post_like',
            content: `${actorName}があなたの投稿にいいねしました`,
            related_id: postId,
          });
        }
      }
    } catch (e) {
      console.log('Like sync to Supabase failed', e);
    }
  }, [currentUserId, timelinePosts, profile?.name]);

  const addComment = useCallback(async (postId: string, content: string, parentId?: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const userId = authUser?.id ?? currentUserId ?? 'me';

    const newComment: TimelineComment = {
      id: `c${Date.now()}`,
      author: { ...profile, distance: 0 },
      content,
      createdAt: new Date().toISOString(),
      parentId,
    };

    setTimelinePosts(prev =>
      prev.map(post => {
        if (post.id !== postId) return post;
        if (parentId) {
          const updatedComments = post.comments.map(c => {
            if (c.id === parentId) {
              return { ...c, replies: [...(c.replies ?? []), newComment] };
            }
            return c;
          });
          return { ...post, comments: updatedComments };
        }
        return { ...post, comments: [...post.comments, newComment] };
      })
    );

    try {
      await supabase.from('comments').insert({
        post_id: postId,
        user_id: userId,
        content,
        parent_id: parentId ?? null,
      });
      console.log('Comment synced to Supabase');
      if (parentId) {
        const actorName = profile?.name ?? 'Someone';
        const { data: postRow } = await supabase.from('posts').select('user_id').eq('id', postId).single();
        const postOwnerId = postRow?.user_id;
        if (postOwnerId && postOwnerId !== userId) {
          await supabase.from('notifications').insert({
            user_id: postOwnerId,
            type: 'post_reply',
            content: `${actorName}が返信しました`,
            related_id: postId,
          });
        }
        const { data: parentRow } = await supabase.from('comments').select('user_id').eq('id', parentId).single();
        const parentAuthorId = parentRow?.user_id;
        if (parentAuthorId && parentAuthorId !== userId && parentAuthorId !== postOwnerId) {
          await supabase.from('notifications').insert({
            user_id: parentAuthorId,
            type: 'post_reply',
            content: `${actorName}が返信しました`,
            related_id: postId,
          });
        }
      }
    } catch (e) {
      console.log('Comment sync failed', e);
    }

    console.log('Comment added to post', postId);
  }, [profile, currentUserId]);

  const blockUser = useCallback(async (userId: string) => {
    setBlockedUsers(prev => {
      if (prev.includes(userId)) return prev;
      return [...prev, userId];
    });
    console.log('User blocked:', userId);

    try {
      await supabase.from('blocks').insert({
        blocker_id: currentUserId,
        blocked_id: userId,
      });
      console.log('Block synced to Supabase');
    } catch (e) {
      console.log('Block sync failed', e);
    }
  }, [currentUserId]);

  const unblockUser = useCallback(async (userId: string) => {
    setBlockedUsers(prev => prev.filter(id => id !== userId));
    console.log('User unblocked:', userId);

    try {
      await supabase
        .from('blocks')
        .delete()
        .eq('blocker_id', currentUserId)
        .eq('blocked_id', userId);
      console.log('Unblock synced to Supabase');
    } catch (e) {
      console.log('Unblock sync failed', e);
    }
  }, [currentUserId]);

  const isUserBlocked = useCallback((userId: string) => {
    return blockedUsers.includes(userId);
  }, [blockedUsers]);

  const reportUser = useCallback(async (userId: string, reason: string) => {
    try {
      await supabase.from('reports').insert({
        reporter_id: currentUserId,
        reported_id: userId,
        reason,
      });
      console.log('Report submitted to Supabase for user', userId);
    } catch (e) {
      console.log('Report sync failed', e);
    }
  }, [currentUserId]);

  const confirmResultReport = useCallback((reportId: string) => {
    setResultReports(prev =>
      prev.map(r => r.id === reportId ? { ...r, status: 'confirmed' } : r)
    );
    const report = resultReports.find(r => r.id === reportId);
    if (report) {
      setMatches(prev =>
        prev.map(m => {
          if (m.id !== report.matchId) return m;
          const myResult = report.result === 'win' ? 'loss' : report.result === 'loss' ? 'win' : 'draw';
          return { ...m, status: 'completed' as MatchStatus, result: myResult as 'win' | 'loss' | 'draw' };
        })
      );
    }
    console.log('Result report confirmed:', reportId);
  }, [resultReports]);

  const disputeResultReport = useCallback((reportId: string) => {
    setResultReports(prev =>
      prev.map(r => r.id === reportId ? { ...r, status: 'disputed' } : r)
    );
    console.log('Result report disputed:', reportId);
  }, []);

  const markNotificationRead = useCallback(async (notifId: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === notifId ? { ...n, read: true } : n)
    );

    try {
      await supabase.from('notifications').update({ is_read: true }).eq('id', notifId);
    } catch (e) {
      console.log('Notification read sync failed', e);
    }
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));

    try {
      if (currentUserId) {
        await supabase.from('notifications').update({ is_read: true }).eq('user_id', currentUserId).eq('is_read', false);
      }
    } catch (e) {
      console.log('Mark all notifications read sync failed', e);
    }
  }, [currentUserId]);

  /** タイムライン通知画面表示時のみ呼ぶ。タイムライン関連タイプのみ既読にし、メッセージ通知は残す */
  const markTimelineNotificationsRead = useCallback(async () => {
    const types = ['post_like', 'post_reply', 'event_join', 'event_full', 'event_deadline_passed'] as const;
    setNotifications(prev =>
      prev.map(n => (types.includes(n.type as typeof types[number]) ? { ...n, read: true } : n))
    );
    try {
      if (currentUserId) {
        const { data: rows } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', currentUserId)
          .eq('is_read', false)
          .in('type', types);
        if (rows?.length) {
          await supabase.from('notifications').update({ is_read: true }).eq('user_id', currentUserId).in('type', types);
        }
      }
    } catch (e) {
      console.log('Mark timeline notifications read failed', e);
    }
  }, [currentUserId]);

  const refreshNotifications = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const { data: notifsData } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (notifsData && notifsData.length > 0) {
        const mapped: AppNotification[] = notifsData.map((n: SupabaseNotification) => ({
          id: n.id,
          type: n.type as AppNotification['type'],
          title: n.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          message: n.content,
          createdAt: n.created_at ?? '',
          read: n.is_read ?? false,
          relatedId: n.related_id ?? undefined,
        }));
        setNotifications(mapped);
      } else {
        setNotifications([]);
      }
    } catch (e) {
      console.log('refreshNotifications failed', e);
    }
  }, [currentUserId]);

  const TIMELINE_NOTIFICATION_TYPES = ['post_like', 'post_reply', 'event_join', 'event_full', 'event_deadline_passed'] as const;

  const unreadNotificationCount = useMemo(
    () => notifications.filter(n => !n.read).length,
    [notifications]
  );

  const unreadTimelineNotificationCount = useMemo(
    () => notifications.filter(n => !n.read && TIMELINE_NOTIFICATION_TYPES.includes(n.type as typeof TIMELINE_NOTIFICATION_TYPES[number])).length,
    [notifications]
  );

  const totalUnreadMessageCount = useMemo(
    () => Object.values(unreadCountByUserId).reduce((sum, n) => sum + n, 0),
    [unreadCountByUserId]
  );

  const addTimelinePost = useCallback(async (content: string, type: TimelinePost['type'] = 'general', imageUrl?: string, templateType?: string, event?: TimelineEvent) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('addTimelinePost: No authenticated user');
      return;
    }

    const tempId = `tp${Date.now()}`;

    const newPost: TimelinePost = {
      id: tempId,
      author: { ...profile, distance: 0 },
      type,
      content,
      imageUrl,
      templateType,
      event,
      createdAt: new Date().toISOString(),
      likes: [],
      comments: [],
    };
    setTimelinePosts(prev => [newPost, ...prev]);

    try {
      const { data: insertedPost, error: postError } = await supabase.from('posts').insert({
        user_id: user.id,
        content,
        image_url: imageUrl ?? null,
        template_type: templateType ?? null,
        type: type ?? 'general',
      }).select().single();

      if (postError) {
        console.log('Post insert error:', postError.message);
      } else {
        console.log('Post synced to Supabase, id:', insertedPost?.id);

        if (insertedPost) {
          setTimelinePosts(prev =>
            prev.map(p => p.id === tempId ? { ...p, id: insertedPost.id } : p)
          );
        }

        if (event && insertedPost) {
          const { data: insertedEvent, error: eventError } = await supabase
            .from('events')
            .insert({
              post_id: insertedPost.id,
              title: event.title,
              date: event.date,
              time: event.time,
              location: event.location,
              max_participants: event.maxParticipants,
              created_at: event.createdAt,
              deadline_at: event.deadlineAt != null && String(event.deadlineAt).trim() !== '' ? event.deadlineAt : null,
            })
            .select()
            .single();

          if (eventError) {
            console.log('Event insert error:', eventError.message);
          } else if (insertedEvent) {
            console.log('Event synced to Supabase, id:', insertedEvent.id);
            setTimelinePosts(prev =>
              prev.map(p => {
                if (p.id !== insertedPost.id || !p.event) return p;
                return {
                  ...p,
                  event: {
                    ...p.event,
                    id: insertedEvent.id as string,
                    createdAt: (insertedEvent.created_at as string) ?? p.event.createdAt,
                    deadlineAt: (insertedEvent.deadline_at as string | null) ?? p.event.deadlineAt,
                  },
                };
              })
            );
          }
          const cachedEvent: TimelineEvent = {
            ...event,
            id: (insertedEvent as { id?: string } | undefined)?.id ?? event.id,
            createdAt: (insertedEvent as { created_at?: string } | undefined)?.created_at ?? event.createdAt,
            deadlineAt: (insertedEvent as { deadline_at?: string | null } | undefined)?.deadline_at ?? event.deadlineAt ?? undefined,
          };
          eventCacheRef.current.set(insertedPost.id, cachedEvent);
          persistEventCache();
        }
      }
    } catch (e) {
      console.log('Post sync failed', e);
    }

    console.log('New timeline post added');
  }, [profile, persistEventCache]);

  const joinEvent = useCallback(async (postId: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const userId = authUser?.id ?? currentUserId ?? 'me';
    const post = timelinePosts.find(p => p.id === postId);
    if (post?.event) {
      const pastDeadline = post.event.deadlineAt && new Date(post.event.deadlineAt) <= new Date();
      if (pastDeadline || post.event.isClosed) return;
    }
    setTimelinePosts(prev =>
      prev.map(p => {
        if (p.id !== postId || !p.event) return p;
        const isJoined = p.event.participants.includes(userId);
        if (isJoined) return p;
        if (p.event.participants.length >= p.event.maxParticipants) return p;
        return {
          ...p,
          event: {
            ...p.event,
            participants: [...p.event.participants, userId],
          },
        };
      })
    );

    try {
      const postForDb = timelinePosts.find(p => p.id === postId);

      let eventId = postForDb?.event?.id;
      if (!eventId) {
        const { data: evRow } = await supabase
          .from('events')
          .select('id')
          .eq('post_id', postId)
          .maybeSingle();
        eventId = evRow?.id as string | undefined;
      }

      if (!eventId) {
        console.log('Event join skipped: event id not found for post', postId);
        return;
      }

      await supabase.from('event_participants').insert({
        event_id: eventId,
        user_id: userId,
      });
      console.log('Event join synced');
      const { data: evRow } = await supabase.from('events').select('post_id, max_participants').eq('id', eventId).single();
      const postIdForOwner = evRow?.post_id ?? postId;
      const { data: postRow } = await supabase.from('posts').select('user_id').eq('id', postIdForOwner).single();
      const ownerId = postRow?.user_id;
      if (ownerId && ownerId !== userId) {
        const actorName = profile?.name ?? 'Someone';
        await supabase.from('notifications').insert({
          user_id: ownerId,
          type: 'event_join',
          content: `${actorName}があなたのイベントに参加しました`,
          related_id: postIdForOwner,
        });

        if (evRow?.max_participants) {
          const { data: participants } = await supabase
            .from('event_participants')
            .select('user_id')
            .eq('event_id', eventId);
          const count = participants?.length ?? 0;
          if (count >= (evRow.max_participants as number)) {
            await supabase.from('notifications').insert({
              user_id: ownerId,
              type: 'event_full',
              content: `イベント「${postForDb?.event?.title ?? ''}」が定員に達しました`,
              related_id: postIdForOwner,
            });
          }
        }
      }
    } catch (e) {
      console.log('Event join sync failed', e);
    }
  }, [currentUserId, timelinePosts, profile?.name]);

  const leaveEvent = useCallback(async (postId: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const userId = authUser?.id ?? currentUserId ?? 'me';
    setTimelinePosts(prev =>
      prev.map(post => {
        if (post.id !== postId || !post.event) return post;
        return {
          ...post,
          event: {
            ...post.event,
            participants: post.event.participants.filter(id => id !== userId),
          },
        };
      })
    );

    try {
      const post = timelinePosts.find(p => p.id === postId);

      let eventId = post?.event?.id;
      if (!eventId) {
        const { data: evRow } = await supabase
          .from('events')
          .select('id')
          .eq('post_id', postId)
          .maybeSingle();
        eventId = evRow?.id as string | undefined;
      }

      if (!eventId) {
        console.log('Event leave skipped: event id not found for post', postId);
        return;
      }

      await supabase.from('event_participants')
        .delete()
        .eq('event_id', eventId)
        .eq('user_id', userId);
      console.log('Event leave synced');
    } catch (e) {
      console.log('Event leave sync failed', e);
    }
  }, [currentUserId, timelinePosts]);

  const deleteTimelinePost = useCallback(async (postId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setTimelinePosts(prev => prev.filter(p => p.id !== postId));
    eventCacheRef.current.delete(postId);
    persistEventCache();

    try {
      const { data: eventsForPost } = await supabase
        .from('events')
        .select('id')
        .eq('post_id', postId);
      const eventIds = (eventsForPost ?? []).map((e: { id: string }) => e.id);
      if (eventIds.length > 0) {
        await supabase.from('event_participants').delete().in('event_id', eventIds);
      }
      await supabase.from('events').delete().eq('post_id', postId);
      await supabase.from('post_likes').delete().eq('post_id', postId);
      await supabase.from('comments').delete().eq('post_id', postId);
      await supabase.from('posts').delete().eq('id', postId);
      console.log('ChessProvider: Post deleted from Supabase', postId);
    } catch (e) {
      console.log('ChessProvider: Post delete failed', e);
    }
  }, [persistEventCache]);

  const activeMatches = useMemo(
    () => matches.filter(m => m.status === 'accepted'),
    [matches]
  );

  const pendingMatches = useMemo(
    () => matches.filter(m => m.status === 'pending'),
    [matches]
  );

  const completedMatches = useMemo(
    () => matches.filter(m => m.status === 'completed'),
    [matches]
  );

  const pendingIncoming = useMemo(
    () => pendingMatches.filter(m => m.isIncoming),
    [pendingMatches]
  );

  const unratedMatches = useMemo(
    () => completedMatches.filter(m => !m.rating),
    [completedMatches]
  );

  return {
    players,
    nearbyPlayers,
    matches,
    profile,
    profileLoaded,
    language,
    activeMatches,
    pendingMatches,
    completedMatches,
    pendingIncoming,
    unratedMatches,
    timelinePosts,
    blockedUsers,
    resultReports,
    notifications,
    unreadNotificationCount,
    unreadTimelineNotificationCount,
    activeUsersCount,
    currentUserId,
    sendMatchRequest,
    respondToMatch,
    cancelMatch,
    rateMatch,
    toggleLanguage,
    changeLanguage,
    updateProfile,
    toggleLike,
    addComment,
    addTimelinePost,
    blockUser,
    unblockUser,
    isUserBlocked,
    reportUser,
    submitResultReport,
    confirmResultReport,
    disputeResultReport,
    markNotificationRead,
    markAllNotificationsRead,
    markTimelineNotificationsRead,
    refreshNotifications,
    refreshPlayers,
    refreshTimeline,
    reloadProfile,
    joinEvent,
    leaveEvent,
    deleteTimelinePost,
    fetchPlayerProfile,
    unreadCountByUserId,
    totalUnreadMessageCount,
    refreshUnreadMessageCounts,
  };
});
