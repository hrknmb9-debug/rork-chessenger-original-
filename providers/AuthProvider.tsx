import { useState, useCallback, useEffect, useRef } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { supabase, supabaseNoAuth, clearStaleSession } from '@/utils/supabaseClient';
import { AuthUser } from '@/types';
import { registerForPushNotificationsAsync, savePushTokenToSupabase } from '@/utils/notifications';

const AUTH_KEY = 'chess_auth_user';
const ALL_STORAGE_KEYS = ['chess_auth_user', 'chess_theme_mode', 'chess_language'];

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const initialLoadDone = useRef(false);
  const router = useRouter();

  const loadProfileFromSupabase = useCallback(async (userId: string, email: string, fallbackName: string, fallbackAvatar: string): Promise<AuthUser> => {
    try {
      const { data: profileData, error } = await supabaseNoAuth
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileData && !error) {
        console.log('Auth: Full profile loaded from Supabase for', userId, 'name:', profileData.name);
        return {
          id: userId,
          email: profileData.email ?? email,
          name: profileData.name ?? fallbackName,
          avatar: profileData.avatar ?? fallbackAvatar,
          isLoggedIn: true,
        };
      } else {
        console.log('Auth: Profile not found or error for', userId, error?.message);
      }
    } catch (e) {
      console.log('Auth: Profile fetch failed, using fallback', e);
    }

    return {
      id: userId,
      email,
      name: fallbackName,
      avatar: fallbackAvatar,
      isLoggedIn: true,
    };
  }, []);

  const ensureProfileExists = useCallback(async (userId: string, email: string, name: string, avatar: string, extraData?: Record<string, unknown>) => {
    try {
      const { data: existing } = await supabaseNoAuth
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single();

      if (existing) {
        console.log('Auth: Profile already exists for', userId);
        return;
      }

      const profileRow: Record<string, unknown> = {
        id: userId,
        name,
        email,
        avatar,
        rating: 0,
        last_seen: new Date().toISOString(),
        ...extraData,
      };

      const { error } = await supabaseNoAuth.from('profiles').upsert(profileRow);
      if (error) {
        console.log('Auth: Profile upsert error', error.message);
      } else {
        console.log('Auth: Profile created/upserted for', userId);
      }
    } catch (e) {
      console.log('Auth: ensureProfileExists failed (non-blocking)', e);
    }
  }, []);

  useEffect(() => {
    const loadUser = async () => {
      try {
        console.log('Auth: Checking existing session...');
        await clearStaleSession();
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        console.log('AUTH_SESSION_CHECK:', sessionError ? sessionError.message : 'no error', 'hasSession:', !!session);
        if (session?.user) {
          const defaultAvatar = 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face';
          const authUser = await loadProfileFromSupabase(
            session.user.id,
            session.user.email ?? '',
            session.user.user_metadata?.name ?? session.user.email?.split('@')[0] ?? '',
            defaultAvatar
          );
          setUser(authUser);
          await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(authUser));
          console.log('Auth: User loaded from Supabase session', authUser.name);
        } else {
          console.log('Auth: No active session found - app will work without login');
          setUser(null);
        }
      } catch (e) {
        console.log('Auth: Failed to load user', e);
        try {
          const stored = await AsyncStorage.getItem(AUTH_KEY);
          if (stored) {
            const parsed = JSON.parse(stored) as AuthUser;
            if (parsed.id && parsed.id !== 'me') {
              setUser(parsed);
              console.log('Auth: Fallback to storage', parsed.name);
            } else {
              await AsyncStorage.removeItem(AUTH_KEY);
            }
          }
        } catch (err) {
          console.log('Auth: Storage fallback failed', err);
        }
      } finally {
        initialLoadDone.current = true;
        setIsLoading(false);
      }
    };
    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth: State changed', event, session?.user?.id);

      if (event === 'SIGNED_IN' && session?.user) {
        const defaultAvatar = 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face';
        const authUser = await loadProfileFromSupabase(
          session.user.id,
          session.user.email ?? '',
          session.user.user_metadata?.name ?? session.user.email?.split('@')[0] ?? '',
          defaultAvatar
        );
        setUser(authUser);
        await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(authUser));
        console.log('Auth: SIGNED_IN user set', authUser.name);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        const currentStored = await AsyncStorage.getItem(AUTH_KEY);
        if (currentStored) {
          const parsed = JSON.parse(currentStored) as AuthUser;
          if (parsed.id !== session.user.id) {
            const defaultAvatar = 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face';
            const authUser = await loadProfileFromSupabase(
              session.user.id,
              session.user.email ?? '',
              session.user.user_metadata?.name ?? session.user.email?.split('@')[0] ?? '',
              defaultAvatar
            );
            setUser(authUser);
            await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(authUser));
          }
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        await AsyncStorage.removeItem(AUTH_KEY);
        console.log('Auth: SIGNED_OUT - user cleared');
        // initialLoadDone 後の SIGNED_OUT はセッション切れ → ログイン画面へ強制遷移
        if (initialLoadDone.current) {
          try {
            router.push('/login' as any);
          } catch (navErr) {
            console.log('Auth: Navigation to login failed', navErr);
          }
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadProfileFromSupabase]);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      console.log('Auth: Attempting Supabase login for', email);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        console.log('Auth: Supabase login error', error.message);
        return false;
      }

      if (data.user) {
        const defaultAvatar = 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face';

        await ensureProfileExists(
          data.user.id,
          data.user.email ?? email,
          data.user.user_metadata?.name ?? email.split('@')[0],
          defaultAvatar
        );

        const authUser = await loadProfileFromSupabase(
          data.user.id,
          data.user.email ?? email,
          data.user.user_metadata?.name ?? email.split('@')[0],
          defaultAvatar
        );
        await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(authUser));
        setUser(authUser);
        console.log('Auth: Supabase login success', authUser.name);
        return true;
      }
      return false;
    } catch (e) {
      console.log('Auth: Login error', e);
      return false;
    }
  }, [loadProfileFromSupabase, ensureProfileExists]);

  const register = useCallback(async (name: string, email: string, password: string, profileData?: { chessComRating?: number | null; lichessRating?: number | null; bio?: string; skillLevel?: string }): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('Auth: Attempting Supabase register for', email, 'with username:', name);

      if (name.trim().length < 1) {
        return { success: false, error: 'Username is required' };
      }
      if (!email.includes('@')) {
        return { success: false, error: 'Invalid email address' };
      }
      if (password.length < 6) {
        return { success: false, error: 'Password must be at least 6 characters' };
      }

      const trimmedName = name.trim();

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username: trimmedName, name: trimmedName },
        },
      });

      if (error) {
        console.log('Auth: Supabase register error', error.message);
        return { success: false, error: error.message };
      }

      if (data.user) {
        const defaultAvatar = 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face';
        const computedRating = Math.max(profileData?.chessComRating ?? 0, profileData?.lichessRating ?? 0) || 0;

        const profileRow: Record<string, unknown> = {
          id: data.user.id,
          name: trimmedName,
          email: data.user.email ?? email,
          avatar: defaultAvatar,
          rating: computedRating,
          bio: profileData?.bio ?? '',
          skill_level: profileData?.skillLevel ?? 'beginner',
          chess_com_rating: profileData?.chessComRating ?? null,
          lichess_rating: profileData?.lichessRating ?? null,
          games_played: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          last_seen: new Date().toISOString(),
        };

        const { error: insertError } = await supabaseNoAuth.from('profiles').upsert(profileRow);
        if (insertError) {
          console.log('Auth: Profile insert error after signup', insertError.message);
        } else {
          console.log('Auth: Profile row created in Supabase for', trimmedName);
        }

        const authUser: AuthUser = {
          id: data.user.id,
          email: data.user.email ?? email,
          name: trimmedName,
          avatar: defaultAvatar,
          isLoggedIn: true,
        };
        await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(authUser));
        setUser(authUser);

        if (data.session) {
          console.log('Auth: Session available immediately after signup');
        } else {
          console.log('Auth: No session yet, attempting auto sign-in');
          try {
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            if (signInData?.user && !signInError) {
              console.log('Auth: Auto sign-in after registration successful');
            } else if (signInError) {
              console.log('Auth: Auto sign-in error', signInError.message);
            }
          } catch (signInErr) {
            console.log('Auth: Auto sign-in failed (non-blocking)', signInErr);
          }
        }

        console.log('Auth: Supabase register success', authUser.name);
        return { success: true };
      }
      return { success: false, error: 'Registration failed. Please try again.' };
    } catch (e) {
      console.log('Auth: Register error', e);
      const errorMsg = e instanceof Error ? e.message : 'An unexpected error occurred';
      return { success: false, error: errorMsg };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.log('Auth: Supabase signOut error', e);
    }
    try {
      await AsyncStorage.multiRemove(ALL_STORAGE_KEYS);
    } catch (e) {
      console.log('Auth: Storage clear error', e);
    }
    setUser(null);
    console.log('Auth: Logged out and cleared all state');
  }, []);

  const reloadUser = useCallback(async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const defaultAvatar = 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face';
      const freshUser = await loadProfileFromSupabase(
        authUser.id,
        authUser.email ?? '',
        authUser.user_metadata?.name ?? authUser.email?.split('@')[0] ?? '',
        defaultAvatar
      );
      setUser(freshUser);
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(freshUser));
      console.log('Auth: User reloaded from Supabase', freshUser.name);
    } catch (e) {
      console.log('Auth: reloadUser failed', e);
    }
  }, [loadProfileFromSupabase]);

  const updateProfile = useCallback(async (updates: Partial<AuthUser>) => {
    if (!user) return;
    const updated = { ...user, ...updates };
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(updated));
    setUser(updated);

    try {
      const supabaseUpdates: Record<string, unknown> = { id: user.id };
      if (updates.name !== undefined) supabaseUpdates.name = updates.name;
      if (updates.avatar !== undefined) supabaseUpdates.avatar = updates.avatar;

      if (Object.keys(supabaseUpdates).length > 1) {
        const { error } = await supabaseNoAuth.from('profiles').upsert(supabaseUpdates);
        if (error) {
          console.log('Auth: Supabase profile upsert error', error.message);
        }
      }
      console.log('Auth: Supabase profile updated', updates);
    } catch (e) {
      console.log('Auth: Supabase profile update failed (local saved)', e);
    }
  }, [user]);

  const registerPushToken = useCallback(async () => {
    try {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        await savePushTokenToSupabase(token);
        console.log('Auth: Push token registered and saved');
      }
    } catch (e) {
      console.log('Auth: Push token registration failed (non-blocking)', e);
    }
  }, []);

  useEffect(() => {
    if (user?.isLoggedIn && user.id !== 'me') {
      registerPushToken();
    }
  }, [user?.isLoggedIn, user?.id, registerPushToken]);

  return {
    user,
    isLoading,
    isLoggedIn: !!user?.isLoggedIn,
    login,
    register,
    logout,
    updateProfile,
    reloadUser,
    registerPushToken,
  };
});
