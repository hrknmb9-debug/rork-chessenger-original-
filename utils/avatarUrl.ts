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

  // Treat null / undefined / "" / whitespace / local paths as missing
  if (!raw || raw.trim() === '') return fallback;
  const r = raw.trim();
  if (r.startsWith('file://') || r.startsWith('blob:') || r.startsWith('/var') || r.startsWith('/private')) return fallback;

  // Full Supabase public URL already stored — return as-is
  if (r.startsWith('http')) return r;

  // Storage path (e.g. "user-id/avatar.jpg") → construct full public URL
  if (SUPABASE_URL) return PUBLIC_AVATAR_BASE + r;

  return fallback;
}
