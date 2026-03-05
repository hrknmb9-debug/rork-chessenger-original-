import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
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
  InteractionManager,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { SafeImage } from '@/components/SafeImage';
import { Send, Image as ImageIcon, Check, CheckCheck, X, Languages } from 'lucide-react-native';
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
import {
  uploadMessageImage,
  encodeImageContent,
  decodeMessageContent,
  isLoadableImageUrl,
} from '@/utils/messageImageUpload';
import { translateText, getTargetLanguage, decodeForDisplay, onTranslationComplete } from '@/utils/translateText';

// ── Constants ──────────────────────────────────────────────────────────────────

const EMOJI_LIST = ['❤️', '👍', '😂', '😮', '😢', '🎉', '🔥', '👏'];

interface SupabaseMessage {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  image_url?: string | null;
}

type ListItem =
  | { kind: 'date'; id: string; label: string }
  | { kind: 'message'; id: string; msg: Message; isFirst: boolean; isLast: boolean };

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDateLabel(isoStr: string, language: string): string {
  const d = new Date(isoStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t('today', language);
  if (d.toDateString() === yesterday.toDateString()) return t('yesterday', language);
  return language === 'ja' ? `${d.getMonth() + 1}月${d.getDate()}日` : `${d.getMonth() + 1}/${d.getDate()}`;
}

function buildListItems(messages: Message[], language: string): ListItem[] {
  const items: ListItem[] = [];
  let lastDateKey = '';

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const dateKey = new Date(msg.timestamp).toDateString();

    if (dateKey !== lastDateKey) {
      items.push({ kind: 'date', id: `date_${dateKey}_${i}`, label: formatDateLabel(msg.timestamp, language) });
      lastDateKey = dateKey;
    }

    const prev = messages[i - 1];
    const next = messages[i + 1];
    const prevKey = prev ? new Date(prev.timestamp).toDateString() : '';
    const nextKey = next ? new Date(next.timestamp).toDateString() : '';

    const isFirst = !prev || prev.senderId !== msg.senderId || prevKey !== dateKey;
    const isLast = !next || next.senderId !== msg.senderId || nextKey !== dateKey;

    const messageId = (msg.id && String(msg.id).trim()) || `msg_${i}`;
    items.push({ kind: 'message', id: messageId, msg, isFirst, isLast });
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
    ...Platform.select({
      web: { boxShadow: '0px 10px 24px rgba(0,0,0,0.15)' },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 24 },
      default: { elevation: 12 },
    }),
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

const expandedImageStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  image: {
    flex: 1,
    width: '100%',
  },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
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
  onImagePress,
  reactions,
  setTranslationLock,
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
  onImagePress?: (url: string) => void;
  reactions: string[];
  setTranslationLock?: (active: boolean) => void;
}) {
  const [translationState, setTranslationState] = useState<{ localTranslatedContent: string | null; loading: boolean; renderKey?: number; displayReady: boolean }>({ localTranslatedContent: null, loading: false, displayReady: true });
  const { isImage, value } = decodeMessageContent(item.text);
  const originalText = decodeForDisplay(item.text ?? '');
  const isManualTranslationActive = translationState.loading || (translationState.localTranslatedContent != null && translationState.localTranslatedContent.trim() !== originalText.trim());
  const finalDisplaySource = translationState.localTranslatedContent ?? originalText;
  const displayText = decodeForDisplay(finalDisplaySource);
  const textToRender = displayText || originalText;

  useEffect(() => {
    if (__DEV__ && Platform.OS === 'ios' && textToRender) {
      console.log('[translate:ios] SUCCESS: Data rendered');
    }
  }, [textToRender]);

  useEffect(() => {
    if (isManualTranslationActive) return;
    setTranslationState({ localTranslatedContent: null, loading: false, displayReady: true });
  }, [item.id, language, isManualTranslationActive]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const sub = onTranslationComplete((e) => {
      if (e.itemId !== item.id) return;
      const text = decodeForDisplay(e.text);
      if (__DEV__ && !text?.trim()) console.error('[translate:ios] ERROR: Result is empty or undefined');
      InteractionManager.runAfterInteractions(() => {
        setTranslationState({ localTranslatedContent: text || null, loading: false, displayReady: false });
        setTimeout(() => {
          setTranslationState({ localTranslatedContent: text || null, loading: false, renderKey: Date.now(), displayReady: true });
          setTranslationLock?.(false);
          if (__DEV__) {
            console.log('[translate:msg] Event received, applied');
            console.log('[translate:ios] DISPLAYING TEXT:', text?.slice(0, 60) ?? '(empty)');
          }
        }, 0);
      });
    });
    return () => sub.remove();
  }, [item.id, setTranslationLock]);
  const imageUrl = isImage ? (value || (item.imageUrl ?? undefined)) : (item.imageUrl ?? undefined);
  const hasTranslatableText = !isImage && item.text?.trim().length > 0;
  const timeStr = getTimeAgo(item.timestamp, language);

  const handleTranslate = useCallback(async () => {
    if (translationState.loading || !hasTranslatableText) return;
    if (translationState.localTranslatedContent) {
      setTranslationState({ localTranslatedContent: null, loading: false, displayReady: true });
      setTranslationLock?.(false);
      return;
    }
    setTranslationLock?.(true);
    setTranslationState(prev => ({ ...prev, loading: true }));
    let didSetResult = false;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const result = await translateText(item.text, getTargetLanguage(language), session?.access_token, { itemId: item.id });
      if ('text' in result) {
        const decoded = decodeForDisplay(result.text);
        if (decoded.trim()) {
          if (Platform.OS !== 'ios') {
            setTranslationState({ localTranslatedContent: decoded, loading: false, renderKey: Date.now(), displayReady: true });
            setTranslationLock?.(false);
            if (__DEV__) console.log('[translate:ios] DISPLAYING TEXT (msg):', decoded.slice(0, 60));
            didSetResult = true;
          }
        }
      } else if ('error' in result) {
        if (__DEV__) console.warn('[translate]', result.error);
        Alert.alert(t('error', language), t('translation_failed', language));
      }
    } finally {
      if (!didSetResult) setTranslationState(prev => ({ ...prev, loading: false, displayReady: true }));
      setTranslationLock?.(false);
    }
  }, [hasTranslatableText, item.text, language, translationState.localTranslatedContent, translationState.loading, setTranslationLock]);

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
          {(isImage || imageUrl) && imageUrl && isLoadableImageUrl(imageUrl) ? (
            <Pressable onPress={() => onImagePress?.(imageUrl)} style={styles.imageMessageWrap}>
              <SafeImage uri={imageUrl} name="" style={styles.imageMessage} contentFit="cover" />
            </Pressable>
          ) : (isImage || imageUrl) && imageUrl ? (
            <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextOther]}>📷 画像</Text>
          ) : (
            <View key={translationState.renderKey ?? `msg-${item.id}`}>
              <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextOther]}>
                {textToRender}
              </Text>
              {translationState.localTranslatedContent != null && translationState.localTranslatedContent.trim() !== (item.text ?? '').trim() && (
                <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextOther, { fontSize: 10, opacity: 0.8, marginTop: 2 }]}>
                  {t('translated_by_ai', language)}
                </Text>
              )}
            </View>
          )}
        </Pressable>

        {/* Translate button - for text messages from others */}
        {hasTranslatableText && !isMe && isLast && (
          <Pressable onPress={handleTranslate} disabled={translationState.loading} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, marginLeft: 4, paddingVertical: 2 }}>
            {translationState.loading ? (
              <ActivityIndicator size="small" color={colors.gold} style={{ transform: [{ scale: 0.8 }] }} />
            ) : (
              <Languages size={12} color={colors.textMuted} />
            )}
            <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '500' }}>
              {translationState.loading ? t('translating', language) : translationState.localTranslatedContent ? t('original', language) : t('translate', language)}
            </Text>
          </Pressable>
        )}

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
  const { language, currentUserId, fetchPlayerProfile, refreshUnreadMessageCounts, setTranslationLock } = useChess();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [chatPlayer, setChatPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [messageReactions, setMessageReactions] = useState<Record<string, string[]>>({});
  const [pickerTarget, setPickerTarget] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [expandedImageUrl, setExpandedImageUrl] = useState<string | null>(null);

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
            imageUrl: m.image_url ?? undefined,
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
        if (msg.sender_id === currentUserId) return;
        const newMsg: Message = {
          id: msg.id,
          senderId: msg.sender_id,
          text: msg.content,
          timestamp: msg.created_at ?? new Date().toISOString(),
          read: msg.is_read,
          imageUrl: msg.image_url ?? undefined,
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

  const sendContent = useCallback(async (content: string): Promise<boolean> => {
    if (!currentUserId) return false;
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
      const { isImage, value: imageUrl } = decodeMessageContent(content);
      const payload: Record<string, unknown> = {
        room_id: actualRoomId,
        sender_id: currentUserId,
        content,
        is_read: false,
      };
      if (isImage && imageUrl) payload.image_url = imageUrl;
      const { data, error } = await supabase
        .from('messages')
        .insert(payload)
        .select()
        .single();

      if (data && !error) {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: data.id } : m));
        return true;
      }
      if (error) {
        console.log('Chat: Send failed', error.message);
        setMessages(prev => prev.filter(m => m.id !== tempId));
        Alert.alert(t('error', language), `送信に失敗しました: ${error.message}`);
      }
      return false;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('Chat: Send failed', e);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      Alert.alert(t('error', language), `送信に失敗しました: ${msg}`);
      return false;
    }
  }, [currentUserId, getActualRoomId, language]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    primeMessageNotificationSound().catch(() => {});
    const ok = await sendContent(text);
    if (ok) setInputText('');
  }, [inputText, sendContent]);

  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;
  const onSendPress = useCallback(() => {
    handleSendRef.current();
  }, []);

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
        primeMessageNotificationSound().catch(() => {});

        const actualRoomId = getActualRoomId();
        const { data: { user } } = await supabase.auth.getUser();
        const authUserId = user?.id;
        if (!authUserId) {
          Alert.alert(t('error', language), 'ログイン情報を取得できなかったため、画像を送信できませんでした。');
          return;
        }

        setIsUploadingImage(true);
        try {
          const uploadResult = await uploadMessageImage(localUri, authUserId, actualRoomId, base64);
          if ('url' in uploadResult) {
            await sendContent(encodeImageContent(uploadResult.url));
          } else {
            Alert.alert(t('error', language), uploadResult.error);
          }
        } finally {
          setIsUploadingImage(false);
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

  const listItems = useMemo(() => buildListItems(messages, language), [messages, language]);

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
        onImagePress={setExpandedImageUrl}
        reactions={messageReactions[item.msg.id] ?? []}
        setTranslationLock={setTranslationLock}
      />
    );
  }, [chatPlayer, language, colors, styles, currentUserId, messageReactions, setTranslationLock]);

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: '', headerLeft: () => <BackNavButton onPress={() => router.replace('/messages' as any)} /> }} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.gold} />
        </View>
      </View>
    );
  }

  if (!chatPlayer) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: '', headerLeft: () => <BackNavButton onPress={() => router.replace('/messages' as any)} /> }} />
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
          headerLeft: () => <BackNavButton onPress={() => router.replace('/messages' as any)} />,
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
                <Text style={styles.headerStatus}>{t('online', language)}</Text>
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
          keyExtractor={(item, index) => (item.id && String(item.id).trim()) || `item_${index}`}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={[styles.emptyChatText, { color: colors.textMuted }]}>
                {t('empty_chat_hint', language)}
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
              disabled={isUploadingImage}
            >
              {isUploadingImage ? (
                <ActivityIndicator size="small" color={colors.gold} />
              ) : (
                <ImageIcon size={22} color={colors.gold} />
              )}
            </Pressable>

            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceLight, color: colors.textPrimary, borderColor: colors.divider }]}
              placeholder={t('type_message', language)}
              placeholderTextColor={colors.textMuted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={1000}
              onSubmitEditing={onSendPress}
              blurOnSubmit={false}
              returnKeyType="send"
            />

            <Pressable
              onPress={onSendPress}
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

      <Modal
        visible={expandedImageUrl !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setExpandedImageUrl(null)}
      >
        <Pressable
          style={expandedImageStyles.backdrop}
          onPress={() => setExpandedImageUrl(null)}
        >
          {expandedImageUrl ? (
            <Pressable style={expandedImageStyles.imageContainer} onPress={e => e.stopPropagation()}>
              <SafeImage
                uri={expandedImageUrl}
                name=""
                style={expandedImageStyles.image}
                contentFit="contain"
              />
            </Pressable>
          ) : null}
          <Pressable
            style={[expandedImageStyles.closeBtn, { backgroundColor: colors.surface }]}
            onPress={() => setExpandedImageUrl(null)}
          >
            <X size={24} color={colors.textPrimary} />
          </Pressable>
        </Pressable>
      </Modal>
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
      ...Platform.select({
        web: { boxShadow: '0px 1px 4px rgba(0,0,0,0.06)' },
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
        default: { elevation: 2 },
      }),
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
    imageMessageWrap: {
      width: 200,
      height: 150,
      borderRadius: 12,
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
      ...Platform.select({
        web: { boxShadow: '0px 2px 8px rgba(0,0,0,0.06)' },
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
        default: { elevation: 3 },
      }),
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
