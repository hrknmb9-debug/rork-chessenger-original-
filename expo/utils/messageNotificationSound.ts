/**
 * アプリ内の効果音（ログイン成功・メッセージ通知）を再生する。
 * - Web: Web Audio API（初回ユーザー操作で AudioContext をアンロック）。
 * - iOS/Android: expo-av（初回操作で setAudioModeAsync を実行し、サイレント時も再生可能に）。
 * トーンは「スタイリッシュでモダン」な短い音に統一。
 *
 * 信頼性設計:
 *   1. expo-av で複数の CDN を順番に試行（フォールバックチェーン）
 *   2. 全て失敗した場合は Haptics にフォールバック
 *   3. 例外は常に catch して無視（通知音の失敗でアプリをクラッシュさせない）
 */

import { Platform } from 'react-native';

// iOS/Android 用フォールバック URL リスト（複数CDNで可用性を確保）
const MESSAGE_SOUND_URLS = [
  'https://cdn.freesound.org/previews/536/536108_1648170-lq.mp3',
  'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
  'https://assets.mixkit.co/active_storage/sfx/2869-notification-simple-chime-2869.mp3',
];

const LOGIN_SOUND_URLS = [
  'https://cdn.freesound.org/previews/242/242501_4284968-lq.mp3',
  'https://assets.mixkit.co/active_storage/sfx/1998/1998-preview.mp3',
  'https://assets.mixkit.co/active_storage/sfx/1998-success-jingle-1998.mp3',
];

// ─── Web Audio API ────────────────────────────────────────────────────────────

let webAudioContext: AudioContext | null = null;

function getWebAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (webAudioContext) return webAudioContext;
  try {
    webAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch {
    return null;
  }
  return webAudioContext;
}

function playRefinedChimeWeb(frequency1: number, frequency2: number, duration: number): void {
  const ctx = getWebAudioContext();
  if (!ctx) return;
  try {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.frequency.value = frequency1;
    osc2.frequency.value = frequency2;
    osc1.type = 'sine';
    osc2.type = 'sine';
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration);
    osc2.stop(now + duration);
  } catch {
    // ignore
  }
}

// ─── Native: expo-av with fallback chain ─────────────────────────────────────

async function tryPlaySoundNative(urls: string[]): Promise<boolean> {
  try {
    const { Audio } = await import('expo-av');
    for (const uri of urls) {
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true, volume: 1.0 }
        );
        sound.setOnPlaybackStatusUpdate((status: any) => {
          if (status.isLoaded && status.didJustFinishAndNotReset) {
            sound.unloadAsync().catch(() => {});
          }
        });
        return true;
      } catch {
        // このURLが失敗したら次を試す
      }
    }
  } catch {
    // expo-av 自体が利用できない
  }
  return false;
}

/** Haptics フォールバック（expo-av が全て失敗した場合） */
async function hapticsOnly(): Promise<void> {
  try {
    const Haptics = await import('expo-haptics');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Haptics も利用不可なら何もしない
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** 初回のユーザー操作時に呼び、Web では AudioContext をアンロック、Native では再生モードを設定する */
export async function primeAudioForApp(): Promise<void> {
  if (Platform.OS === 'web') {
    const ctx = getWebAudioContext();
    if (ctx && ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { /* ignore */ }
    }
    return;
  }
  try {
    const { Audio } = await import('expo-av');
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,      // サイレントスイッチ中でも再生
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
      interruptionModeAndroid: 1,
      interruptionModeIOS: 1,
    });
  } catch {
    // expo-av 未導入や設定失敗時は無視
  }
}

/** 従来の名前で export（既存コードとの互換）。primeAudioForApp と同じで、初回操作時のアンロック用 */
export async function primeMessageNotificationSound(): Promise<void> {
  await primeAudioForApp();
}

/** ログイン成功時用の短い上昇トーン */
export async function playLoginSuccessSound(): Promise<void> {
  if (Platform.OS === 'web') {
    const ctx = getWebAudioContext();
    if (ctx?.state === 'suspended') {
      try { await ctx.resume(); } catch { return; }
    }
    playRefinedChimeWeb(523.25, 659.25, 0.28);
    return;
  }
  const ok = await tryPlaySoundNative(LOGIN_SOUND_URLS);
  if (!ok) await hapticsOnly();
}

/** メッセージ通知用の短いトーン */
export async function playMessageNotificationSound(): Promise<void> {
  if (Platform.OS === 'web') {
    const ctx = getWebAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch { return; }
      }
      playRefinedChimeWeb(659.25, 987.77, 0.22);
    }
    return;
  }
  const ok = await tryPlaySoundNative(MESSAGE_SOUND_URLS);
  if (!ok) {
    // 音が再生できなくても振動でフィードバック
    try {
      const Haptics = await import('expo-haptics');
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch { /* ignore */ }
  }
}
