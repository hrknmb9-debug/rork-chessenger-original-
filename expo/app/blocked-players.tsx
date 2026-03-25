import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { UserX, UserCheck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { supabase } from '@/utils/supabaseClient';
import { SafeImage } from '@/components/SafeImage';
import { BackNavButton } from '@/components/BackNavButton';
import { t } from '@/utils/translations';
import { ThemeColors } from '@/constants/colors';

interface BlockedProfile {
  id: string;
  name: string;
  avatar: string | null;
  skill_level: string | null;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    listContent: {
      padding: 16,
      paddingBottom: 40,
    },
    emptyWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 80,
      gap: 12,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.surfaceHighlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      fontSize: 15,
      color: colors.textMuted,
      textAlign: 'center',
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.surfaceHighlight,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.surfaceHighlight,
    },
    info: {
      flex: 1,
    },
    name: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    skill: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    unblockBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.greenMuted,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 20,
    },
    unblockText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.green,
    },
    loader: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}

export default function BlockedPlayersScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { blockedUsers, unblockUser, language } = useChess();
  const router = useRouter();

  const [profiles, setProfiles] = useState<BlockedProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProfiles = useCallback(async () => {
    if (!blockedUsers.length) {
      setProfiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, avatar, skill_level')
        .in('id', blockedUsers);
      setProfiles((data ?? []) as BlockedProfile[]);
    } catch (e) {
      console.log('BlockedPlayers: fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, [blockedUsers]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleUnblock = useCallback((profile: BlockedProfile) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      t('unblock_user', language),
      language === 'ja'
        ? `${profile.name} のブロックを解除しますか？`
        : `Unblock ${profile.name}?`,
      [
        { text: t('cancel', language), style: 'cancel' },
        {
          text: t('unblock_user', language),
          onPress: async () => {
            await unblockUser(profile.id);
            setProfiles(prev => prev.filter(p => p.id !== profile.id));
          },
        },
      ]
    );
  }, [unblockUser, language]);

  const renderItem = useCallback(({ item }: { item: BlockedProfile }) => (
    <View style={styles.card}>
      <SafeImage
        uri={item.avatar}
        name={item.name}
        style={styles.avatar}
        contentFit="cover"
      />
      <View style={styles.info}>
        <Text style={styles.name}>{item.name}</Text>
        {item.skill_level && (
          <Text style={styles.skill}>{t(item.skill_level, language)}</Text>
        )}
      </View>
      <Pressable style={styles.unblockBtn} onPress={() => handleUnblock(item)}>
        <UserCheck size={14} color={colors.green} />
        <Text style={styles.unblockText}>{t('unblock_user', language)}</Text>
      </Pressable>
    </View>
  ), [styles, colors, language, handleUnblock]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('blocked_users', language),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerLeft: () => <BackNavButton onPress={() => router.back()} />,
        }}
      />

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : profiles.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <UserX size={28} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyText}>{t('no_blocked', language)}</Text>
        </View>
      ) : (
        <FlatList
          data={profiles}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
