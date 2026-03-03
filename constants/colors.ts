export interface ThemeColors {
  background: string;
  surface: string;
  surfaceLight: string;
  surfaceHighlight: string;
  card: string;
  cardBorder: string;
  gold: string;
  goldLight: string;
  goldDark: string;
  goldMuted: string;
  white: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  green: string;
  greenMuted: string;
  red: string;
  redMuted: string;
  blue: string;
  blueMuted: string;
  orange: string;
  orangeMuted: string;
  divider: string;
  overlay: string;
  tabBar: string;
  tabBarBorder: string;
  inputBg?: string;
  accent: string;
}

export const LightTheme: ThemeColors = {
  background: '#F5F9F5',
  surface: '#FFFFFF',
  surfaceLight: '#ECF3EC',
  surfaceHighlight: '#E0EAE0',
  card: '#FFFFFF',
  cardBorder: '#D4E2D4',
  gold: '#2B9B50',
  goldLight: '#5BBF75',
  goldDark: '#1D7A38',
  goldMuted: 'rgba(43, 155, 80, 0.09)',
  white: '#FFFFFF',
  textPrimary: '#1A2E1C',
  textSecondary: '#4B6B50',
  textMuted: '#7E9E82',
  green: '#43A047',
  greenMuted: 'rgba(67, 160, 71, 0.10)',
  red: '#E05252',
  redMuted: 'rgba(224, 82, 82, 0.08)',
  blue: '#4A90D9',
  blueMuted: 'rgba(74, 144, 217, 0.08)',
  orange: '#E89F38',
  orangeMuted: 'rgba(232, 159, 56, 0.08)',
  divider: '#D4E2D4',
  overlay: 'rgba(0, 0, 0, 0.35)',
  tabBar: '#FFFFFF',
  tabBarBorder: '#D4E2D4',
  inputBg: '#ECF3EC',
  accent: '#2B9B50',
};

export const DarkTheme: ThemeColors = {
  background: '#0B140E',
  surface: '#142018',
  surfaceLight: '#1C2E22',
  surfaceHighlight: '#263A2C',
  card: '#152119',
  cardBorder: '#22382A',
  gold: '#4ADE80',
  goldLight: '#86EFAC',
  goldDark: '#22C55E',
  goldMuted: 'rgba(74, 222, 128, 0.12)',
  white: '#E8F5E9',
  textPrimary: '#E0F0E2',
  textSecondary: '#9ABF9E',
  textMuted: '#5E8563',
  green: '#4CAF50',
  greenMuted: 'rgba(76, 175, 80, 0.15)',
  red: '#EF5350',
  redMuted: 'rgba(239, 83, 80, 0.12)',
  blue: '#64B5F6',
  blueMuted: 'rgba(100, 181, 246, 0.12)',
  orange: '#FFB74D',
  orangeMuted: 'rgba(255, 183, 77, 0.12)',
  divider: '#22382A',
  overlay: 'rgba(0, 0, 0, 0.6)',
  tabBar: '#0D1A12',
  tabBarBorder: '#1C2E22',
  inputBg: '#1C2E22',
  accent: '#4ADE80',
};

const Colors = LightTheme;
export default Colors;
