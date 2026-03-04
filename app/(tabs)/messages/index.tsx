import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeImage } from '@/components/SafeImage';
import { useRouter } from 'expo-router';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Search, MessageCircle, Trash2, CheckCheck, ShieldOff } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { useAuth } from '@/providers/AuthProvider';
import { Conversation, Message } from '@/types';
import { supabase } from '@/utils/supabaseClient';
import { t, getTimeAgo } from '@/utils/translations';
import { primeMessageNotificationSound } from '@/utils/messageNotificationSound';

interface SupabaseMessage {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

// ─── Swipeable Row ────────────────────────────────────────────────────────────

function SwipeableConversation({
  item,
  onPress,
  onRead,
  onDelete,
  onBlock,
  language,
  colors,
  styles,
}: {
  item: Conversation;
  onPress: () => void;
  onRead: () => void;
  onDelete: () => void;
  onBlock: () => void;
  language: string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const swipeRef = useRef<Swipeable>(null);
  const { currentUserId } = useChess();

  const close = useCallback(() => swipeRef.current?.close(), []);
  const handleRead = useCallback(() => { close(); onRead(); }, [close, onRead]);
  const handleDelete = useCallback(() => { close(); onDelete(); }, [close, onDelete]);
  const handleBlock = useCallback(() => { close(); onBlock(); }, [close, onBlock]);

  const renderRightActions = useCallback(() => (
    <View style={styles.rightActions}>
      <Pressable style={[styles.actionBtn, { backgroundColor: '#3B82F6' }]} onPress={handleRead}>
        <CheckCheck size={20} color="#fff" />
        <Text style={styles.actionLabel}>{t('mark_read', language)}</Text>
      </Pressable>
      <Pressable style={[styles.actionBtn, { backgroundColor: '#EF4444' }]} onPress={handleDelete}>
        <Trash2 size={20} color="#fff" />
        <Text style={styles.actionLabel}>{t('delete_conversation', language)}</Text>
      </Pressable>
      <Pressable style={[styles.actionBtn, { backgroundColor: '#F97316' }]} onPress={handleBlock}>
        <ShieldOff size={20} color="#fff" />
        <Text style={styles.actionLabel}>{t('block_user', language)}</Text>
      </Pressable>
    </View>
  ), [handleRead, handleDelete, handleBlock, styles]);

  const isUnread = item.unreadCount > 0;
  const timeAgo = getTimeAgo(item.lastMessage.timestamp, language);
  const isFromMe =
    item.lastMessage.senderId === currentUserId ||
    item.lastMessage.senderId === 'me';
  const previewText = item.lastMessage.text.startsWith('__IMG__')
    ? '📷 画像'
    : item.lastMessage.text;

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
      friction={2}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.conversationItem,
          pressed && styles.conversationPressed,
        ]}
      >
        {/* Avatar */}
        <View style={styles.avatarWrapper}>
          <SafeImage
            uri={item.player.avatar}
            name={item.player.name}
            style={styles.avatar}
            contentFit="cover"
          />
          {item.player.isOnline && <View style={styles.onlineDot} />}
        </View>

        {/* Content */}
        <View style={styles.conversationBody}>
          <View style={styles.conversationHeader}>
            <Text
              style={[styles.playerName, isUnread && styles.playerNameUnread]}
              numberOfLines={1}
            >
              {item.player.name}
            </Text>
            <Text style={[styles.timestamp, isUnread && styles.timestampUnread]}>
              {timeAgo}
            </Text>
          </View>

