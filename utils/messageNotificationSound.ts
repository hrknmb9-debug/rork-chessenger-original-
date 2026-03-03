/**
 * アプリ内の効果音（ログイン成功・メッセージ通知）を再生する。
 * - Web: Web Audio API（初回ユーザー操作で AudioContext をアンロック）。
 * - iOS/Android: expo-av（初回操作で setAudioModeAsync を実行し、サイレント時も再生可能に）。
 * トーンは「スタイリッシュでモダン」な短い音に統一。
 */

import { Platform } from 'react-native';

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

/** 洗練された短いトーン（2音の和音＋スムーズなエンベロープ）Web用 */
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

/** 初回のユーザー操作時（ログインボタン等）に呼び、Web では AudioContext をアンロック、Native では再生モードを設定する */
export async function primeAudioForApp(): Promise<void> {
  if (Platform.OS === 'web') {
    const ctx = getWebAudioContext();
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // ユーザー操作でない場合は失敗することがある
      }
    }
    return;
  }
  try {
    const { Audio } = await import('expo-av');
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
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

/** ログイン成功時用の短い上昇トーン（C5→E5、洗練された印象） */
export async function playLoginSuccessSound(): Promise<void> {
  if (Platform.OS === 'web') {
    const ctx = getWebAudioContext();
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }
    playRefinedChimeWeb(523.25, 659.25, 0.28);
    return;
  }
  try {
    const { Audio } = await import('expo-av');
    const { sound } = await Audio.Sound.createAsync(
      { uri: 'https://assets.mixkit.co/active_storage/sfx/1998-success-jingle-1998.mp3' },
      { shouldPlay: true }
    );
    sound.setOnPlaybackStatusUpdate((status: { isLoaded?: boolean; didJustFinishAndNotReset?: boolean }) => {
      if (status.isLoaded && status.didJustFinishAndNotReset) {
        sound.unloadAsync().catch(() => {});
      }
    });
  } catch {
    // 再生失敗時は無視
  }
}

/** メッセージ通知用の短いトーン（E5+B5、控えめでモダン） */
async function playMessageChimeWeb(): Promise<void> {
  const ctx = getWebAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }
  playRefinedChimeWeb(659.25, 987.77, 0.22);
}

async function playMessageChimeNative(): Promise<void> {
  try {
    const { Audio } = await import('expo-av');
    const { sound } = await Audio.Sound.createAsync(
      { uri: 'https://assets.mixkit.co/active_storage/sfx/2869-notification-simple-chime-2869.mp3' },
      { shouldPlay: true }
    );
    sound.setOnPlaybackStatusUpdate((status: { isLoaded?: boolean; didJustFinishAndNotReset?: boolean }) => {
      if (status.isLoaded && status.didJustFinishAndNotReset) {
        sound.unloadAsync().catch(() => {});
      }
    });
  } catch {
    // 再生失敗時は無視
  }
}

export async function playMessageNotificationSound(): Promise<void> {
  if (Platform.OS === 'web') {
    await playMessageChimeWeb();
    return;
  }
  await playMessageChimeNative();
}
