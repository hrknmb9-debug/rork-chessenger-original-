import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Match, MatchStatus, MatchRating, Player, UserProfile, TimelinePost, TimelineComment, TimelineEvent, MatchResultReport, AppNotification, SkillLevel, PlayStyle } from '@/types';

import { useLocation, calculateDistance } from '@/providers/LocationProvider';
import { Language } from '@/utils/translations';
import { supabase, supabaseNoAuth, clearStaleSession } from '@/utils/supabaseClient';
import {
  calculateElo,
  notifyMatchRequest,
  notifyMatchResponse,
  notifyNewMessage,
} from '@/utils/notifications';

const LANGUAGE_KEY = 'chess_language';

interface SupabaseProfile {
  id: string;
  name?: string;
  email?: string;
  avatar?: string;
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
    avatar: profile.avatar ?? 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face',
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
  const { userLocation, getDistanceToPlayer } = useLocation();
  const lastSeenInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const profileCacheRef = useRef<Map<string, Player>>(new Map());

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

  const fetchPlayerProfile = useCallback(async (userId: string): Promise<Player | null> => {
    const cached = profileCacheRef.current.get(userId);
    if (cached) return cached;

    try {
      const { data, error } = await supabase
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
    const filteredPosts = posts.filter(p => !blockedIds.includes(p.user_id));
    const authorIds = [...new Set(filteredPosts.map(p => p.user_id))];
    const commentAuthorIds = [...new Set(allComments.map(c => c.user_id))];
    const allAuthorIds = [...new Set([...authorIds, ...commentAuthorIds])];

    const profileMap = new Map<string, Player>();
    const batchSize = 20;
    for (let i = 0; i < allAuthorIds.length; i += batchSize) {
      const batch = allAuthorIds.slice(i, i + batchSize);
      const { data: profiles } = await supabase
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

      const postType = (post.type as TimelinePost['type']) ?? 'general';

      let event: TimelineEvent | undefined;
      if (postType === 'event') {
        const eventData = allEvents.find((e: Record<string, unknown>) => e.id === post.id || e.post_id === post.id) as Record<string, unknown> | undefined;
        if (eventData) {
          const participants = allEventParticipants
            .filter(ep => ep.event_id === (eventData.id as string))
            .map(ep => ep.user_id);
          event = {
            id: eventData.id as string,
            userId: post.user_id,
            title: (eventData.title as string) ?? post.content,
            date: (eventData.date as string) ?? '',
            time: (eventData.time as string) ?? '',
            location: (eventData.location as string) ?? '',
            maxParticipants: (eventData.max_participants as number) ?? 10,
            participants,
            createdAt: (eventData.created_at as string) ?? post.created_at,
          };
        }
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
          await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', userId);

          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

          if (profileData && !profileError) {
            console.log('ChessProvider: Loaded profile from Supabase', profileData.name);
            const defaultAvatar = 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face';
            setProfile({
              id: userId,
              name: profileData.name ?? '',
              email: profileData.email ?? '',
              avatar: profileData.avatar ?? defaultAvatar,
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
        const { data: nearbyProfiles, error: nearbyError } = await supabase
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

        const { data: postsData } = await supabase
          .from('posts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

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

          const { data: eventsData } = await supabase
            .from('events')
            .select('*');

          const eventIds = (eventsData ?? []).map((e: Record<string, unknown>) => e.id as string);
          let eventParticipantsData: { event_id: string; user_id: string }[] = [];
          if (eventIds.length > 0) {
            const { data: epData } = await supabase
              .from('event_participants')
              .select('event_id, user_id')
              .in('event_id', eventIds);
            eventParticipantsData = epData ?? [];
          }

          const built = await buildTimelinePosts(
            postsData,
            commentsData ?? [],
            likesData ?? [],
            eventsData ?? [],
            eventParticipantsData,
            blockedIds
          );
          setTimelinePosts(built);
          console.log('ChessProvider: Loaded', built.length, 'timeline posts from Supabase');
        } else {
          console.log('ChessProvider: No posts found in Supabase');
        }

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
          setNotifications(mapped);
          console.log('ChessProvider: Loaded', mapped.length, 'notifications from Supabase');
        }
        }
      } catch (e) {
        console.log('ChessProvider: Supabase data load failed', e);
      }
    };
    loadSupabaseData();
  }, [userLocation, authReady, fetchPlayerProfile, buildTimelinePosts]);

  const reloadProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileData && !error) {
        const defaultAvatar = 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face';
        setProfile({
          id: user.id,
          name: profileData.name ?? user.user_metadata?.username ?? 'Player',
          email: profileData.email ?? user.email ?? '',
          avatar: profileData.avatar ?? defaultAvatar,
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
        await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', currentUserId);
      } catch (e) {
        console.log('ChessProvider: last_seen update failed', e);
      }
    };

    lastSeenInterval.current = setInterval(updateLastSeen, 5 * 60 * 1000);
    return () => {
      if (lastSeenInterval.current) clearInterval(lastSeenInterval.current);
    };
  }, [currentUserId]);

