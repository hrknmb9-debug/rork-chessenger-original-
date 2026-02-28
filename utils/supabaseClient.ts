import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

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

// Web: use Supabase default (localStorage). Native: use AsyncStorage.
const authStorage = Platform.OS === 'web' ? undefined : AsyncStorage;

if (!global._supabaseSingleton) {
  global._supabaseSingleton = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      ...(authStorage ? { storage: authStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  });
  console.log('supabaseClient: created singleton, platform=' + Platform.OS + ', storage=' + (Platform.OS === 'web' ? 'localStorage(default)' : 'AsyncStorage'));
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

// Helper: clear stale Supabase keys from storage (platform-aware)
async function clearSupabaseStorageKeys(): Promise<void> {
  if (Platform.OS === 'web') {
    // On web, Supabase stores tokens in localStorage
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('supabase') || key.includes('sb-'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      if (keysToRemove.length > 0) {
        console.log('supabaseClient: Cleared localStorage keys:', keysToRemove.length);
      }
    } catch (e) {
      console.log('supabaseClient: localStorage cleanup error', e);
    }
  } else {
    // On native, Supabase stores tokens in AsyncStorage
    try {
      const keys = await AsyncStorage.getAllKeys();
      const sbKeys = keys.filter(k => k.includes('supabase') || k.includes('sb-'));
      if (sbKeys.length > 0) {
        await AsyncStorage.multiRemove(sbKeys);
        console.log('supabaseClient: Cleared AsyncStorage keys:', sbKeys.length);
      }
    } catch (e) {
      console.log('supabaseClient: AsyncStorage cleanup error', e);
    }
  }
}

// Global listener: clear stale storage on SIGNED_OUT (runs only once per lifecycle)
if (global._supabaseSingleton && !global._supabaseAuthListenerSetup) {
  global._supabaseAuthListenerSetup = true;
  global._supabaseSingleton.auth.onAuthStateChange(async (event, session) => {
    console.log('supabaseClient: onAuthStateChange event=' + event + ' hasSession=' + !!session);
    if (event === 'SIGNED_OUT' && !session) {
      await clearSupabaseStorageKeys();
    }
  });
}

export async function clearStaleSession(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        console.log('STALE SESSION DETECTED - clearing now, error:', error?.message);
        await supabase.auth.signOut({ scope: 'local' });
        await clearSupabaseStorageKeys();
      }
    }
  } catch (e) {
    console.log('clearStaleSession error (non-blocking):', e);
  }
}
