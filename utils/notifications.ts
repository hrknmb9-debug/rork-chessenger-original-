import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase, supabaseNoAuth } from '@/utils/supabaseClient';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') {
    console.log('Notifications: Web platform, skipping push registration');
    return null;
  }

  if (!Device.isDevice) {
    console.log('Notifications: Not a physical device, skipping');
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Notifications: Permission not granted');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '30e8dzkl5ptrsftnsy7by',
    });
    const token = tokenData.data;
    console.log('Notifications: Push token obtained:', token);

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4ADE80',
      });
    }

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

export async function sendPushNotification(
  expoPushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    const message = {
      to: expoPushToken,
      sound: 'default' as const,
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
    console.log('Notifications: Push sent', result);
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
      .single();

    if (error || !data?.expo_push_token) {
      console.log('Notifications: No push token for opponent', opponentId);
      return null;
    }

    return data.expo_push_token as string;
  } catch (e) {
    console.log('Notifications: Failed to get opponent token', e);
    return null;
  }
}

export async function notifyMatchRequest(opponentId: string, senderName: string): Promise<void> {
  const token = await getOpponentPushToken(opponentId);
  if (token) {
    await sendPushNotification(
      token,
      '対局リクエスト / Match Request',
      `${senderName}さんから対局リクエストが届きました`,
      { type: 'match_request', senderId: opponentId }
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
