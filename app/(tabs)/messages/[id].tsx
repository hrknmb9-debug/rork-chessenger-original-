import React, {
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { SafeImage } from '@/components/SafeImage';
import { Send, Image as ImageIcon, Check, CheckCheck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { Message, Player } from '@/types';
import { supabase } from '@/utils/supabaseClient';
import { t, getTimeAgo } from '@/utils/translations';
import { BackNavButton } from '@/components/BackNavButton';
import { primeMessageNotificationSound } from '@/utils/messageNotificationSound';

// ── Constants ──────────────────────────────────────────────────────────────────

const EMOJI_LIST = ['❤️', '👍', '😂', '😮', '😢', '🎉', '🔥', '👏'];

interface SupabaseMessage {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

type ListItem =
  | { kind: 'date'; id: string; label: string }
  | { kind: 'message'; id: string; msg: Message; isFirst: boolean; isLast: boolean };

// ── Helpers ────────────────────────────────────────────────────────────────────

const MESSAGE_IMAGES_BUCKET = 'message-images';

/** base64 を ArrayBuffer に変換（atob が無い React Native でも動作するフォールバック付き） */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  try {
    if (typeof atob !== 'undefined') {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    }
  } catch {
    // atob が無い or 失敗時は手動デコード
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const len = base64.replace(/=+$/, '').length;
  const byteLen = (len * 3) >> 2;
  const bytes = new Uint8Array(byteLen);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = lookup[base64.charCodeAt(i)];
    const b = lookup[base64.charCodeAt(i + 1)];
    const c = i + 2 < len ? lookup[base64.charCodeAt(i + 2)] : 0;
    const d = i + 3 < len ? lookup[base64.charCodeAt(i + 3)] : 0;
    bytes[p++] = (a << 2) | (b >> 4);
    if (p < byteLen) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < byteLen) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes.buffer;
}

/** アップロード結果: 成功時は url、失敗時は error メッセージ */
type UploadResult = { url: string } | { error: string };

/**
 * 画像を Supabase Storage (message-images) にアップロードし、公開URLまたはエラーを返す。
 * - RLS: パス先頭は auth.jwt()->>'sub' と一致させるため userId に認証ユーザーIDを渡すこと。
 * - base64FromPicker: ピッカーから base64 を渡すと確実（ネイティブでは fetch(ph://) が失敗しやすい）。
 */
async function uploadMessageImage(
  localUri: string,
  userId: string,
  roomId: string,
  base64FromPicker?: string
): Promise<UploadResult> {
  let arrayBuffer: ArrayBuffer | null = null;
  try {
    if (base64FromPicker && base64FromPicker.length > 0) {
      arrayBuffer = base64ToArrayBuffer(base64FromPicker);
    } else if (Platform.OS === 'web') {
      const response = await fetch(localUri);
      if (!response.ok) return { error: `画像の読み込みに失敗しました (${response.status})` };
      arrayBuffer = await response.arrayBuffer();
    } else {
      try {
        const res = await fetch(localUri);
        if (res.ok) arrayBuffer = await res.arrayBuffer();
      } catch {
        // ネイティブで fetch が失敗する場合
      }
      if (!arrayBuffer) {
        try {
          const FileSystem = await import('expo-file-system/legacy').catch(() => import('expo-file-system'));
          const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
          if (base64) arrayBuffer = base64ToArrayBuffer(base64);
        } catch (fsErr) {
          const msg = fsErr instanceof Error ? fsErr.message : String(fsErr);
          return { error: `画像の読み込みに失敗しました。${msg}` };
        }
      }
    }
    if (!arrayBuffer || arrayBuffer.byteLength === 0) return { error: '画像データが空です' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log('Message image read failed', e);
    return { error: `画像の読み込みに失敗: ${msg}` };
  }

  const fileExt = localUri.toLowerCase().includes('.png') ? 'png' : 'jpg';
  const filePath = `${userId}/${roomId}/${Date.now()}.${fileExt}`;
  const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';

  try {
    const { error: uploadError } = await supabase.storage
      .from(MESSAGE_IMAGES_BUCKET)
      .upload(filePath, arrayBuffer, {
        cacheControl: '31536000',
        upsert: false,
        contentType,
      });

    if (uploadError) {
      console.log('Message image upload error:', uploadError.message, uploadError.name);
      return { error: `アップロードに失敗しました: ${uploadError.message}` };
    }

    const { data } = supabase.storage.from(MESSAGE_IMAGES_BUCKET).getPublicUrl(filePath);
    const publicUrl = (data?.publicUrl ?? '').trim();
    if (!publicUrl) return { error: '公開URLの取得に失敗しました' };
    return { url: publicUrl + '?t=' + Date.now() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log('Message image upload failed', e);
    return { error: `アップロードに失敗: ${msg}` };
  }
}

function encodeImageContent(uri: string): string {
  return `__IMG__${uri}`;
}

function decodeContent(content: string): { isImage: boolean; value: string } {
  if (content.startsWith('__IMG__')) {
    return { isImage: true, value: content.slice(7) };
  }
  return { isImage: false, value: content };
}

function formatDateLabel(isoStr: string): string {
  const d = new Date(isoStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return '今日';
  if (d.toDateString() === yesterday.toDateString()) return '昨日';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function buildListItems(messages: Message[]): ListItem[] {
  const items: ListItem[] = [];
  let lastDateKey = '';

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const dateKey = new Date(msg.timestamp).toDateString();

    if (dateKey !== lastDateKey) {
      items.push({ kind: 'date', id: `date_${dateKey}`, label: formatDateLabel(msg.timestamp) });
      lastDateKey = dateKey;
    }

    const prev = messages[i - 1];
    const next = messages[i + 1];
    const prevKey = prev ? new Date(prev.timestamp).toDateString() : '';
    const nextKey = next ? new Date(next.timestamp).toDateString() : '';

    const isFirst = !prev || prev.senderId !== msg.senderId || prevKey !== dateKey;
    const isLast = !next || next.senderId !== msg.senderId || nextKey !== dateKey;

    items.push({ kind: 'message', id: msg.id, msg, isFirst, isLast });
  }

  return items;
}

// ── Emoji Reaction Picker ──────────────────────────────────────────────────────

function EmojiPicker({
  visible,
  onSelect,
  onClose,
  colors,
}: {
  visible: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
  colors: ThemeColors;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={pickerStyles.backdrop} onPress={onClose}>
        <View style={[pickerStyles.container, { backgroundColor: colors.surface }]}>
          <View style={pickerStyles.emojiRow}>
            {EMOJI_LIST.map(emoji => (
              <TouchableOpacity
                key={emoji}
                style={pickerStyles.emojiBtn}
                onPress={() => { onSelect(emoji); onClose(); }}
              >
                <Text style={pickerStyles.emoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    borderRadius: 22,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  emojiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  emojiBtn: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 25,
  },
  emoji: { fontSize: 30 },
});

// ── Date Separator ─────────────────────────────────────────────────────────────

function DateSeparator({ label, colors }: { label: string; colors: ThemeColors }) {
  return (
    <View style={dateSepStyles.wrapper}>
      <View style={[dateSepStyles.line, { backgroundColor: colors.divider }]} />
      <Text style={[dateSepStyles.label, { color: colors.textMuted }]}>{label}</Text>
      <View style={[dateSepStyles.line, { backgroundColor: colors.divider }]} />
    </View>
  );
}

const dateSepStyles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    marginHorizontal: 8,
    gap: 10,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 12,
    fontWeight: '500' as const,
    letterSpacing: 0.3,
  },
});

// ── Message Bubble ─────────────────────────────────────────────────────────────

function MessageBubble({
  item,
  isMe,
  isFirst,
  isLast,
  chatPlayer,
  language,
  colors,
  styles,
  onLongPress,
  reactions,
}: {
  item: Message;
  isMe: boolean;
  isFirst: boolean;
  isLast: boolean;
  chatPlayer: Player | null;
  language: string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  onLongPress: () => void;
  reactions: string[];
}) {
  const { isImage, value } = decodeContent(item.text);
  const timeStr = getTimeAgo(item.timestamp, language);

  const reactionGroups = useMemo(() => {
    const map: Record<string, number> = {};
    reactions.forEach(e => { map[e] = (map[e] ?? 0) + 1; });
    return Object.entries(map);
  }, [reactions]);

  // Threads-style grouped bubble corner radius
  const bubbleRadius = useMemo(() => {
    const big = 22;
    const sm = 5;
    if (isMe) {
      return {
        borderRadius: big,
        borderTopRightRadius: isFirst ? big : sm,
        borderBottomRightRadius: isLast ? big : sm,
      };
    }
    return {
      borderRadius: big,
      borderTopLeftRadius: isFirst ? big : sm,
      borderBottomLeftRadius: isLast ? big : sm,
    };
  }, [isMe, isFirst, isLast]);

  return (
    <View
      style={[
        styles.bubbleRow,
        isMe ? styles.bubbleRowMe : styles.bubbleRowOther,
        isLast ? styles.bubbleRowLast : styles.bubbleRowContinue,
      ]}
    >
      {/* Avatar column — other user only */}
      {!isMe && (
        isFirst && chatPlayer
          ? <SafeImage uri={chatPlayer.avatar} name={chatPlayer.name} style={styles.bubbleAvatar} contentFit="cover" />
          : <View style={styles.avatarSpacer} />
      )}

      <View style={[styles.bubbleCol, isMe && styles.bubbleColMe]}>
        {/* Sender name: first in group, other user only */}
        {!isMe && isFirst && chatPlayer && (
          <Text style={[styles.senderName, { color: colors.textMuted }]}>
            {chatPlayer.name}
          </Text>
        )}

        <Pressable
          onLongPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onLongPress();
          }}
          style={[
            styles.bubble,
            isMe ? styles.bubbleMe : styles.bubbleOther,
            bubbleRadius,
          ]}
        >
          {isImage ? (
            <Image source={{ uri: value }} style={styles.imageMessage} contentFit="cover" />
          ) : (
            <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextOther]}>
              {item.text}
            </Text>
          )}
        </Pressable>

        {/* Meta row: time + read receipt — last message in group only */}
        {isLast && (
          <View style={[styles.metaRow, isMe && styles.metaRowMe]}>
            <Text style={styles.metaTime}>{timeStr}</Text>
            {isMe && (
              item.read
                ? <CheckCheck size={13} color={colors.gold} />
                : <Check size={13} color={colors.textMuted} />
            )}
          </View>
        )}

        {/* Reaction badges */}
        {reactionGroups.length > 0 && (
          <View style={[styles.reactionRow, isMe && styles.reactionRowMe]}>
            {reactionGroups.map(([emoji, count]) => (
              <View key={emoji} style={[styles.reactionBadge, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
                <Text style={styles.reactionEmoji}>{emoji}</Text>
                {count > 1 && <Text style={[styles.reactionCount, { color: colors.textMuted }]}>{count}</Text>}
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { language, currentUserId, fetchPlayerProfile, refreshUnreadMessageCounts } = useChess();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [chatPlayer, setChatPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [messageReactions, setMessageReactions] = useState<Record<string, string[]>>({});
  const [pickerTarget, setPickerTarget] = useState<string | null>(null);

  const roomId = id ?? '';
  const isNewConversation = roomId.startsWith('new_');
  const playerIdFromNew = isNewConversation ? roomId.replace('new_', '') : null;

  // ── Load messages ──────────────────────────────────────────────────────────

  useEffect(() => {
    const loadChat = async () => {
      if (!roomId || !currentUserId) { setLoading(false); return; }

      try {
        if (isNewConversation && playerIdFromNew) {
          const player = await fetchPlayerProfile(playerIdFromNew);
          setChatPlayer(player);
          setMessages([]);
          setLoading(false);
          return;
        }

        const parts = roomId.split('_');
        const otherUserId = parts.find(p => p !== currentUserId);
        if (otherUserId) {
          const player = await fetchPlayerProfile(otherUserId);
          setChatPlayer(player);
        }

        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('room_id', roomId)
          .order('created_at', { ascending: true });

        if (data && !error) {
          setMessages(data.map((m: SupabaseMessage) => ({
            id: m.id,
            senderId: m.sender_id,
            text: m.content,
            timestamp: m.created_at,
            read: m.is_read,
          })));

          console.log('Notification cleared by: [id].tsx loadChat auto-mark-read room=', roomId);
          await supabase
            .from('messages')
            .update({ is_read: true })
            .eq('room_id', roomId)
            .neq('sender_id', currentUserId)
            .eq('is_read', false);
          await refreshUnreadMessageCounts();
        }
      } catch (e) {
        console.log('Chat: Failed to load', e);
      } finally {
        setLoading(false);
      }
    };

    loadChat();
  }, [roomId, currentUserId, isNewConversation, playerIdFromNew, fetchPlayerProfile, refreshUnreadMessageCounts]);

  // ── Realtime ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || isNewConversation) return;

    const channel = supabase
      .channel(`chat-${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `room_id=eq.${roomId}`,
      }, async (payload) => {
        const msg = payload.new as SupabaseMessage;
        const newMsg: Message = {
          id: msg.id,
          senderId: msg.sender_id,
          text: msg.content,
          timestamp: msg.created_at,
          read: msg.is_read,
        };
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        if (msg.sender_id !== currentUserId) {
          console.log('Notification cleared by: [id].tsx realtime-INSERT auto-mark-read id=', msg.id);
          await supabase.from('messages').update({ is_read: true }).eq('id', msg.id);
          await refreshUnreadMessageCounts();
        }
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId, currentUserId, isNewConversation, refreshUnreadMessageCounts]);

  // ── Send helpers ───────────────────────────────────────────────────────────

  const getActualRoomId = useCallback((): string => {
    if (!isNewConversation) return roomId;
    if (playerIdFromNew && currentUserId) {
      return [currentUserId, playerIdFromNew].sort().join('_');
    }
    return roomId;
  }, [roomId, isNewConversation, playerIdFromNew, currentUserId]);

  const sendContent = useCallback(async (content: string) => {
    if (!currentUserId) return;
    const actualRoomId = getActualRoomId();

    const tempId = `msg_temp_${Date.now()}`;
    const tempMsg: Message = {
      id: tempId,
      senderId: currentUserId,
      text: content,
      timestamp: new Date().toISOString(),
      read: true,
    };
    setMessages(prev => [...prev, tempMsg]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const { isImage, value: imageUrl } = decodeContent(content);
      const payload = {
        room_id: actualRoomId,
        sender_id: currentUserId,
        content,
        is_read: false,
        ...(isImage && imageUrl ? { image_url: imageUrl } : {}),
      };
      const { data, error } = await supabase
        .from('messages')
        .insert(payload)
        .select()
        .single();

      if (data && !error) {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: data.id } : m));
      } else if (error) {
        console.log('Chat: Send failed', error.message);
      }
    } catch (e) {
      console.log('Chat: Send failed', e);
    }
  }, [currentUserId, getActualRoomId]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // ユーザー操作時に通知音用 AudioContext をウォームアップ
    primeMessageNotificationSound().catch(() => {});
    setInputText('');
    await sendContent(text);
  }, [inputText, sendContent]);

  // ── Image picker ───────────────────────────────────────────────────────────

  const handlePickImage = useCallback(async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('アクセス許可が必要です', 'フォトライブラリへのアクセスを許可してください。');
        return;
      }
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
        aspect: [4, 3],
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const localUri = asset.uri;
        const base64 = asset.base64 ?? undefined;
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        // ユーザー操作時に通知音用 AudioContext をウォームアップ
        primeMessageNotificationSound().catch(() => {});

        const actualRoomId = getActualRoomId();

        // Storage RLS で要求される認証ユーザーIDを必ず使用する
        const { data: { user } } = await supabase.auth.getUser();
        const authUserId = user?.id;
        if (!authUserId) {
          Alert.alert(t('error', language), 'ログイン情報を取得できなかったため、画像を送信できませんでした。');
          return;
        }

        const result = await uploadMessageImage(localUri, authUserId, actualRoomId, base64);
        if ('url' in result) {
          await sendContent(encodeImageContent(result.url));
        } else {
          Alert.alert(t('error', language), result.error);
        }
      }
    } catch (e) {
      console.log('Chat: Image pick failed', e);
    }
  }, [sendContent, getActualRoomId, language]);

  // ── Reactions ──────────────────────────────────────────────────────────────

  const handleAddReaction = useCallback((msgId: string, emoji: string) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMessageReactions(prev => ({
      ...prev,
      [msgId]: [...(prev[msgId] ?? []), emoji],
    }));
  }, []);

  // ── Build grouped list ─────────────────────────────────────────────────────

  const listItems = useMemo(() => buildListItems(messages), [messages]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.kind === 'date') {
      return <DateSeparator label={item.label} colors={colors} />;
    }
    const isMe = item.msg.senderId === currentUserId;
    return (
      <MessageBubble
        item={item.msg}
        isMe={isMe}
        isFirst={item.isFirst}
        isLast={item.isLast}
        chatPlayer={chatPlayer}
        language={language}
        colors={colors}
        styles={styles}
        onLongPress={() => setPickerTarget(item.msg.id)}
        reactions={messageReactions[item.msg.id] ?? []}
      />
    );
  }, [chatPlayer, language, colors, styles, currentUserId, messageReactions]);

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: '', headerLeft: () => <BackNavButton onPress={() => router.back()} /> }} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.gold} />
        </View>
      </View>
    );
  }

  if (!chatPlayer) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: '', headerLeft: () => <BackNavButton onPress={() => router.back()} /> }} />
        <View style={styles.center}>
          <Text style={styles.notFoundText}>{t('conversation_not_found', language)}</Text>
        </View>
      </View>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerShadowVisible: false,
          headerLeft: () => <BackNavButton onPress={() => router.back()} />,
          headerTitle: () => (
            <Pressable
              onPress={() => router.push(`/player/${chatPlayer.id}` as any)}
              style={styles.headerTitle}
            >
              <View style={styles.headerAvatarWrapper}>
                <SafeImage
                  uri={chatPlayer.avatar}
                  name={chatPlayer.name}
                  style={styles.headerAvatar}
                  contentFit="cover"
                />
                <View style={styles.headerOnlineDot} />
              </View>
              <View>
                <Text style={styles.headerName}>{chatPlayer.name}</Text>
                <Text style={styles.headerStatus}>オンライン</Text>
              </View>
            </Pressable>
          ),
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={listItems}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={[styles.emptyChatText, { color: colors.textMuted }]}>
                メッセージを送ってみましょう
              </Text>
            </View>
          }
        />

        {/* Input bar — glassmorphism */}
        <View style={[styles.inputBarWrap, { backgroundColor: colors.background }]}>
          <View style={[styles.inputBar, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <Pressable
              onPress={handlePickImage}
              style={[styles.mediaBtn, { backgroundColor: colors.goldMuted, borderColor: colors.gold }]}
            >
              <ImageIcon size={22} color={colors.gold} />
            </Pressable>

            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.divider }]}
              placeholder={t('type_message', language)}
              placeholderTextColor={colors.textMuted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={1000}
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
            />

            <Pressable
              onPress={handleSend}
              style={[
                styles.sendBtn,
                { backgroundColor: inputText.trim() ? colors.gold : colors.surfaceHighlight },
              ]}
              disabled={!inputText.trim()}
            >
              <Send size={20} color={inputText.trim() ? colors.white : colors.textMuted} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <EmojiPicker
        visible={pickerTarget !== null}
        onSelect={emoji => {
          if (pickerTarget) handleAddReaction(pickerTarget, emoji);
          setPickerTarget(null);
        }}
        onClose={() => setPickerTarget(null)}
        colors={colors}
      />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    keyboardView: {
      flex: 1,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    notFoundText: {
      fontSize: 16,
      color: colors.textMuted,
    },
    // Header
    headerTitle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    headerAvatarWrapper: {
      position: 'relative',
    },
    headerAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceLight,
    },
    headerOnlineDot: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 11,
      height: 11,
      borderRadius: 6,
      backgroundColor: '#22C55E',
      borderWidth: 2,
      borderColor: colors.background,
    },
    headerName: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: colors.textPrimary,
    },
    headerStatus: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 1,
    },
    // Messages list
    messagesList: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 10,
    },
    emptyChat: {
      alignItems: 'center',
      paddingTop: 80,
    },
    emptyChatText: {
      fontSize: 14,
    },
    // Bubble rows
    bubbleRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
    },
    bubbleRowMe: {
      justifyContent: 'flex-end',
    },
    bubbleRowOther: {
      justifyContent: 'flex-start',
    },
    bubbleRowContinue: {
      marginBottom: 2,
    },
    bubbleRowLast: {
      marginBottom: 12,
    },
    bubbleAvatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.surfaceLight,
      marginBottom: 4,
    },
    avatarSpacer: {
      width: 30,
    },
    bubbleCol: {
      maxWidth: '75%',
      gap: 3,
    },
    bubbleColMe: {
      alignItems: 'flex-end',
    },
    senderName: {
      fontSize: 11,
      fontWeight: '500' as const,
      marginLeft: 4,
      marginBottom: 2,
    },
    bubble: {
      paddingHorizontal: 18,
      paddingVertical: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    bubbleMe: {
      backgroundColor: colors.gold,
    },
    bubbleOther: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    bubbleText: {
      fontSize: 15,
      lineHeight: 22,
    },
    bubbleTextMe: {
      color: colors.white,
    },
    bubbleTextOther: {
      color: colors.textPrimary,
    },
    imageMessage: {
      width: 200,
      height: 150,
      borderRadius: 12,
    },
    // Meta row (time + read receipt)
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 2,
      marginTop: 3,
    },
    metaRowMe: {
      justifyContent: 'flex-end',
    },
    metaTime: {
      fontSize: 10,
      color: colors.textMuted,
    },
    // Reactions
    reactionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      paddingHorizontal: 2,
    },
    reactionRowMe: {
      justifyContent: 'flex-end',
    },
    reactionBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 12,
      gap: 2,
      borderWidth: 1,
    },
    reactionEmoji: {
      fontSize: 14,
    },
    reactionCount: {
      fontSize: 12,
      fontWeight: '600' as const,
    },
    // Input bar — glassmorphism / modern
    inputBarWrap: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: Platform.OS === 'ios' ? 28 : 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.divider,
    },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 10,
      paddingVertical: 8,
      paddingBottom: Platform.OS === 'ios' ? 10 : 8,
      gap: 10,
      borderRadius: 24,
      borderWidth: 1,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    mediaBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
    },
    input: {
      flex: 1,
      borderRadius: 20,
      borderWidth: 1,
      paddingHorizontal: 18,
      paddingVertical: Platform.OS === 'ios' ? 12 : 10,
      fontSize: 15,
      maxHeight: 120,
      minHeight: 44,
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
