// No supabase client dependency — URL is built from env var only.
// Public bucket URLs always work regardless of auth state or api.rork.com connectivity.
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const PUBLIC_AVATAR_BASE = SUPABASE_URL + '/storage/v1/object/public/avatars/';

export function resolveAvatarUrl(raw: string | null | undefined, name?: string): string {
  const initials = name && name.trim().length > 0 ? name.trim() : 'U';
  const fallback =
    'https://ui-avatars.com/api/?name=' +
    encodeURIComponent(initials) +
    '&size=200&background=4F46E5&color=fff&bold=true';

  // Treat null / undefined / "" / "  " all as missing
  if (!raw || raw.trim() === '') return fallback;

  // Already a full URL (http/https) — return as-is
  if (raw.startsWith('http')) return raw;

  // Storage path (e.g. "user-id/avatar.jpg") → direct public URL, no auth required
  if (SUPABASE_URL) {
    const fullUrl = PUBLIC_AVATAR_BASE + raw.trim();
    console.error('DEBUG_FULL_URL:', fullUrl, '| raw:', raw.trim(), '| SUPABASE_URL:', SUPABASE_URL);
    return fullUrl;
  }

  return fallback;
}
