import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Star } from 'lucide-react-native';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { useAuth } from '@/providers/AuthProvider';
import { t } from '@/utils/translations';
import { SafeImage } from '@/components/SafeImage';
import { resolveAvatarUrl } from '@/utils/avatarUrl';
import { getSkillLabel, formatDistance } from '@/utils/helpers';

export default function FavoritesScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { favoritePlayers, refreshFavorites, toggleFavorite, language } = useChess();
  const { user } = useAuth();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshFavorites();
    setTimeout(() => setRefreshing(false), 600);
  }, [refreshFavorites]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) refreshFavorites();
    }, [user?.id, refreshFavorites])
  );

  if (!user?.id) {
    return (
      <View style={styles.center}>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>{t('login_prompt_desc', language)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={favoritePlayers}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Star size={48} color={colors.textMuted} style={{ marginBottom: 16 }} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('favorites_empty_title', language)}</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>{t('favorites_empty_subtitle', language)}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/player/${item.id}` as any)}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
          >
            <SafeImage
              uri={resolveAvatarUrl(item.avatar, item.name)}
              name={item.name}
              style={styles.avatar}
              contentFit="cover"
            />
            <View style={styles.cardContent}>
              <Text style={styles.cardName}>{item.name}</Text>
              <Text style={styles.cardMeta}>
                {getSkillLabel(item.skillLevel, language)}
                {item.distance !== undefined && item.distance < 999 ? ` · ${formatDistance(item.distance)}` : ''}
              </Text>
            </View>
            <Pressable onPress={(e) => { e.stopPropagation(); toggleFavorite(item.id); }} hitSlop={12}>
              <Star size={22} color={colors.accent} fill={colors.accent} />
            </Pressable>
          </Pressable>
        )}
      />
    </View>
  );
}

function createStyles(colors: { background: string; surface: string; textPrimary: string; textMuted: string; accent: string }) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    list: { padding: 16, paddingBottom: 32 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
      ...Platform.select({
        ios: { shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
        android: { elevation: 2 },
        web: { boxShadow: '0 2px 8px rgba(139,92,246,0.06)' } as any,
      }),
    },
    avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.background },
    cardContent: { flex: 1, marginLeft: 14 },
    cardName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    cardMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
    emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
    emptyText: { fontSize: 14 },
  });
}
