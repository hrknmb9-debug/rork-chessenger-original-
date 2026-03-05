/**
 * Push Notifications - iOS/Android
 * Apple審査ガイドライン準拠:
 * - 許可リクエストにサウンド含む
 * - 全ペイロードに sound を明示（指定なし＝サイレント扱いのため）
 * - ユーザーが設定で通知音をオフにした場合はOSが尊重（当アプリは何もしない）
 */

import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase, supabaseNoAuth } from '@/utils/supabaseClient';

/**
 * 通知音: 'default' = 標準音（審査安全）。
 * カスタム音を使う場合:
 * - app.json plugins.expo-notifications.sounds に ["./assets/sounds/notification.wav"] を追加
 * - NOTIFICATION_SOUND を "notification.wav" に変更
 * - iOS: Linear PCM, MA4 (IMA/ADPCM), µLaw, aLaw。30秒以内。メインバンドルに配置。
 */
export const NOTIFICATION_SOUND = 'default' as const;

/** アプリ起動時に setNotificationHandler で呼ぶ（フォアグラウンド時も音・バナー表示） */
export function setupNotificationHandler(): void {
  if (Platform.OS === 'web') return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,   // フォアグラウンド時も通知音を鳴らす
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
        // iOS 14+: iosDisplayInForeground は shouldShowBanner で制御
      }),
    });
    console.log('Notifications: handler set (shouldPlaySound=true)');
  } catch (e) {
    console.log('Notifications: setNotificationHandler failed', e);
  }
}

/** 通知許可（アラート・サウンド・バッジ）をリクエスト。実機のみ有効 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  if (!Device.isDevice) {
    console.log('Notifications: Not a physical device, skipping');
    return null;
  }

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Chessenger 通知',
        importance: Notifications.AndroidImportance.MAX,
        enableVibrate: true,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#7C3AED',
        sound: 'default',
        enableLights: true,
        showBadge: true,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      // iOS: サウンド・バッジ・アラートを明示的に要求
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowCriticalAlerts: false,
          provideAppNotificationSettings: false,
          allowProvisional: false,
          allowAnnouncements: false,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Notifications: Permission not granted');
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

    if (!projectId) {
      console.log('Notifications: No projectId for Expo push token');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const token = tokenData.data;
    console.log('Notifications: Push token obtained');

    return token;
  } catch (error) {
    console.log('Notifications: Registration failed', error);
    return null;
  }
}

export async function savePushTokenToSupabase(token: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('Notifications: No user, skipping token save');
      return;
    }

    const { error } = await supabaseNoAuth
      .from('profiles')
      .update({ expo_push_token: token })
      .eq('id', user.id);

    if (error) {
      console.log('Notifications: Token save error', error.message);
    } else {
      console.log('Notifications: Token saved to Supabase');
    }
  } catch (e) {
    console.log('Notifications: Token save failed', e);
  }
}

/** Expo Push API へ送信。全ペイロードに sound を必ず含める（iOS: 指定なし＝サイレント） */
export async function sendPushNotification(
  expoPushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    const message = {
      to: expoPushToken,
      sound: NOTIFICATION_SOUND,
      title,
      body,
      data: data ?? {},
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    if (result.data?.status === 'error') {
      console.log('Notifications: Push send error', result.data.message);
    }
  } catch (error) {
    console.log('Notifications: Push send failed', error);
  }
}

export async function getOpponentPushToken(opponentId: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseNoAuth
      .from('profiles')
      .select('expo_push_token')
      .eq('id', opponentId)
      .maybeSingle();

    if (error || !data?.expo_push_token) {
      return null;
    }

    return data.expo_push_token as string;
  } catch {
    return null;
  }
}

export async function notifyMatchRequest(opponentId: string, senderName: string, senderId?: string): Promise<void> {
  const token = await getOpponentPushToken(opponentId);
  if (token) {
    await sendPushNotification(
      token,
      '対局リクエスト / Match Request',
      `${senderName}さんから対局リクエストが届きました`,
      { type: 'match_request', senderId: senderId ?? '' }
    );
  }
}

export async function notifyMatchResponse(
  opponentId: string,
  responderName: string,
  accepted: boolean
): Promise<void> {
  const token = await getOpponentPushToken(opponentId);
  if (token) {
    const title = accepted ? '対局承諾 / Match Accepted' : '対局辞退 / Match Declined';
    const body = accepted
      ? `${responderName}さんが対局リクエストを承諾しました`
      : `${responderName}さんが対局リクエストを辞退しました`;
    await sendPushNotification(token, title, body, {
      type: accepted ? 'match_accepted' : 'match_declined',
    });
  }
}

/** タイムライン投稿へのコメント通知 */
export async function notifyTimelineComment(
  postOwnerId: string,
  commenterName: string,
  isReply: boolean = false
): Promise<void> {
  const token = await getOpponentPushToken(postOwnerId);
  // #region agent log
  fetch('http://127.0.0.1:7660/ingest/5c343937-8fec-4649-92d9-59dec881973f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bff004'},body:JSON.stringify({sessionId:'bff004',location:'notifications.ts:notifyTimelineComment',message:'token fetch result',data:{postOwnerId,hasToken:!!token,tokenPrefix:token?.slice(0,20)??null},timestamp:Date.now(),hypothesisId:'H-F'})}).catch(()=>{});
  // #endregion
  if (token) {
    const title = isReply
      ? 'コメントへの返信 / Reply'
      : 'タイムラインへのコメント / New Comment';
    const body = isReply
      ? `${commenterName}さんがコメントに返信しました`
      : `${commenterName}さんがあなたの投稿にコメントしました`;
    await sendPushNotification(token, title, body, {
      type: isReply ? 'post_reply' : 'post_comment',
    });
  }
}

export async function notifyNewMessage(
  recipientId: string,
  senderName: string,
  messagePreview: string
): Promise<void> {
  const token = await getOpponentPushToken(recipientId);
  if (token) {
    await sendPushNotification(
      token,
      `${senderName}からのメッセージ`,
      messagePreview.length > 80 ? messagePreview.substring(0, 80) + '...' : messagePreview,
      { type: 'new_message', senderId: recipientId }
    );
  }
}

export function calculateElo(
  winnerRating: number,
  loserRating: number,
  isDraw: boolean = false,
  kFactor: number = 16
): { winnerNew: number; loserNew: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser = 1 / (1 + Math.pow(10, (winnerRating - loserRating) / 400));

  if (isDraw) {
    const winnerNew = Math.round(winnerRating + kFactor * (0.5 - expectedWinner));
    const loserNew = Math.round(loserRating + kFactor * (0.5 - expectedLoser));
    return { winnerNew, loserNew };
  }

  const winnerNew = Math.round(winnerRating + kFactor * (1 - expectedWinner));
  const loserNew = Math.round(loserRating + kFactor * (0 - expectedLoser));
  return { winnerNew, loserNew };
}
