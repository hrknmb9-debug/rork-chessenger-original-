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
  background:       '#F7F8FC',   // クールホワイト
  surface:          '#FFFFFF',
  surfaceLight:     '#F0EEFF',   // ごく薄いパープル
  surfaceHighlight: '#E8E2FF',
  card:             '#FFFFFF',
  cardBorder:       '#EAEDF5',
  gold:             '#7C3AED',   // バイブラントパープル
  goldLight:        '#9B6FFA',
  goldDark:         '#6D28D9',
  goldMuted:        'rgba(124,58,237,0.09)',
  white:            '#FFFFFF',
  textPrimary:      '#18181B',   // ほぼ黒
  textSecondary:    '#52525B',
  textMuted:        '#A1A1AA',
  green:            '#22C55E',   // ロゴグリーン
  greenMuted:       'rgba(34,197,94,0.11)',
  red:              '#EF4444',
  redMuted:         'rgba(239,68,68,0.09)',
  blue:             '#3B82F6',
  blueMuted:        'rgba(59,130,246,0.09)',
  orange:           '#F97316',
  orangeMuted:      'rgba(249,115,22,0.09)',
  divider:          '#F4F4F5',
  overlay:          'rgba(15,15,25,0.45)',
  tabBar:           'rgba(255,255,255,0.88)',
  tabBarBorder:     'rgba(124,58,237,0.10)',
  inputBg:          '#F4F4F5',
  accent:           '#7C3AED',
};

export const DarkTheme: ThemeColors = {
  background:       '#0D0B18',
  surface:          '#16132B',
  surfaceLight:     '#1F1B38',
  surfaceHighlight: '#2A2448',
  card:             '#16132B',
  cardBorder:       '#2A2448',
  gold:             '#A78BFA',
  goldLight:        '#C4B5FD',
  goldDark:         '#8B5CF6',
  goldMuted:        'rgba(167,139,250,0.13)',
  white:            '#F5F3FF',
  textPrimary:      '#F0EDFF',
  textSecondary:    '#C4B5FD',
  textMuted:        '#6D6A8A',
  green:            '#34D399',
  greenMuted:       'rgba(52,211,153,0.13)',
  red:              '#FB7185',
  redMuted:         'rgba(251,113,133,0.13)',
  blue:             '#60A5FA',
  blueMuted:        'rgba(96,165,250,0.13)',
  orange:           '#FB923C',
  orangeMuted:      'rgba(251,146,60,0.13)',
  divider:          '#1F1B38',
  overlay:          'rgba(0,0,0,0.70)',
  tabBar:           'rgba(13,11,24,0.90)',
  tabBarBorder:     'rgba(167,139,250,0.18)',
  inputBg:          '#1F1B38',
  accent:           '#A78BFA',
};

const Colors = LightTheme;
export default Colors;
