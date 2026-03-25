const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const PUBLIC_AVATAR_BASE = SUPABASE_URL + '/storage/v1/object/public/avatars/';

export function resolveAvatarUrl(raw: string | null | undefined, name?: string): string {
  const n = name && name.trim() ? name.trim() : 'U';
  const fallback = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(n) + '&size=200&background=4F46E5&color=fff&bold=true';
  if (!raw) return fallback;

  const r = raw.trim();
  if (r.startsWith('file://') || r.startsWith('ph://')) return fallback;
  return r.startsWith('http') ? r : PUBLIC_AVATAR_BASE + r;
}
