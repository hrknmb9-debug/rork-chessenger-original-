import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Singleton guard: prevent multiple GoTrueClient instances on hot reload
declare global {
  var _supabaseSingleton: SupabaseClient | undefined;
  var _supabaseNoAuthSingleton: SupabaseClient | undefined;
  var _supabaseAuthListenerSetup: boolean | undefined;
}

const memoryStorage: Record<string, string> = {};
const noopStorage = {
  getItem: (key: string) => { return memoryStorage[key] ?? null; },
  setItem: (key: string, value: string) => { memoryStorage[key] = value; },
  removeItem: (key: string) => { delete memoryStorage[key]; },
};

if (!global._supabaseSingleton) {
  global._supabaseSingleton = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

if (!global._supabaseNoAuthSingleton) {
  global._supabaseNoAuthSingleton = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: noopStorage,
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      },
    },
  });
}

export const supabase = global._supabaseSingleton;
export const supabaseNoAuth = global._supabaseNoAuthSingleton;

// Global listener: clear stale storage on token refresh failure (SIGNED_OUT)
// Runs only once per app lifecycle via singleton guard
if (global._supabaseSingleton && !global._supabaseAuthListenerSetup) {
  global._supabaseAuthListenerSetup = true;
  global._supabaseSingleton.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT' && !session) {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const sbKeys = keys.filter(k => k.includes('supabase') || k.includes('sb-'));
        if (sbKeys.length > 0) {
          await AsyncStorage.multiRemove(sbKeys);
          console.log('supabaseClient: Cleared stale tokens on SIGNED_OUT', sbKeys.length, 'keys');
        }
      } catch (e) {
        console.log('supabaseClient: Storage cleanup error', e);
      }
    }
  });
}

export async function clearStaleSession(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        console.log('STALE SESSION DETECTED - clearing it now');
        await supabase.auth.signOut({ scope: 'local' });
        const keys = await AsyncStorage.getAllKeys();
        const supabaseKeys = keys.filter(k => k.includes('supabase') || k.includes('sb-'));
        if (supabaseKeys.length > 0) {
          await AsyncStorage.multiRemove(supabaseKeys);
          console.log('Cleared stale Supabase storage keys:', supabaseKeys);
        }
      }
    }
  } catch (e) {
    console.log('clearStaleSession error (non-blocking):', e);
  }
}
