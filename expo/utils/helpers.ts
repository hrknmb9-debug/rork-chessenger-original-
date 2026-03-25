import { SkillLevel } from '@/types';
import { ThemeColors } from '@/constants/colors';
import { t } from '@/utils/translations';

export function getSkillLabel(level: SkillLevel, lang: string = 'ja'): string {
  return t(level, lang);
}

export function getSkillColor(level: SkillLevel, colors?: ThemeColors): string {
  const fallback = { green: '#43A047', blue: '#4A90D9', orange: '#E89F38', gold: '#2B9B50' };
  const c = colors ?? fallback;
  const map: Record<SkillLevel, string> = {
    beginner: c.green,
    intermediate: c.blue,
    advanced: c.orange,
    expert: c.gold,
  };
  return map[level];
}

export function getSkillBgColor(level: SkillLevel, colors?: ThemeColors): string {
  const fallback = { greenMuted: 'rgba(67,160,71,0.10)', blueMuted: 'rgba(74,144,217,0.08)', orangeMuted: 'rgba(232,159,56,0.08)', goldMuted: 'rgba(43,155,80,0.09)' };
  const c = colors ?? fallback;
  const map: Record<SkillLevel, string> = {
    beginner: c.greenMuted,
    intermediate: c.blueMuted,
    advanced: c.orangeMuted,
    expert: c.goldMuted,
  };
  return map[level];
}

export function getWinRate(wins: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((wins / total) * 100);
}

export function formatDistance(km: number): string {
  if (km >= 999 || !Number.isFinite(km)) return '-';
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

export function formatRating(rating: number | null, lang: string): string {
  if (rating === null) return lang === 'ja' ? '未経験' : 'N/A';
  return String(rating);
}

export function getDisplayRating(chessComRating: number | null, lichessRating: number | null): number | null {
  if (chessComRating !== null && lichessRating !== null) {
    return Math.max(chessComRating, lichessRating);
  }
  return chessComRating ?? lichessRating;
}
