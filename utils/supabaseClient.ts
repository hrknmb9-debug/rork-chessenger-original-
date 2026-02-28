import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

declare global {
  var _supabaseSingleton: SupabaseClient | undefined;
}

if (!global._supabaseSingleton) {
  global._supabaseSingleton = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  });
  console.log('supabaseClient: singleton created, platform=' + Platform.OS);
}

// Both exports point to the same singleton — one GoTrueClient, one session, all requests share the auth token automatically.
export const supabase = global._supabaseSingleton;
export const supabaseNoAuth = global._supabaseSingleton;

// Debug helper: call this anywhere to log current session state
export async function debugSession(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    console.log('debugSession: JWT present, user=' + session.user.id + ' expires=' + session.expires_at);
  } else {
    console.log('debugSession: NO session — requests will use anon role');
  }
}

export async function clearStaleSession(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        console.log('clearStaleSession: stale session detected, signing out locally');
        await supabase.auth.signOut({ scope: 'local' });
      }
    }
  } catch (e) {
    console.log('clearStaleSession error (non-blocking):', e);
  }
}
