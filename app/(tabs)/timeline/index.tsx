import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Animated,
  Platform,
  KeyboardAvoidingView,
  RefreshControl,
  Modal,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeImage } from '@/components/SafeImage';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import {
  Heart,
  MessageCircle,
  Send,
  Trophy,
  Search as SearchIcon,
  Swords,
  Award,
  Minus,
  X as XIcon,
  Camera,
  Calendar,
  MapPin,
  Users,
  CornerDownRight,
  Hourglass,
  Trash2,
  Languages,
} from 'lucide-react-native';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { TimelinePost, TimelineComment, TimelineEvent } from '@/types';
import { t, getTimeAgo } from '@/utils/translations';
import { uploadTimelineImage } from '@/utils/messageImageUpload';
import { supabase } from '@/utils/supabaseClient';
import { translateText, getTargetLanguage } from '@/utils/translateText';

const TEMPLATES = [
  { key: 'beginner', labelKey: 'template_beginner' },
  { key: 'competitive', labelKey: 'template_competitive' },
  { key: 'cafe', labelKey: 'template_cafe' },
  { key: 'online', labelKey: 'template_online' },
];

function CommentItem({
  comment,
  onReply,
  language,
  colors,
}: {
  comment: TimelineComment;
  onReply: (commentId: string) => void;
  language: string;
  colors: ThemeColors;
}) {
  const [translated, setTranslated] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const commentText = language === 'en' && comment.contentEn ? comment.contentEn : comment.content;
  const displayText = translated ?? commentText;

  const onTranslate = useCallback(async () => {
    if (translating || !commentText?.trim()) return;
    if (translated) {
      setTranslated(null);
      return;
    }
    setTranslating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const result = await translateText(commentText, getTargetLanguage(language), session?.access_token);
      if ('text' in result) setTranslated(result.text);
    } finally {
      setTranslating(false);
    }
  }, [commentText, language, translated, translating]);

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <SafeImage uri={comment.author.avatar} name={comment.author.name} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceLight }} contentFit="cover" />
        <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '600' as const, color: colors.textPrimary, marginBottom: 2 }}>{comment.author.name}</Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18 }}>{displayText}</Text>
          {translated && (
            <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 2, fontStyle: 'italic' }}>{t('translated_by_ai', language)}</Text>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <Pressable onPress={() => onReply(comment.id)}>
              <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '500' as const }}>{t('reply', language)}</Text>
            </Pressable>
            <Pressable onPress={onTranslate} disabled={translating}>
              <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: '500' as const }}>
                {translating ? '...' : translated ? t('original', language) : t('translate', language)}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
      {comment.replies && comment.replies.length > 0 && (
        <View style={{ marginLeft: 36, marginTop: 6, gap: 6 }}>
          {comment.replies.map(reply => (
            <View key={reply.id} style={{ flexDirection: 'row', gap: 6 }}>
              <CornerDownRight size={12} color={colors.textMuted} style={{ marginTop: 8 }} />
              <SafeImage uri={reply.author.avatar} name={reply.author.name} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surfaceLight }} contentFit="cover" />
              <View style={{ flex: 1, backgroundColor: colors.surfaceLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '600' as const, color: colors.textPrimary }}>{reply.author.name}</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>{reply.content}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function PostCard({
  post,
  onLike,
  onComment,
  onAuthorPress,
  onImagePress,
  onDelete,
  isOwnPost,
  language,
}: {
  post: TimelinePost;
  onLike: (id: string) => void;
  onComment: (id: string, text: string, parentId?: string) => void;
  onAuthorPress: (id: string) => void;
  onImagePress?: (url: string) => void;
  onDelete?: (id: string) => void;
  isOwnPost: boolean;
  language: string;
}) {
  const { colors } = useTheme();
  const { currentUserId, joinEvent, leaveEvent } = useChess();
  const [showComments, setShowComments] = useState<boolean>(false);
  const [commentText, setCommentText] = useState<string>('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;
  const userId = currentUserId ?? 'me';
  const isLiked = post.likes.includes(userId);

  const handleLike = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.3, useNativeDriver: true, speed: 50 }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, speed: 50 }),
    ]).start();
    onLike(post.id);
  }, [post.id, onLike, heartScale]);

  const handleSubmitComment = useCallback(() => {
    if (!commentText.trim()) return;
    Haptics.selectionAsync();
    onComment(post.id, commentText.trim(), replyToId ?? undefined);
    setCommentText('');
    setReplyToId(null);
  }, [post.id, commentText, onComment, replyToId]);

  const totalComments = useMemo(() => {
    let count = post.comments.length;
    post.comments.forEach(c => { count += (c.replies?.length ?? 0); });
    return count;
  }, [post.comments]);

  const contentText = language === 'en' && post.contentEn ? post.contentEn : post.content;
  const displayContent = translatedContent ?? contentText;
  const isShowingTranslated = translatedContent !== null;

  const handleTranslate = useCallback(async () => {
    if (isTranslating || !contentText?.trim()) return;
    if (isShowingTranslated) {
      setTranslatedContent(null);
      return;
    }
    setIsTranslating(true);
    setTranslatedContent(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const targetLang = getTargetLanguage(language);
      const result = await translateText(contentText, targetLang, session?.access_token);
      if ('text' in result) setTranslatedContent(result.text);
    } catch {
      // ignore
    } finally {
      setIsTranslating(false);
    }
  }, [contentText, language, isTranslating, isShowingTranslated]);

  const getTypeIcon = () => {
    switch (post.type) {
      case 'match_result': return <Swords size={12} color={colors.gold} />;
      case 'achievement': return <Award size={12} color={colors.orange} />;
      case 'looking_for_match': return <SearchIcon size={12} color={colors.blue} />;
      case 'event': return <Calendar size={12} color={colors.green} />;
      default: return null;
    }
  };

  const getTypeLabel = () => {
    switch (post.type) {
      case 'match_result': return t('match_result', language);
      case 'achievement': return t('achievement', language);
      case 'looking_for_match': return t('looking_for_match', language);
      case 'event': return t('event', language);
      default: return '';
    }
  };

  const getTypeBg = () => {
    switch (post.type) {
      case 'match_result': return colors.goldMuted;
      case 'achievement': return colors.orangeMuted;
      case 'looking_for_match': return colors.blueMuted;
      case 'event': return colors.greenMuted;
      default: return colors.surface;
    }
  };

  const getTypeColor = () => {
    switch (post.type) {
      case 'match_result': return colors.gold;
      case 'achievement': return colors.orange;
      case 'looking_for_match': return colors.blue;
      case 'event': return colors.green;
      default: return colors.textMuted;
    }
  };

  const isEventJoined = post.event?.participants.includes(userId);
  const isEventClosed =
    !!post.event &&
    ((!!post.event.deadlineAt && new Date(post.event.deadlineAt) <= new Date()) || !!post.event.isClosed);

  const formatDeadlineDisplay = () => {
    const deadline = post.event?.deadlineAt;
    if (!deadline || (typeof deadline === 'string' && deadline.trim() === '')) return '';
    const d = new Date(deadline);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    if (language === 'ja') {
      return `${m}月${day}日 ${hh}:${mm}`;
    }
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[m - 1]} ${day}, ${hh}:${mm}`;
  };

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 18, backgroundColor: colors.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: colors.cardBorder, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <Pressable onPress={() => onAuthorPress(post.author.id)} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <SafeImage uri={post.author.avatar} name={post.author.name} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceLight }} contentFit="cover" />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '600' as const, color: colors.textPrimary }}>{post.author.name}</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{getTimeAgo(post.createdAt, language)}</Text>
          </View>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {post.type !== 'general' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: getTypeBg(), marginLeft: 8 }}>
              {getTypeIcon()}
              <Text style={{ fontSize: 10, fontWeight: '600' as const, color: getTypeColor() }}>{getTypeLabel()}</Text>
            </View>
          )}
          {isOwnPost && onDelete && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Alert.alert(
                  language === 'ja' ? '削除の確認' : 'Delete post',
                  language === 'ja' ? '本当にこの投稿を削除しますか？' : 'Are you sure you want to delete this post?',
                  [
                    { text: language === 'ja' ? 'キャンセル' : 'Cancel', style: 'cancel' },
                    { text: language === 'ja' ? '削除' : 'Delete', style: 'destructive', onPress: () => onDelete(post.id) },
                  ]
                );
              }}
              style={{ padding: 6 }}
            >
              <Trash2 size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* イベント投稿の場合: イベントカードをコンテンツより先に表示（詳細を強調） */}
      {post.event && (
        <View style={{ backgroundColor: colors.greenMuted, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.green + '33', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }}>
          <Text style={{ fontSize: 16, fontWeight: '700' as const, color: colors.textPrimary, marginBottom: 8 }}>{post.event.title}</Text>
          <View style={{ gap: 4, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Calendar size={13} color={colors.green} />
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>{post.event.date} {post.event.time}</Text>
            </View>
            {post.event.location ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MapPin size={13} color={colors.green} />
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>{post.event.location}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Users size={13} color={colors.green} />
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                {post.event.participants.length}/{post.event.maxParticipants} {t('participants', language)}
              </Text>
            </View>
            {post.event.deadlineAt ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Hourglass size={13} color={colors.green} />
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                  {language === 'ja'
                    ? `募集締切: ${formatDeadlineDisplay()}`
                    : `Deadline: ${formatDeadlineDisplay()}`}
                </Text>
              </View>
            ) : null}
          </View>
          {isEventClosed ? (
            <View style={{ alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider }}>
              <Text style={{ fontSize: 14, fontWeight: '700' as const, color: colors.textMuted }}>{t('event_closed', language)}</Text>
            </View>
          ) : isEventJoined ? (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Alert.alert(
                  language === 'ja' ? '参加を取り消しますか？' : 'Cancel participation?',
                  '',
                  [
                    { text: language === 'ja' ? 'キャンセル' : 'Cancel', style: 'cancel' },
                    { text: language === 'ja' ? '取り消す' : 'Cancel participation', style: 'destructive', onPress: () => leaveEvent(post.id) },
                  ]
                );
              }}
              style={{ alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700' as const, color: colors.textSecondary }}>{t('cancel_participation', language)}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                joinEvent(post.id);
              }}
              style={{ alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: colors.green }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700' as const, color: colors.white }}>{t('join_event', language)}</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 15, color: colors.textPrimary, lineHeight: 22 }}>{displayContent}</Text>
        {isShowingTranslated && (
          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 4, fontStyle: 'italic' }}>{t('translated_by_ai', language)}</Text>
        )}
        <Pressable
          onPress={handleTranslate}
          disabled={isTranslating}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, alignSelf: 'flex-start' }}
        >
          <Languages size={14} color={isShowingTranslated ? colors.gold : colors.textMuted} />
          <Text style={{ fontSize: 12, fontWeight: '600' as const, color: isShowingTranslated ? colors.gold : colors.textMuted }}>
            {isTranslating ? (language === 'ja' ? '翻訳中...' : 'Translating...') : isShowingTranslated ? t('original', language) : t('translate', language)}
          </Text>
        </Pressable>
      </View>

      {post.imageUrl && (
        <Pressable onPress={() => onImagePress?.(post.imageUrl!)} style={{ marginBottom: 12 }}>
          <Image source={{ uri: post.imageUrl }} style={{ width: '100%', height: 200, borderRadius: 12, backgroundColor: colors.surfaceLight }} contentFit="cover" />
        </Pressable>
      )}

      {post.matchResult && (
        <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.cardBorder }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '600' as const, color: colors.textPrimary }}>{post.author.name}</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '700' as const }}>{t('vs', language)}</Text>
            <Text style={{ fontSize: 14, fontWeight: '600' as const, color: colors.textPrimary }}>{post.matchResult.opponent.name}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {post.matchResult.result === 'win' && <Trophy size={14} color={colors.green} />}
            {post.matchResult.result === 'loss' && <XIcon size={14} color={colors.red} />}
            {post.matchResult.result === 'draw' && <Minus size={14} color={colors.textSecondary} />}
            <Text style={{ fontSize: 14, fontWeight: '700' as const, color: post.matchResult.result === 'win' ? colors.green : post.matchResult.result === 'loss' ? colors.red : colors.textSecondary }}>
              {t(post.matchResult.result, language)}
            </Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '500' as const, marginLeft: 4 }}>{post.matchResult.timeControl}</Text>
          </View>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 20, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.divider }}>
        <Pressable onPress={handleLike} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <Heart size={20} color={isLiked ? '#E74C3C' : colors.textMuted} fill={isLiked ? '#E74C3C' : 'transparent'} />
          </Animated.View>
          <Text style={{ fontSize: 13, fontWeight: '600' as const, color: isLiked ? '#E74C3C' : colors.textMuted }}>{post.likes.length}</Text>
        </Pressable>
        <Pressable
          onPress={() => { Haptics.selectionAsync(); setShowComments(prev => !prev); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
        >
          <MessageCircle size={20} color={colors.textMuted} />
          <Text style={{ fontSize: 13, fontWeight: '600' as const, color: colors.textMuted }}>{totalComments}</Text>
        </Pressable>
      </View>

      {showComments && (
        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider, gap: 10 }}>
          {post.comments.map(c => (
            <CommentItem
              key={c.id}
              comment={c}
              onReply={(cId) => { setReplyToId(cId); setCommentText(`@${c.author.name} `); }}
              language={language}
              colors={colors}
            />
          ))}
          {replyToId && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 4 }}>
              <CornerDownRight size={12} color={colors.gold} />
              <Text style={{ fontSize: 11, color: colors.gold }}>{t('reply', language)}</Text>
              <Pressable onPress={() => { setReplyToId(null); setCommentText(''); }}>
                <XIcon size={12} color={colors.textMuted} />
              </Pressable>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <TextInput
              style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: colors.textPrimary, borderWidth: 1, borderColor: colors.cardBorder }}
              value={commentText}
              onChangeText={setCommentText}
              placeholder={t('add_comment', language)}
              placeholderTextColor={colors.textMuted}
            />
            <Pressable onPress={handleSubmitComment} style={{ padding: 6 }}>
              <Send size={16} color={commentText.trim() ? colors.gold : colors.textMuted} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

export default function TimelineScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { timelinePosts, toggleLike, addComment, addTimelinePost, deleteTimelinePost, language, refreshPlayers, refreshTimeline, activeUsersCount, currentUserId } = useChess();
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'events' | 'my'>('all');
  const [newPostText, setNewPostText] = useState<string>('');
  const [showComposer, setShowComposer] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [postImageUrl, setPostImageUrl] = useState<string | null>(null);
  const [showEventModal, setShowEventModal] = useState<boolean>(false);
  const [eventTitle, setEventTitle] = useState<string>('');
  const [eventDate, setEventDate] = useState<Date>(new Date());
  const [eventHour, setEventHour] = useState<number>(14);
  const [eventMinute, setEventMinute] = useState<number>(0);
  const [eventLocation, setEventLocation] = useState<string>('');
  const [eventMaxParticipants, setEventMaxParticipants] = useState<string>('10');
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);
  const [eventDeadlineDate, setEventDeadlineDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });
  const [eventDeadlineHour, setEventDeadlineHour] = useState<number>(23);
  const [eventDeadlineMinute, setEventDeadlineMinute] = useState<number>(45);
  const [showDeadlineDatePicker, setShowDeadlineDatePicker] = useState<boolean>(false);
  const [showDeadlineTimePicker, setShowDeadlineTimePicker] = useState<boolean>(false);
  const [expandedImageUrl, setExpandedImageUrl] = useState<string | null>(null);

  const filteredPosts = useMemo(() => {
    if (filter === 'my') {
      const uid = currentUserId ?? 'me';
      return timelinePosts.filter(p => p.author.id === uid).sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
    if (filter === 'events') return timelinePosts.filter(p => p.type === 'event');
    return timelinePosts;
  }, [filter, timelinePosts, currentUserId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshPlayers(), refreshTimeline()]);
    setTimeout(() => setRefreshing(false), 800);
  }, [refreshPlayers, refreshTimeline]);

  useFocusEffect(
    useCallback(() => {
      refreshTimeline();
    }, [refreshTimeline])
  );

  const handleAuthorPress = useCallback((authorId: string) => {
    if (authorId === 'me' || authorId === currentUserId) return;
    router.push(`/player/${authorId}` as any);
  }, [router, currentUserId]);

  const handleNewPost = useCallback(async () => {
    if (!newPostText.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    let imageUrl: string | undefined = postImageUrl ?? undefined;
    if (imageUrl && (imageUrl.startsWith('file://') || !imageUrl.startsWith('http'))) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const result = await uploadTimelineImage(imageUrl, user.id);
        imageUrl = 'url' in result ? result.url : undefined;
      } else {
        imageUrl = undefined;
      }
    }
    addTimelinePost(newPostText.trim(), 'general', imageUrl);
    setNewPostText('');
    setPostImageUrl(null);
    setShowComposer(false);
  }, [newPostText, addTimelinePost, postImageUrl]);

  const handlePickImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) {
        setPostImageUrl(result.assets[0].uri);
      }
    } catch (e) {
      console.log('Image picker error', e);
    }
  }, []);

  const handleTemplateSelect = useCallback((templateKey: string) => {
    Haptics.selectionAsync();
    setNewPostText(t(`template_${templateKey}`, language));
    setShowComposer(true);
  }, [language]);

  const formatDateDisplay = useCallback((date: Date): string => {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    if (language === 'ja') {
      return `${y}年${m}月${d}日`;
    }
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[m - 1]} ${d}, ${y}`;
  }, [language]);

  const formatTimeDisplay = useCallback((h: number, m: number): string => {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }, []);

  const formatDateForStorage = useCallback((date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const adjustDate = useCallback((field: 'year' | 'month' | 'day', delta: number) => {
    Haptics.selectionAsync();
    setEventDate(prev => {
      const next = new Date(prev);
      if (field === 'year') next.setFullYear(next.getFullYear() + delta);
      else if (field === 'month') next.setMonth(next.getMonth() + delta);
      else next.setDate(next.getDate() + delta);
      return next;
    });
  }, []);

  const adjustTime = useCallback((field: 'hour' | 'minute', delta: number) => {
    Haptics.selectionAsync();
    if (field === 'hour') {
      setEventHour(prev => {
        const next = prev + delta;
        if (next < 0) return 23;
        if (next > 23) return 0;
        return next;
      });
    } else {
      setEventMinute(prev => {
        const next = prev + delta;
        if (next < 0) return 45;
        if (next > 59) return 0;
        return next;
      });
    }
  }, []);

  const adjustDeadlineDate = useCallback((field: 'year' | 'month' | 'day', delta: number) => {
    Haptics.selectionAsync();
    setEventDeadlineDate(prev => {
      const next = new Date(prev);
      if (field === 'year') next.setFullYear(next.getFullYear() + delta);
      else if (field === 'month') next.setMonth(next.getMonth() + delta);
      else next.setDate(next.getDate() + delta);
      return next;
    });
  }, []);

  const adjustDeadlineTime = useCallback((field: 'hour' | 'minute', delta: number) => {
    Haptics.selectionAsync();
    if (field === 'hour') {
      setEventDeadlineHour(prev => {
        const next = prev + delta;
        if (next < 0) return 23;
        if (next > 23) return 0;
        return next;
      });
    } else {
      setEventDeadlineMinute(prev => {
        const allowed = [0, 15, 30, 45];
        const currentIndex = allowed.indexOf(prev);
        const step = delta > 0 ? 1 : -1;
        const nextIndex = (currentIndex + step + allowed.length) % allowed.length;
        return allowed[nextIndex];
      });
    }
  }, []);

  const handleCreateEvent = useCallback(() => {
    if (!eventTitle.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const dateStr = formatDateForStorage(eventDate);
    const timeStr = formatTimeDisplay(eventHour, eventMinute);
    const deadlineStr = `${formatDateForStorage(eventDeadlineDate)}T${String(eventDeadlineHour).padStart(2, '0')}:${String(eventDeadlineMinute).padStart(2, '0')}:00`;
    const event: TimelineEvent = {
      id: `evt_${Date.now()}`,
      userId: currentUserId ?? 'me',
      title: eventTitle.trim(),
      date: dateStr,
      time: timeStr,
      location: eventLocation.trim(),
      maxParticipants: parseInt(eventMaxParticipants, 10) || 10,
      participants: [],
      createdAt: new Date().toISOString(),
      deadlineAt: deadlineStr,
    };
    addTimelinePost(eventTitle.trim(), 'event', undefined, undefined, event);
    setShowEventModal(false);
    setEventTitle('');
    setEventDate(new Date());
    setEventHour(14);
    setEventMinute(0);
    setEventLocation('');
    setEventMaxParticipants('10');
    setShowDatePicker(false);
    setShowTimePicker(false);
    (() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      setEventDeadlineDate(d);
    })();
    setEventDeadlineHour(23);
    setEventDeadlineMinute(59);
    setShowDeadlineDatePicker(false);
    setShowDeadlineTimePicker(false);
  }, [eventTitle, eventDate, eventHour, eventMinute, eventDeadlineDate, eventDeadlineHour, eventDeadlineMinute, eventLocation, eventMaxParticipants, currentUserId, addTimelinePost, formatDateForStorage, formatTimeDisplay]);

  const handleComment = useCallback((postId: string, text: string, parentId?: string) => {
    addComment(postId, text, parentId);
  }, [addComment]);

  const renderPost = useCallback(
    ({ item }: { item: TimelinePost }) => (
      <PostCard
        post={item}
        onLike={toggleLike}
        onComment={handleComment}
        onAuthorPress={handleAuthorPress}
        onImagePress={setExpandedImageUrl}
        onDelete={deleteTimelinePost}
        isOwnPost={item.author.id === currentUserId || item.author.id === 'me'}
        language={language}
      />
    ),
    [toggleLike, handleComment, handleAuthorPress, deleteTimelinePost, currentUserId, language]
  );

  const keyExtractor = useCallback((item: TimelinePost) => item.id, []);

  const ListHeader = useMemo(() => (
    <View style={styles.composerSection}>
      <View style={styles.filterTabs}>
        <Pressable
          onPress={() => setFilter('all')}
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
        >
          <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
            {language === 'ja' ? 'すべて' : 'All'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setFilter('events')}
          style={[styles.filterTab, filter === 'events' && styles.filterTabActive]}
        >
          <Text style={[styles.filterTabText, filter === 'events' && styles.filterTabTextActive]}>
            {language === 'ja' ? 'イベントのみ' : 'Events only'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setFilter('my')}
          style={[styles.filterTab, filter === 'my' && styles.filterTabActive]}
        >
          <Text style={[styles.filterTabText, filter === 'my' && styles.filterTabTextActive]}>
            {language === 'ja' ? 'My' : 'My'}
          </Text>
        </Pressable>
      </View>
      {activeUsersCount > 0 && (
        <View style={styles.activeUsersBar}>
          <View style={styles.activeUsersDot} />
          <Text style={styles.activeUsersText}>
            {t('active_users_online', language).replace('{count}', String(activeUsersCount))}
          </Text>
        </View>
      )}

      {!showComposer ? (
        <View>
          <Pressable
            onPress={() => { Haptics.selectionAsync(); setShowComposer(true); }}
            style={styles.composerTrigger}
          >
            <Text style={styles.composerPlaceholder}>{t('write_post', language)}</Text>
          </Pressable>

          <View style={styles.templateRow}>
            {TEMPLATES.map(tmpl => (
              <Pressable key={tmpl.key} onPress={() => handleTemplateSelect(tmpl.key)} style={styles.templateChip}>
                <Text style={styles.templateText} numberOfLines={1}>{t(tmpl.labelKey, language)}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={() => setShowEventModal(true)} style={styles.eventButton}>
            <Calendar size={14} color={colors.green} />
            <Text style={styles.eventButtonText}>{t('create_event', language)}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.composerExpanded}>
          <TextInput
            style={styles.composerInput}
            value={newPostText}
            onChangeText={setNewPostText}
            placeholder={t('write_post', language)}
            placeholderTextColor={colors.textMuted}
            multiline
            autoFocus
          />
          {postImageUrl && (
            <View style={styles.imagePreviewContainer}>
              <Image source={{ uri: postImageUrl }} style={styles.imagePreview} contentFit="cover" />
              <Pressable onPress={() => setPostImageUrl(null)} style={styles.removeImageBtn}>
                <XIcon size={14} color={colors.white} />
              </Pressable>
            </View>
          )}
          <View style={styles.composerActions}>
            <Pressable onPress={handlePickImage} style={styles.composerPhotoBtn}>
              <Camera size={18} color={colors.blue} />
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => { setShowComposer(false); setNewPostText(''); setPostImageUrl(null); }} style={styles.composerCancel}>
              <Text style={styles.composerCancelText}>{t('cancel', language)}</Text>
            </Pressable>
            <Pressable
              onPress={handleNewPost}
              style={[styles.composerPostBtn, !newPostText.trim() && styles.composerPostBtnDisabled]}
              disabled={!newPostText.trim()}
            >
              <Text style={styles.composerPostText}>{t('post', language)}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  ), [showComposer, newPostText, language, handleNewPost, colors, styles, activeUsersCount, postImageUrl, handlePickImage, handleTemplateSelect, filter]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID="timeline-screen"
    >
      <FlatList
        data={filteredPosts}
        renderItem={renderPost}
        keyExtractor={keyExtractor}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} colors={[colors.gold]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📝</Text>
            <Text style={styles.emptyTitle}>{t('no_posts', language)}</Text>
            <Text style={styles.emptySubtitle}>{t('start_posting', language)}</Text>
          </View>
        }
      />

      <Modal visible={showEventModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEventModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('create_event', language)}</Text>
            <Pressable onPress={() => setShowEventModal(false)}><XIcon size={22} color={colors.textSecondary} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalLabel}>{t('event_title', language)}</Text>
            <TextInput style={styles.modalInput} value={eventTitle} onChangeText={setEventTitle} placeholderTextColor={colors.textMuted} />

            <Text style={styles.modalLabel}>{t('event_date', language)}</Text>
            <TouchableOpacity
              onPress={() => { setShowDatePicker(prev => !prev); setShowTimePicker(false); }}
              style={[styles.pickerTrigger, showDatePicker && styles.pickerTriggerActive]}
              activeOpacity={0.7}
            >
              <Calendar size={16} color={showDatePicker ? colors.green : colors.textMuted} />
              <Text style={[styles.pickerTriggerText, showDatePicker && { color: colors.green }]}>
                {formatDateDisplay(eventDate)}
              </Text>
            </TouchableOpacity>
            {showDatePicker && (
              <View style={styles.pickerContainer}>
                <View style={styles.pickerRow}>
                  <View style={styles.pickerColumn}>
                    <Text style={styles.pickerColumnLabel}>{language === 'ja' ? '年' : 'Year'}</Text>
                    <View style={styles.pickerSpinner}>
                      <Pressable onPress={() => adjustDate('year', -1)} style={styles.pickerArrow}>
                        <Text style={styles.pickerArrowText}>▲</Text>
                      </Pressable>
                      <Text style={styles.pickerValue}>{eventDate.getFullYear()}</Text>
                      <Pressable onPress={() => adjustDate('year', 1)} style={styles.pickerArrow}>
                        <Text style={styles.pickerArrowText}>▼</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View style={styles.pickerColumn}>
                    <Text style={styles.pickerColumnLabel}>{language === 'ja' ? '月' : 'Month'}</Text>
                    <View style={styles.pickerSpinner}>
                      <Pressable onPress={() => adjustDate('month', -1)} style={styles.pickerArrow}>
                        <Text style={styles.pickerArrowText}>▲</Text>
                      </Pressable>
                      <Text style={styles.pickerValue}>{eventDate.getMonth() + 1}</Text>
                      <Pressable onPress={() => adjustDate('month', 1)} style={styles.pickerArrow}>
                        <Text style={styles.pickerArrowText}>▼</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View style={styles.pickerColumn}>
                    <Text style={styles.pickerColumnLabel}>{language === 'ja' ? '日' : 'Day'}</Text>
                    <View style={styles.pickerSpinner}>
                      <Pressable onPress={() => adjustDate('day', -1)} style={styles.pickerArrow}>
                        <Text style={styles.pickerArrowText}>▲</Text>
                      </Pressable>
                      <Text style={styles.pickerValue}>{eventDate.getDate()}</Text>
                      <Pressable onPress={() => adjustDate('day', 1)} style={styles.pickerArrow}>
                        <Text style={styles.pickerArrowText}>▼</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
                <Pressable onPress={() => setShowDatePicker(false)} style={styles.pickerDoneBtn}>
                  <Text style={styles.pickerDoneText}>{language === 'ja' ? '完了' : 'Done'}</Text>
                </Pressable>
              </View>
            )}

            <Text style={styles.modalLabel}>{t('event_time', language)}</Text>
            <TouchableOpacity
              onPress={() => { setShowTimePicker(prev => !prev); setShowDatePicker(false); }}
              style={[styles.pickerTrigger, showTimePicker && styles.pickerTriggerActive]}
              activeOpacity={0.7}
            >
              <Calendar size={16} color={showTimePicker ? colors.green : colors.textMuted} />
              <Text style={[styles.pickerTriggerText, showTimePicker && { color: colors.green }]}>
                {formatTimeDisplay(eventHour, eventMinute)}
              </Text>
            </TouchableOpacity>
            {showTimePicker && (
              <View style={styles.pickerContainer}>
                <View style={styles.pickerRow}>
                  <View style={styles.pickerColumn}>
                    <Text style={styles.pickerColumnLabel}>{language === 'ja' ? '時' : 'Hour'}</Text>
                    <View style={styles.pickerSpinner}>
                      <Pressable onPress={() => adjustTime('hour', -1)} style={styles.pickerArrow}>
                        <Text style={styles.pickerArrowText}>▲</Text>
                      </Pressable>
                      <Text style={styles.pickerValue}>{String(eventHour).padStart(2, '0')}</Text>
                      <Pressable onPress={() => adjustTime('hour', 1)} style={styles.pickerArrow}>
                        <Text style={styles.pickerArrowText}>▼</Text>
                      </Pressable>
                    </View>
                  </View>
                  <Text style={styles.pickerSeparator}>:</Text>
                  <View style={styles.pickerColumn}>
                    <Text style={styles.pickerColumnLabel}>{language === 'ja' ? '分' : 'Min'}</Text>
                    <View style={styles.pickerSpinner}>
                      <Pressable onPress={() => adjustTime('minute', -15)} style={styles.pickerArrow}>
                        <Text style={styles.pickerArrowText}>▲</Text>
                      </Pressable>
                      <Text style={styles.pickerValue}>{String(eventMinute).padStart(2, '0')}</Text>
                      <Pressable onPress={() => adjustTime('minute', 15)} style={styles.pickerArrow}>
                        <Text style={styles.pickerArrowText}>▼</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
                <Pressable onPress={() => setShowTimePicker(false)} style={styles.pickerDoneBtn}>
                  <Text style={styles.pickerDoneText}>{language === 'ja' ? '完了' : 'Done'}</Text>
                </Pressable>
              </View>
            )}

            <Text style={styles.modalLabel}>{t('event_deadline', language)}</Text>
            <TouchableOpacity
              onPress={() => { setShowDeadlineDatePicker(prev => !prev); setShowDeadlineTimePicker(false); }}
              style={[styles.pickerTrigger, showDeadlineDatePicker && styles.pickerTriggerActive]}
              activeOpacity={0.7}
            >
              <Calendar size={16} color={showDeadlineDatePicker ? colors.green : colors.textMuted} />
              <Text style={[styles.pickerTriggerText, showDeadlineDatePicker && { color: colors.green }]}>
                {formatDateDisplay(eventDeadlineDate)}
              </Text>
            </TouchableOpacity>
            {showDeadlineDatePicker && (
              <View style={styles.pickerContainer}>
                <View style={styles.pickerRow}>
                  <View style={styles.pickerColumn}>
                    <Text style={styles.pickerColumnLabel}>{language === 'ja' ? '年' : 'Year'}</Text>
                    <View style={styles.pickerSpinner}>
                      <Pressable onPress={() => adjustDeadlineDate('year', -1)} style={styles.pickerArrow}>
                        <Text style={styles.pickerArrowText}>▲</Text>
                      </Pressable>
                      <Text style={styles.pickerValue}>{eventDeadlineDate.getFullYear()}</Text>
                      <Pressable onPress={() => adjustDeadlineDate('year', 1)} style={styles.pickerArrow}>
                        <Text style={styles.pickerArrowText}>▼</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View style={styles.pickerColumn}>
                    <Text style={styles.pickerColumnLabel}>{language === 'ja' ? '月' : 'Month'}</Text>
                    <View style={styles.pickerSpinner}>
                      <Pressable onPress={() => adjustDeadlineDate('month', -1)} style={styles.pickerArrow}>
                        <Text style={styles.pickerArrowText}>▲</Text>
                      </Pressable>
                      <Text style={styles.pickerValue}>{eventDeadlineDate.getMonth() + 1}</Text>
                      <Pressable onPress={() => adjustDeadlineDate('month', 1)} style={styles.pickerArrow}>
                        <Text style={styles.pickerArrowText}>▼</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View style={styles.pickerColumn}>
                    <Text style={styles.pickerColumnLabel}>{language === 'ja' ? '日' : 'Day'}</Text>
                    <View style={styles.pickerSpinner}>
                      <Pressable onPress={() => adjustDeadlineDate('day', -1)} style={styles.pickerArrow}>
                        <Text style={styles.pickerArrowText}>▲</Text>
                      </Pressable>
                      <Text style={styles.pickerValue}>{eventDeadlineDate.getDate()}</Text>
                      <Pressable onPress={() => adjustDeadlineDate('day', 1)} style={styles.pickerArrow}>
                        <Text style={styles.pickerArrowText}>▼</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
                <Pressable onPress={() => setShowDeadlineDatePicker(false)} style={styles.pickerDoneBtn}>
                  <Text style={styles.pickerDoneText}>{language === 'ja' ? '完了' : 'Done'}</Text>
                </Pressable>
              </View>
            )}
            <TouchableOpacity
              onPress={() => { setShowDeadlineTimePicker(prev => !prev); setShowDeadlineDatePicker(false); }}
              style={[styles.pickerTrigger, showDeadlineTimePicker && styles.pickerTriggerActive]}
              activeOpacity={0.7}
            >
              <Calendar size={16} color={showDeadlineTimePicker ? colors.green : colors.textMuted} />
              <Text style={[styles.pickerTriggerText, showDeadlineTimePicker && { color: colors.green }]}>
                {formatTimeDisplay(eventDeadlineHour, eventDeadlineMinute)}
              </Text>
            </TouchableOpacity>
            {showDeadlineTimePicker && (
              <View style={styles.pickerContainer}>
                <View style={styles.pickerRow}>
                  <View style={styles.pickerColumn}>
                    <Text style={styles.pickerColumnLabel}>{language === 'ja' ? '時' : 'Hour'}</Text>
                    <View style={styles.pickerSpinner}>
                      <Pressable onPress={() => adjustDeadlineTime('hour', -1)} style={styles.pickerArrow}>
                        <Text style={styles.pickerArrowText}>▲</Text>
                      </Pressable>
                      <Text style={styles.pickerValue}>{String(eventDeadlineHour).padStart(2, '0')}</Text>
                      <Pressable onPress={() => adjustDeadlineTime('hour', 1)} style={styles.pickerArrow}>
                        <Text style={styles.pickerArrowText}>▼</Text>
                      </Pressable>
                    </View>
                  </View>
                  <Text style={styles.pickerSeparator}>:</Text>
                  <View style={styles.pickerColumn}>
                    <Text style={styles.pickerColumnLabel}>{language === 'ja' ? '分' : 'Min'}</Text>
                    <View style={styles.pickerSpinner}>
                      <Pressable onPress={() => adjustDeadlineTime('minute', -15)} style={styles.pickerArrow}>
                        <Text style={styles.pickerArrowText}>▲</Text>
                      </Pressable>
                      <Text style={styles.pickerValue}>{String(eventDeadlineMinute).padStart(2, '0')}</Text>
                      <Pressable onPress={() => adjustDeadlineTime('minute', 15)} style={styles.pickerArrow}>
                        <Text style={styles.pickerArrowText}>▼</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
                <Pressable onPress={() => setShowDeadlineTimePicker(false)} style={styles.pickerDoneBtn}>
                  <Text style={styles.pickerDoneText}>{language === 'ja' ? '完了' : 'Done'}</Text>
                </Pressable>
              </View>
            )}

            <Text style={styles.modalLabel}>{t('event_location', language)}</Text>
            <TextInput style={styles.modalInput} value={eventLocation} onChangeText={setEventLocation} placeholderTextColor={colors.textMuted} />
            <Text style={styles.modalLabel}>{t('event_max_participants', language)}</Text>
            <TextInput style={styles.modalInput} value={eventMaxParticipants} onChangeText={setEventMaxParticipants} keyboardType="number-pad" placeholderTextColor={colors.textMuted} />
            <Pressable onPress={handleCreateEvent} style={[styles.modalSubmitBtn, !eventTitle.trim() && { opacity: 0.5 }]} disabled={!eventTitle.trim()}>
              <Text style={styles.modalSubmitText}>{t('create_event', language)}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={expandedImageUrl !== null} transparent animationType="fade" onRequestClose={() => setExpandedImageUrl(null)}>
        <Pressable style={expandedImageStyles.backdrop} onPress={() => setExpandedImageUrl(null)}>
          {expandedImageUrl ? (
            <Pressable style={expandedImageStyles.imageContainer} onPress={e => e.stopPropagation()}>
              <Image source={{ uri: expandedImageUrl }} style={expandedImageStyles.image} contentFit="contain" />
            </Pressable>
          ) : null}
          <Pressable style={[expandedImageStyles.closeBtn, { backgroundColor: colors.surface }]} onPress={() => setExpandedImageUrl(null)}>
            <XIcon size={24} color={colors.textPrimary} />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const expandedImageStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  imageContainer: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' },
  image: { flex: 1, width: '100%' },
  closeBtn: { position: 'absolute', top: 48, right: 16, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    listContent: { paddingBottom: 20 },
    filterTabs: { flexDirection: 'row', alignSelf: 'center', backgroundColor: colors.surface, borderRadius: 999, padding: 5, marginBottom: 14, borderWidth: 1, borderColor: colors.cardBorder },
    filterTab: { flex: 1, paddingVertical: 6, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center' as const, justifyContent: 'center' as const },
    filterTabActive: { backgroundColor: colors.gold },
    filterTabText: { fontSize: 13, fontWeight: '600' as const, color: colors.textMuted },
    filterTabTextActive: { color: colors.white },
    composerSection: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
    activeUsersBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.greenMuted, borderRadius: 10 },
    activeUsersDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
    activeUsersText: { fontSize: 13, fontWeight: '600' as const, color: colors.green },
    composerTrigger: { backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 16, borderWidth: 1, borderColor: colors.cardBorder },
    composerPlaceholder: { fontSize: 15, color: colors.textMuted },
    templateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    templateChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder },
    templateText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' as const },
    eventButton: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.greenMuted, alignSelf: 'flex-start' },
    eventButtonText: { fontSize: 13, fontWeight: '600' as const, color: colors.green },
    composerExpanded: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.goldDark },
    composerInput: { fontSize: 15, color: colors.textPrimary, minHeight: 60, textAlignVertical: 'top', marginBottom: 12 },
    imagePreviewContainer: { position: 'relative', marginBottom: 12 },
    imagePreview: { width: '100%', height: 160, borderRadius: 10, backgroundColor: colors.surfaceLight },
    removeImageBtn: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
    composerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    composerPhotoBtn: { padding: 8, borderRadius: 8, backgroundColor: colors.blueMuted },
    composerCancel: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
    composerCancelText: { fontSize: 14, color: colors.textMuted, fontWeight: '500' as const },
    composerPostBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.gold },
    composerPostBtnDisabled: { opacity: 0.4 },
    composerPostText: { fontSize: 14, fontWeight: '700' as const, color: colors.white },
    emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
    emptyIcon: { fontSize: 48, marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontWeight: '600' as const, color: colors.textPrimary, marginBottom: 8 },
    emptySubtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
    modalContainer: { flex: 1, backgroundColor: colors.background },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
    modalTitle: { fontSize: 20, fontWeight: '700' as const, color: colors.textPrimary },
    modalContent: { paddingHorizontal: 20, paddingBottom: 40 },
    modalLabel: { fontSize: 13, fontWeight: '600' as const, color: colors.textMuted, marginTop: 16, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
    modalInput: { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.textPrimary, borderWidth: 1, borderColor: colors.cardBorder },
    modalSubmitBtn: { backgroundColor: colors.green, borderRadius: 14, paddingVertical: 16, alignItems: 'center' as const, marginTop: 24 },
    modalSubmitText: { fontSize: 17, fontWeight: '700' as const, color: colors.white },
    pickerTrigger: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: colors.cardBorder },
    pickerTriggerActive: { borderColor: colors.green, backgroundColor: colors.greenMuted },
    pickerTriggerText: { fontSize: 16, color: colors.textPrimary, fontWeight: '500' as const },
    pickerContainer: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginTop: 8, borderWidth: 1, borderColor: colors.cardBorder },
    pickerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 12 },
    pickerColumn: { alignItems: 'center' as const, gap: 4 },
    pickerColumnLabel: { fontSize: 11, fontWeight: '600' as const, color: colors.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    pickerSpinner: { alignItems: 'center' as const, gap: 2 },
    pickerArrow: { padding: 8, borderRadius: 8, backgroundColor: colors.surfaceLight },
    pickerArrowText: { fontSize: 12, color: colors.textSecondary, fontWeight: '700' as const },
    pickerValue: { fontSize: 24, fontWeight: '700' as const, color: colors.textPrimary, minWidth: 52, textAlign: 'center' as const, paddingVertical: 6 },
    pickerSeparator: { fontSize: 24, fontWeight: '700' as const, color: colors.textPrimary, marginTop: 20 },
    pickerDoneBtn: { alignItems: 'center' as const, paddingVertical: 10, marginTop: 12, borderRadius: 8, backgroundColor: colors.greenMuted },
    pickerDoneText: { fontSize: 14, fontWeight: '600' as const, color: colors.green },
  });
}
