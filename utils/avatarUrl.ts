const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const PUBLIC_AVATAR_BASE = SUPABASE_URL + '/storage/v1/object/public/avatars/';

export function resolveAvatarUrl(raw: string | null | undefined, name?: string): string {
  // No validation — force-construct the URL and let the network layer report errors
  if (!raw) {
    const n = name && name.trim() ? name.trim() : 'U';
    return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(n) + '&size=200&background=4F46E5&color=fff&bold=true';
  }

  const r = raw.trim();

  // Already a full URL — return as-is
  return r.startsWith('http') ? r : PUBLIC_AVATAR_BASE + r;
}
