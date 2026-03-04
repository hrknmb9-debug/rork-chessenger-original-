import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

function ensureSupabaseConfig(): void {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    const missing = [!SUPABASE_URL && 'EXPO_PUBLIC_SUPABASE_URL', !SUPABASE_ANON_KEY && 'EXPO_PUBLIC_SUPABASE_ANON_KEY']
      .filter(Boolean)
      .join(', ');
    throw new Error(
      `Supabase の設定がありません。プロジェクトルートに .env を作成し、${missing} を設定してください。\n` +
        '例: .env.example を .env にコピーして値を編集\n' +
        '設定後はアプリを再起動（npx expo start -c）してください。'
    );
  }
}

declare global {
  var _supabaseSingleton: SupabaseClient | undefined;
}

if (!global._supabaseSingleton) {
  ensureSupabaseConfig();
  global._supabaseSingleton = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
    realtime: {
      params: { eventsPerSecond: 5 },
    },
  });
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const u = SUPABASE_URL ? `${SUPABASE_URL.slice(0, 30)}...` : '(missing)';
    const k = SUPABASE_ANON_KEY ? `set (${SUPABASE_ANON_KEY.slice(0, 8)}...)` : '(missing)';
    console.log('supabaseClient: URL=', u, 'ANON_KEY=', k, '| Realtime有効化確認: Supabase Dashboard > Database > Replication で該当テーブルの Realtime を ON にしてください');
  }
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