          <View style={styles.previewRow}>
            <Text
              style={[styles.previewText, isUnread && styles.previewTextUnread]}
              numberOfLines={1}
            >
              {isFromMe ? '自分: ' : ''}{previewText}
            </Text>
            {isUnread && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    </Swipeable>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MessagesScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { language, currentUserId, fetchPlayerProfile, blockedUsers, blockUser } = useChess();
  const { isLoggedIn } = useAuth();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Load conversations ─────────────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    if (!currentUserId || currentUserId === 'me') {
      setLoading(false);
      return;
    }

    try {
      const { data: messagesData, error } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${currentUserId},room_id.ilike.%${currentUserId}%`)
        .order('created_at', { ascending: false });

      if (error || !messagesData || messagesData.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      const roomMap = new Map<string, SupabaseMessage[]>();
      messagesData.forEach((msg: SupabaseMessage) => {
        const existing = roomMap.get(msg.room_id) ?? [];
        existing.push(msg);
        roomMap.set(msg.room_id, existing);
      });

      const convs: Conversation[] = [];

      for (const [roomId, msgs] of roomMap.entries()) {
        const parts = roomId.split('_');
        const otherUserId = parts.find(p => p !== currentUserId);
        if (!otherUserId) continue;
        if (blockedUsers.includes(otherUserId)) continue;

        const player = await fetchPlayerProfile(otherUserId);
        if (!player) continue;

        const sorted = [...msgs].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        const messages: Message[] = sorted.map(m => ({
          id: m.id,
          senderId: m.sender_id,
          text: m.content,
          timestamp: m.created_at,
          read: m.is_read,
        }));

        const lastMsg = sorted[sorted.length - 1];
        const unreadCount = sorted.filter(
          m => m.sender_id !== currentUserId && !m.is_read
        ).length;

        convs.push({
          id: roomId,
          player,
          lastMessage: {
            id: lastMsg.id,
            senderId: lastMsg.sender_id,
            text: lastMsg.content,
            timestamp: lastMsg.created_at,
            read: lastMsg.is_read,
          },
          messages,
          unreadCount,
        });
      }

      convs.sort(
        (a, b) =>
          new Date(b.lastMessage.timestamp).getTime() -
          new Date(a.lastMessage.timestamp).getTime()
      );

      setConversations(convs);
    } catch (e) {
      console.log('Messages: Failed to load conversations', e);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, fetchPlayerProfile, blockedUsers]);

  useEffect(() => {
    if (isLoggedIn && currentUserId && currentUserId !== 'me') {
      loadConversations();
    } else {
      setLoading(false);
    }
  }, [isLoggedIn, currentUserId, loadConversations]);

  // メッセージ詳細から戻ったときに一覧の未読バッジを即時反映
  useFocusEffect(
    useCallback(() => {
      if (isLoggedIn && currentUserId && currentUserId !== 'me') {
        loadConversations();
      }
    }, [isLoggedIn, currentUserId, loadConversations])
  );

  // ── Realtime ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentUserId || currentUserId === 'me') return;

    const channel = supabase
      .channel('messages-list-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        const msg = payload.new as SupabaseMessage;
        if (msg.sender_id === currentUserId || msg.room_id.includes(currentUserId)) {
          loadConversations();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUserId, loadConversations]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const markConversationRead = useCallback(async (roomId: string) => {
    console.log('Notification cleared by: markConversationRead (list swipe)', roomId);
    setConversations(prev =>
      prev.map(c => c.id !== roomId ? c : {
        ...c,
        unreadCount: 0,
        lastMessage: { ...c.lastMessage, read: true },
        messages: c.messages.map(m => ({ ...m, read: true })),
      })
    );
    if (currentUserId && currentUserId !== 'me') {
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('room_id', roomId)
        .neq('sender_id', currentUserId)
        .eq('is_read', false);
    }
  }, [currentUserId]);

  const handleConversationPress = useCallback((conv: Conversation) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // 会話をタップしたタイミングで通知音用 AudioContext をウォームアップ
    primeMessageNotificationSound().catch(() => {});
    // NOTE: markConversationRead は呼ばない。既読処理はトークルーム([id].tsx)を開いた時のみ実行する
    // markConversationRead(conv.id);  // ← 自動既読をここで実行するとバッジが即消えるため無効化
    router.push(`/messages/${conv.id}` as any);
  }, [router]);

  const handleRead = useCallback((roomId: string) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // スワイプ「既読」アクションのみ markConversationRead を呼ぶ（ユーザーの明示的操作）
    markConversationRead(roomId);
  }, [markConversationRead]);

  const handleDelete = useCallback((convId: string) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(t('delete_conversation', language), t('delete_conversation_confirm', language), [
      { text: t('cancel', language), style: 'cancel' },
      {
        text: t('delete_conversation', language),
        style: 'destructive',
        onPress: () => setConversations(prev => prev.filter(c => c.id !== convId)),
      },
    ]);
  }, []);

  const handleBlock = useCallback((conv: Conversation) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      t('block_confirm', language),
      language === 'ja' ? `${conv.player.name}をブロックしますか？` : `Block ${conv.player.name}?`,
      [
        { text: t('cancel', language), style: 'cancel' },
        {
          text: t('block_user', language),
          style: 'destructive',
          onPress: async () => {
            await blockUser(conv.player.id);
            setConversations(prev => prev.filter(c => c.id !== conv.id));
          },
        },
      ]
    );
  }, [blockUser, language]);

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(c => c.player.name.toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  const renderConversation = useCallback(({ item }: { item: Conversation }) => (
    <SwipeableConversation
      item={item}
      onPress={() => handleConversationPress(item)}
      onRead={() => handleRead(item.id)}
      onDelete={() => handleDelete(item.id)}
      onBlock={() => handleBlock(item)}
      language={language}
      colors={colors}
      styles={styles}
    />
  ), [handleConversationPress, handleRead, handleDelete, handleBlock, language, colors, styles]);

  // ── Not logged in ──────────────────────────────────────────────────────────

  if (!isLoggedIn) {
    return (
      <View style={styles.container}>
        <View style={styles.loginPrompt}>
          <View style={styles.loginIconContainer}>
            <MessageCircle size={52} color={colors.gold} />
          </View>
          <Text style={styles.loginTitle}>{t('messages', language)}</Text>
          <Text style={styles.loginSubtitle}>{t('login_prompt_desc', language)}</Text>
          <Pressable onPress={() => router.push('/login' as any)} style={styles.loginButton}>
            <Text style={styles.loginButtonText}>{t('login', language)}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Search bar — 通知バッジは各リスト項目とメニューアイコンのみに表示 */}
      <View style={styles.searchBar}>
        <Search size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('search', language)}
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.gold} />
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          renderItem={renderConversation}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <MessageCircle size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>{t('no_messages', language)}</Text>
              <Text style={styles.emptySubtitle}>{t('start_chatting', language)}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    // Search
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 6,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 42,
      gap: 10,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: colors.textPrimary,
    },
    // List
    listContent: {
      paddingTop: 4,
      paddingBottom: 24,
    },
    // Swipeable actions
    rightActions: {
      flexDirection: 'row',
      width: 198,
    },
    actionBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
    },
    actionLabel: {
      fontSize: 11,
      fontWeight: '600' as const,
      color: '#ffffff',
      textAlign: 'center' as const,
    },
    // Conversation row — no bottom border, spacing via padding only
    conversationItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 13,
      gap: 14,
      backgroundColor: colors.background,
    },
    conversationPressed: {
      backgroundColor: colors.surfaceLight,
    },
    avatarWrapper: {
      position: 'relative',
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.surfaceLight,
    },
    onlineDot: {
      position: 'absolute',
      bottom: 2,
      right: 2,
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: '#22C55E',
      borderWidth: 2.5,
      borderColor: colors.background,
    },
    conversationBody: {
      flex: 1,
      gap: 4,
    },
    conversationHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    playerName: {
      fontSize: 15,
      fontWeight: '500' as const,
      color: colors.textPrimary,
      flex: 1,
    },
    playerNameUnread: {
      fontWeight: '700' as const,
    },
    timestamp: {
      fontSize: 12,
      color: colors.textMuted,
      marginLeft: 8,
    },
    timestampUnread: {
      color: colors.gold,
      fontWeight: '600' as const,
    },
    previewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    previewText: {
      flex: 1,
      fontSize: 14,
      color: colors.textMuted,
      lineHeight: 19,
    },
    previewTextUnread: {
      color: colors.textSecondary,
      fontWeight: '500' as const,
    },
    badge: {
      backgroundColor: '#EF4444',
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700' as const,
      color: '#ffffff',
    },
    // Empty / loading
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 80,
      paddingHorizontal: 40,
      gap: 14,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600' as const,
      color: colors.textPrimary,
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center' as const,
      lineHeight: 21,
    },
    // Login prompt
    loginPrompt: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 40,
    },
    loginIconContainer: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.goldMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    loginTitle: {
      fontSize: 24,
      fontWeight: '700' as const,
      color: colors.textPrimary,
      marginBottom: 10,
    },
    loginSubtitle: {
      fontSize: 15,
      color: colors.textMuted,
      textAlign: 'center' as const,
      marginBottom: 32,
      lineHeight: 23,
    },
    loginButton: {
      backgroundColor: colors.gold,
      paddingHorizontal: 40,
      paddingVertical: 15,
      borderRadius: 16,
    },
    loginButtonText: {
      fontSize: 16,
      fontWeight: '700' as const,
      color: colors.white,
    },
  });
}