  useEffect(() => {
    const messagesChannel = supabase
      .channel('messages-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        console.log('Realtime: Message change received', payload.eventType);
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
            });

            const notif: AppNotification = {
              id: `n_mr_${Date.now()}`,
              type: 'match_request',
              title: 'Match Request',
              message: 'New match request received',
              createdAt: new Date().toISOString(),
              read: false,
              relatedId: newMatch.id as string,
            };
            setNotifications(prev => [notif, ...prev]);
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
              avatar: newProfile.avatar ?? prev.avatar,
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

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(matchesChannel);
      supabase.removeChannel(profilesChannel);
      if (notificationsChannel) supabase.removeChannel(notificationsChannel);
    };
  }, [userLocation, currentUserId]);

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

      const { data: nearbyProfiles, error } = await supabase
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
      if (!user) return;

      const { data: postsData } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

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

        const { data: eventsData } = await supabase.from('events').select('*');
        const eventIds = (eventsData ?? []).map((e: Record<string, unknown>) => e.id as string);
        let epData: { event_id: string; user_id: string }[] = [];
        if (eventIds.length > 0) {
          const { data } = await supabase
            .from('event_participants')
            .select('event_id, user_id')
            .in('event_id', eventIds);
          epData = data ?? [];
        }

        const built = await buildTimelinePosts(
          postsData,
          commentsData ?? [],
          likesData ?? [],
          eventsData ?? [],
          epData,
          blockedUsers
        );
        setTimelinePosts(built);
        console.log('ChessProvider: Timeline refreshed with', built.length, 'posts');
      } else {
        setTimelinePosts([]);
      }
    } catch (e) {
      console.log('ChessProvider: Timeline refresh failed', e);
    }
  }, [blockedUsers, buildTimelinePosts]);

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

        const { data, error } = await supabase.from('profiles').upsert(supabaseUpdates).select();

        if (error) {
          console.log('SAVE ATTEMPT 1 FAILED:', error.code, error.message, error.details, error.hint);

          if (error.message?.includes('403') || error.code === '403' || error.message?.includes('Forbidden') || error.code === 'PGRST301') {
            console.log('403 detected - clearing stale session and retrying with no-auth client...');
            await clearStaleSession();

            const { data: retryData, error: retryError } = await supabaseNoAuth.from('profiles').upsert(supabaseUpdates).select();
            if (retryError) {
              console.log('SAVE ATTEMPT 2 (no-auth) FAILED:', retryError.code, retryError.message, retryError.details, retryError.hint);
              return false;
            }
            console.log('SAVE DONE (via no-auth retry)');
            console.log('Save successful:', JSON.stringify(retryData));
            return true;
          }
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

      const { data: opponentProfile } = await supabase
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

      await supabase.from('profiles').update(myUpdate).eq('id', user.id);

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

      await supabase.from('profiles').update(opUpdate).eq('id', opponentId);

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
      message: `Result reported for match with ${match.opponent.name}`,
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
      }
    } catch (e) {
      console.log('Like sync to Supabase failed', e);
    }
  }, [currentUserId, timelinePosts]);

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

  const unreadNotificationCount = useMemo(
    () => notifications.filter(n => !n.read).length,
    [notifications]
  );

  const addTimelinePost = useCallback(async (content: string, type: TimelinePost['type'] = 'general', imageUrl?: string, templateType?: string, event?: TimelineEvent) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('addTimelinePost: No authenticated user');
      return;
    }

    const newPost: TimelinePost = {
      id: `tp${Date.now()}`,
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
            prev.map(p => p.id === newPost.id ? { ...p, id: insertedPost.id } : p)
          );
        }

        if (event && insertedPost) {
          await supabase.from('events').insert({
            id: event.id,
            post_id: insertedPost.id,
            title: event.title,
            date: event.date,
            time: event.time,
            location: event.location,
            max_participants: event.maxParticipants,
            created_at: event.createdAt,
          });

          await supabase.from('event_participants').insert({
            event_id: event.id,
            user_id: user.id,
          });

          console.log('Event synced to Supabase');
        }
      }

      await refreshTimeline();
    } catch (e) {
      console.log('Post sync failed', e);
    }

    console.log('New timeline post added');
  }, [profile, refreshTimeline]);

  const joinEvent = useCallback(async (postId: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const userId = authUser?.id ?? currentUserId ?? 'me';
    setTimelinePosts(prev =>
      prev.map(post => {
        if (post.id !== postId || !post.event) return post;
        const isJoined = post.event.participants.includes(userId);
        if (isJoined) return post;
        if (post.event.participants.length >= post.event.maxParticipants) return post;
        return {
          ...post,
          event: {
            ...post.event,
            participants: [...post.event.participants, userId],
          },
        };
      })
    );

    try {
      const post = timelinePosts.find(p => p.id === postId);
      const eventId = post?.event?.id ?? postId;
      await supabase.from('event_participants').insert({
        event_id: eventId,
        user_id: userId,
      });
      console.log('Event join synced');
    } catch (e) {
      console.log('Event join sync failed', e);
    }
  }, [currentUserId, timelinePosts]);

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
      const eventId = post?.event?.id ?? postId;
      await supabase.from('event_participants')
        .delete()
        .eq('event_id', eventId)
        .eq('user_id', userId);
      console.log('Event leave synced');
    } catch (e) {
      console.log('Event leave sync failed', e);
    }
  }, [currentUserId, timelinePosts]);

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
    refreshPlayers,
    refreshTimeline,
    reloadProfile,
    joinEvent,
    leaveEvent,
    fetchPlayerProfile,
  };
});
