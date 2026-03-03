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
  Alert,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Send, Image as ImageIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { Message, Player } from '@/types';
import { supabase } from '@/utils/supabaseClient';
import { t, getTimeAgo } from '@/utils/translations';
import { BackNavButton } from '@/components/BackNavButton';
import {
  uploadMessageImage,
  encodeImageContent,
  decodeMessageContent,
  isImageMessageContent,
  getImageUrlFromContent,
  isLoadableImageUrl,
} from '@/utils/messageImageUpload';

interface SupabaseMessage {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  image_url?: string | null;
}

function mapRow(m: SupabaseMessage): Message {
  return {
    id: m.id,
    senderId: m.sender_id,
    text: m.content,
    timestamp: m.created_at,
    read: m.is_read,
    imageUrl: m.image_url ?? undefined,
  };
}

export default function ChatScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { language, currentUserId, fetchPlayerProfile } = useChess();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const pendingTempIds = useRef<Set<string>>(new Set());

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [chatPlayer, setChatPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const roomId = id ?? '';
  const isNewConversation = roomId.startsWith('new_');
  const playerIdFromNew = isNewConversation ? roomId.replace('new_', '') : null;

  const currentUserIdRef = useRef(currentUserId);
  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    if (!roomId) {
      setLoading(false);
      return;
    }
    if (!currentUserId) {
      console.log('Chat: waiting for currentUserId');
      return;
    }

    setLoading(true);

    const loadChat = async () => {
      console.log('Chat: load START roomId=' + roomId + ' uid=' + currentUserId);
      try {
        if (isNewConversation && playerIdFromNew) {
          const player = await fetchPlayerProfile(playerIdFromNew);
          setChatPlayer(player);
          setMessages([]);
          return;
        }

        const sep = roomId.indexOf('_', 30);
        let otherUserId: string | undefined;
        if (sep > 0) {
          const a = roomId.slice(0, sep);
          const b = roomId.slice(sep + 1);
          otherUserId = a === currentUserId ? b : a;
        }
        console.log('Chat: otherUserId=' + otherUserId);

        if (otherUserId) {
          const player = await fetchPlayerProfile(otherUserId);
          setChatPlayer(player);
        }

        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('room_id', roomId)
          .order('created_at', { ascending: true });

        if (error) {
          console.log('Chat: query error ' + error.message);
        } else {
          console.log('Chat: fetched ' + (data ? data.length : 0) + ' rows');
          setMessages((data ?? []).map(mapRow));
          if (data && data.length > 0) {
            await supabase
              .from('messages')
              .update({ is_read: true })
              .eq('room_id', roomId)
              .neq('sender_id', currentUserId)
              .eq('is_read', false);
          }
        }
      } catch (e) {
        console.log('Chat: load exception ' + String(e));
      } finally {
        setLoading(false);
      }
    };

    loadChat();
  }, [roomId, currentUserId, isNewConversation, playerIdFromNew, fetchPlayerProfile]);

  useEffect(() => {
    if (!roomId || isNewConversation) return;

    const channelName = 'chat_screen_' + roomId;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const state: { channel: ReturnType<typeof supabase.channel> | null } = { channel: null };

    const buildChannel = () => {
      if (state.channel) {
        supabase.removeChannel(state.channel);
        state.channel = null;
      }
      console.log('Chat: RT connecting ' + channelName);

      state.channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: 'room_id=eq.' + roomId,
          },
          async (payload) => {
            const msg = payload.new as SupabaseMessage;
            const uid = currentUserIdRef.current;
            console.log('Chat: RT INSERT ' + msg.id + ' sender=' + msg.sender_id);

            const newMsg = mapRow(msg);
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              if (msg.sender_id === uid && pendingTempIds.current.size > 0) {
                const idx = prev.findIndex(
                  (m) => pendingTempIds.current.has(m.id) && m.text === newMsg.text,
                );
                if (idx !== -1) {
                  const updated = [...prev];
                  const tempId = updated[idx].id;
                  updated[idx] = { ...updated[idx], id: newMsg.id };
                  pendingTempIds.current.delete(tempId);
                  return updated;
                }
              }
              return [...prev, newMsg];
            });

            if (msg.sender_id !== uid) {
              await supabase
                .from('messages')
                .update({ is_read: true })
                .eq('id', msg.id);
            }
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
          },
        )
        .subscribe((status, err) => {
          if (err) {
            console.log('Chat: RT error ' + String(err));
          } else {
            console.log('Chat: RT status ' + status);
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            retryTimer = setTimeout(buildChannel, 3000);
          }
        });
    };

    buildChannel();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (state.channel) supabase.removeChannel(state.channel);
    };
  }, [roomId, isNewConversation]);

  const getActualRoomId = useCallback((): string => {
    if (!isNewConversation) return roomId;
    if (playerIdFromNew && currentUserId) {
      return [currentUserId, playerIdFromNew].sort().join('_');
    }
    return roomId;
  }, [roomId, isNewConversation, playerIdFromNew, currentUserId]);

  const sendContent = useCallback(
    async (content: string): Promise<boolean> => {
      if (!currentUserId) return false;
      const actualRoomId = getActualRoomId();

      const tempId = 'msg_temp_' + Date.now();
      const tempMsg: Message = {
        id: tempId,
        senderId: currentUserId,
        text: content,
        timestamp: new Date().toISOString(),
        read: true,
      };
      pendingTempIds.current.add(tempId);
      setMessages((prev) => [...prev, tempMsg]);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);

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
          pendingTempIds.current.delete(tempId);
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...m, id: data.id } : m)),
          );
          return true;
        }
        if (error) {
          pendingTempIds.current.delete(tempId);
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          console.log('Chat: send error ' + error.message);
          Alert.alert(t('error', language), `送信に失敗しました: ${error.message}`);
        }
        return false;
      } catch (e) {
        pendingTempIds.current.delete(tempId);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        const msg = e instanceof Error ? e.message : String(e);
        console.log('Chat: send failed ' + String(e));
        Alert.alert(t('error', language), `送信に失敗しました: ${msg}`);
        return false;
      }
    },
    [currentUserId, getActualRoomId, language],
  );

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !currentUserId) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const ok = await sendContent(text);
    if (ok) setInputText('');
  }, [inputText, currentUserId, sendContent]);

  const handlePickImage = useCallback(async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'アクセス許可が必要です',
          'フォトライブラリへのアクセスを許可してください。',
        );
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
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
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
      console.log('Chat: image pick failed ' + String(e));
    }
  }, [sendContent, getActualRoomId, language]);

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      const isMe = item.senderId === currentUserId;
      const isImg = isImageMessageContent(item.text) || !!item.imageUrl;
      const imgUri = (isImg ? getImageUrlFromContent(item.text) || item.imageUrl : null) ?? null;

      return (
        <View
          style={[
            styles.messageBubbleRow,
            isMe ? styles.messageBubbleRowMe : styles.messageBubbleRowOther,
          ]}
        >
          {!isMe && chatPlayer ? (
            <Image
              source={{ uri: chatPlayer.avatar }}
              style={styles.messageBubbleAvatar}
              contentFit="cover"
            />
          ) : null}
          <View
            style={[
              styles.messageBubble,
              isMe ? styles.messageBubbleMe : styles.messageBubbleOther,
              isImg ? styles.messageBubbleImage : null,
            ]}
          >
            {isImg && imgUri && isLoadableImageUrl(imgUri) ? (
              <Image
                source={{ uri: imgUri }}
                style={styles.imageMessage}
                contentFit="cover"
              />
            ) : isImg && imgUri ? (
              <Text style={[styles.messageText, isMe ? styles.messageTextMe : styles.messageTextOther]}>📷 画像</Text>
            ) : (
              <Text
                style={[
                  styles.messageText,
                  isMe ? styles.messageTextMe : styles.messageTextOther,
                ]}
              >
                {item.text}
              </Text>
            )}
            <Text
              style={[
                styles.messageTime,
                isMe ? styles.messageTimeMe : styles.messageTimeOther,
              ]}
            >
              {getTimeAgo(item.timestamp, language)}
            </Text>
          </View>
        </View>
      );
    },
    [chatPlayer, language, styles, currentUserId],
  );

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
          <Text style={styles.notFoundText}>
            {t('conversation_not_found', language)}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerLeft: () => <BackNavButton onPress={() => router.back()} />,
          headerTitle: () => (
            <Pressable
              onPress={() => router.push(('/player/' + chatPlayer.id) as any)}
              style={styles.headerTitle}
            >
              <Image
                source={{ uri: chatPlayer.avatar }}
                style={styles.headerAvatar}
                contentFit="cover"
              />
              <View>
                <Text style={styles.headerName}>{chatPlayer.name}</Text>
                <Text style={styles.headerStatus}>{'オンライン'}</Text>
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
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>{'メッセージを送ってみましょう'}</Text>
            </View>
          }
        />

        <View style={styles.inputBar}>
          <Pressable
            onPress={handlePickImage}
            style={[
              styles.mediaBtn,
              {
                backgroundColor: colors.goldMuted,
                borderWidth: 1.5,
                borderColor: colors.gold,
              },
            ]}
            disabled={isUploadingImage}
          >
            {isUploadingImage ? (
              <ActivityIndicator size="small" color={colors.gold} />
            ) : (
              <ImageIcon size={22} color={colors.gold} />
            )}
          </Pressable>

          <TextInput
            style={styles.input}
            placeholder={t('type_message', language)}
            placeholderTextColor={colors.textMuted}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            returnKeyType="send"
          />

          <Pressable
            onPress={handleSend}
            style={[
              styles.sendButton,
              !inputText.trim() ? styles.sendButtonDisabled : null,
            ]}
            disabled={!inputText.trim()}
          >
            <Send
              size={18}
              color={inputText.trim() ? colors.white : colors.textMuted}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    keyboardView: { flex: 1 },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    notFoundText: { fontSize: 16, color: colors.textMuted },
    emptyText: { fontSize: 14, color: colors.textMuted },
    headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.surfaceLight,
    },
    headerName: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: colors.textPrimary,
    },
    headerStatus: { fontSize: 11, color: colors.textMuted },
    messagesList: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
    messageBubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    messageBubbleRowMe: { justifyContent: 'flex-end' },
    messageBubbleRowOther: { justifyContent: 'flex-start' },
    messageBubbleAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.surfaceLight,
    },
    messageBubble: {
      maxWidth: '75%',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
    },
    messageBubbleImage: { padding: 4 },
    imageMessage: { width: 200, height: 150, borderRadius: 12 },
    messageBubbleMe: {
      backgroundColor: colors.gold,
      borderBottomRightRadius: 4,
    },
    messageBubbleOther: {
      backgroundColor: colors.surface,
      borderBottomLeftRadius: 4,
    },
    messageText: { fontSize: 15, lineHeight: 21 },
    messageTextMe: { color: colors.white },
    messageTextOther: { color: colors.textPrimary },
    messageTime: { fontSize: 10, marginTop: 4 },
    messageTimeMe: {
      color: 'rgba(255,255,255,0.6)',
      textAlign: 'right' as const,
    },
    messageTimeOther: { color: colors.textMuted },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      backgroundColor: colors.background,
    },
    mediaBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    input: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.textPrimary,
      maxHeight: 100,
      minHeight: 40,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.gold,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: { backgroundColor: colors.surfaceLight },
  });
}
