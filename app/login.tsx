import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Mail, Lock, User, ArrowRight, Languages } from 'lucide-react-native';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useChess } from '@/providers/ChessProvider';
import { t } from '@/utils/translations';
import { primeAudioForApp, playLoginSuccessSound } from '@/utils/messageNotificationSound';

const { width: SW } = Dimensions.get('window');

// ------- フローティング駒パーティクル -------
const PIECES = ['♟', '♜', '♞', '♝', '♛', '♚'];
interface Particle { x: number; delay: number; dur: number; piece: string; size: number }
const PARTICLES: Particle[] = Array.from({ length: 10 }, (_, i) => ({
  x: (i / 9) * SW,
  delay: i * 280,
  dur: 3200 + i * 340,
  piece: PIECES[i % PIECES.length],
  size: 14 + (i % 3) * 6,
}));

function FloatingPiece({ x, delay, dur, piece, size }: Particle) {
  const y = useRef(new Animated.Value(0)).current;
  const op = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(y, { toValue: -320, duration: dur, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(op, { toValue: 0.35, duration: dur * 0.15, useNativeDriver: true }),
            Animated.timing(op, { toValue: 0.18, duration: dur * 0.7, useNativeDriver: true }),
            Animated.timing(op, { toValue: 0, duration: dur * 0.15, useNativeDriver: true }),
          ]),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        left: x,
        bottom: 0,
        fontSize: size,
        color: '#8B5CF6',
        opacity: op,
        transform: [{ translateY: y }],
      }}
    >
      {piece}
    </Animated.Text>
  );
}

// ------- アニメーションヒーロー -------
function AnimatedHero() {
  const iconScale = useRef(new Animated.Value(0.3)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const iconPulse = useRef(new Animated.Value(1)).current;
  const titleY = useRef(new Animated.Value(30)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    // アイコンのバウンスイン
    Animated.sequence([
      Animated.parallel([
        Animated.spring(iconScale, { toValue: 1.1, speed: 12, bounciness: 14, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(iconOpacity, { toValue: 1, duration: 350, useNativeDriver: Platform.OS !== 'web' }),
      ]),
      Animated.spring(iconScale, { toValue: 1, speed: 20, bounciness: 4, useNativeDriver: Platform.OS !== 'web' }),
    ]).start(() => {
      // ループパルス
      Animated.loop(
        Animated.sequence([
          Animated.timing(iconPulse, { toValue: 1.06, duration: 1000, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(iconPulse, { toValue: 1, duration: 1000, useNativeDriver: Platform.OS !== 'web' }),
        ])
      ).start();
    });

    // タイトルスライドイン
    Animated.sequence([
      Animated.delay(280),
      Animated.parallel([
        Animated.spring(titleY, { toValue: 0, speed: 14, bounciness: 6, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(titleOpacity, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    ]).start();

    // タグラインフェードイン
    Animated.sequence([
      Animated.delay(500),
      Animated.timing(taglineOpacity, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();

    // シマーループ
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 2000, useNativeDriver: false }),
        Animated.timing(shimmer, { toValue: 0, duration: 2000, useNativeDriver: false }),
      ])
    ).start();

    // リングパルス
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ringScale, { toValue: 1.28, duration: 1400, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(ringOpacity, { toValue: 0, duration: 1400, useNativeDriver: Platform.OS !== 'web' }),
        ]),
        Animated.parallel([
          Animated.timing(ringScale, { toValue: 1, duration: 0, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(ringOpacity, { toValue: 0.5, duration: 0, useNativeDriver: Platform.OS !== 'web' }),
        ]),
      ])
    ).start();
  }, []);

  const titleColor = shimmer.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['#1a1a2e', '#8B5CF6', '#1a1a2e'],
  });

  return (
    <View style={hero.wrap}>
      {/* アイコン + リング */}
      <View style={hero.iconArea}>
        <Animated.View
          style={[
            hero.ring,
            { transform: [{ scale: ringScale }], opacity: ringOpacity },
          ]}
        />
        <Animated.View
          style={[
            hero.iconShadow,
            {
              opacity: iconOpacity,
              transform: [{ scale: Animated.multiply(iconScale, iconPulse) }],
            },
          ]}
        >
          <Image
            source={require('@/assets/images/app-icon.png')}
            style={hero.icon}
            contentFit="cover"
          />
        </Animated.View>
      </View>

      {/* タイトル */}
      <Animated.View style={{ opacity: titleOpacity, transform: [{ translateY: titleY }] }}>
        <Animated.Text style={[hero.title, { color: titleColor }]}>
          Chessenger
        </Animated.Text>
      </Animated.View>

      {/* タグライン */}
      <Animated.View style={[hero.taglineRow, { opacity: taglineOpacity }]}>
        <View style={hero.dot} />
        <Text style={hero.tagline}>Find your match · 対局相手を探そう</Text>
        <View style={hero.dot} />
      </Animated.View>
    </View>
  );
}

const hero = StyleSheet.create({
  wrap: { alignItems: 'center', marginBottom: 36, marginTop: 8 },
  iconArea: { position: 'relative', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  ring: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 2.5,
    borderColor: '#22C55E',
  },
  iconShadow: {
    ...Platform.select({
      ios: { shadowColor: '#22C55E', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.45, shadowRadius: 24 },
      android: { elevation: 14 },
      web: { filter: 'drop-shadow(0 10px 24px rgba(34,197,94,0.45))' } as any,
    }),
  },
  icon: { width: 92, height: 92, borderRadius: 28 },
  title: { fontSize: 36, fontWeight: '900', letterSpacing: -1.5, textAlign: 'center' },
  taglineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#22C55E' },
  tagline: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
});

// ------- メイン -------
export default function LoginScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { login, register } = useAuth();
  const { language, toggleLanguage } = useChess();
  const router = useRouter();
  const [isLogin, setIsLogin] = useState<boolean>(true);
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [chessComRating, setChessComRating] = useState<string>('');
  const [lichessRating, setLichessRating] = useState<string>('');
  const [bio, setBio] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const buttonScale = useRef(new Animated.Value(1)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formY = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(600),
      Animated.parallel([
        Animated.timing(formOpacity, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
        Animated.spring(formY, { toValue: 0, speed: 12, bounciness: 4, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    ]).start();
  }, []);

  const handleSubmit = useCallback(async () => {
    if (loading) return;
    await primeAudioForApp().catch(() => {});
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Animated.sequence([
      Animated.timing(buttonScale, { toValue: 0.96, duration: 80, useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(buttonScale, { toValue: 1, speed: 30, bounciness: 8, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();

    setLoading(true);
    try {
      if (isLogin) {
        const success = await login(email, password);
        if (success) {
          playLoginSuccessSound().catch(() => {});
          router.replace('/(tabs)' as any);
        }
      } else {
        const result = await register(name, email, password, {
          chessComRating: parseInt(chessComRating) || 0,
          lichessRating: parseInt(lichessRating) || 0,
          bio,
          skillLevel: 'beginner',
        });
        if (result.success) {
          playLoginSuccessSound().catch(() => {});
          router.replace('/(tabs)' as any);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [isLogin, name, email, password, chessComRating, lichessRating, bio, loading, login, register, router]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* 背景グラデーション */}
      <LinearGradient
        colors={['#F0FDF4', '#EDE9FE', '#FAF5FF', '#F0FDF4']}
        locations={[0, 0.3, 0.7, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* フローティング駒 */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {PARTICLES.map((p, i) => <FloatingPiece key={i} {...p} />)}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* 言語切替 */}
          <View style={styles.topBar}>
            <Pressable onPress={toggleLanguage} style={styles.langBtn}>
              <Languages size={14} color="#6B7280" />
              <Text style={styles.langBtnText}>{language === 'ja' ? 'EN' : 'JA'}</Text>
            </Pressable>
          </View>

          {/* ヒーロー */}
          <AnimatedHero />

          {/* フォームカード */}
          <Animated.View style={[styles.formCard, { opacity: formOpacity, transform: [{ translateY: formY }] }]}>
            <Text style={styles.formTitle}>
              {isLogin ? t('login', language) : t('register', language)}
            </Text>

            {!isLogin && (
              <View style={styles.inputWrap}>
                <User size={16} color="#8B5CF6" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={t('name', language)}
                  placeholderTextColor="#9CA3AF"
                  value={name}
                  onChangeText={setName}
                />
              </View>
            )}

            <View style={styles.inputWrap}>
              <Mail size={16} color="#8B5CF6" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('email', language)}
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputWrap}>
              <Lock size={16} color="#8B5CF6" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('password', language)}
                placeholderTextColor="#9CA3AF"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            {!isLogin && (
              <>
                <TextInput
                  style={[styles.inputWrap, styles.input, { paddingHorizontal: 20 }]}
                  placeholder="Chess.com Rating (optional)"
                  placeholderTextColor="#9CA3AF"
                  value={chessComRating}
                  onChangeText={setChessComRating}
                  keyboardType="number-pad"
                />
                <TextInput
                  style={[styles.inputWrap, styles.input, { paddingHorizontal: 20 }]}
                  placeholder="Lichess Rating (optional)"
                  placeholderTextColor="#9CA3AF"
                  value={lichessRating}
                  onChangeText={setLichessRating}
                  keyboardType="number-pad"
                />
                <TextInput
                  style={[styles.inputWrap, styles.input, { paddingHorizontal: 20, height: 80, textAlignVertical: 'top', paddingTop: 14 }]}
                  placeholder="Bio (optional)"
                  placeholderTextColor="#9CA3AF"
                  value={bio}
                  onChangeText={setBio}
                  multiline
                />
              </>
            )}

            <Animated.View style={{ transform: [{ scale: buttonScale }], marginTop: 8 }}>
              <Pressable onPress={handleSubmit} disabled={loading} style={styles.submitBtnWrap}>
                <LinearGradient
                  colors={['#22C55E', '#16A34A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitBtn}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.submitText}>
                        {isLogin ? t('login_submit', language) : t('register_submit', language)}
                      </Text>
                      <ArrowRight size={18} color="#fff" />
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </Animated.View>
          </Animated.View>

          {/* モード切替 */}
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>
              {isLogin ? t('no_account', language) : t('has_account', language)}
            </Text>
            <Pressable onPress={() => setIsLogin(!isLogin)}>
              <Text style={styles.switchLink}>
                {isLogin ? t('register', language) : t('login', language)}
              </Text>
            </Pressable>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  const shadow = Platform.select({
    ios: { shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.10, shadowRadius: 28 },
    android: { elevation: 8 },
    web: { boxShadow: '0px 10px 36px rgba(139,92,246,0.10)' } as any,
  });

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F0FDF4' },
    keyboardView: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 24,
      paddingTop: 64,
      paddingBottom: 48,
    },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginBottom: 12,
    },
    langBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.85)',
      borderWidth: 1,
      borderColor: 'rgba(139,92,246,0.12)',
      ...Platform.select({
        ios: { shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
        android: { elevation: 2 },
        web: { boxShadow: '0 2px 8px rgba(139,92,246,0.08)' } as any,
      }),
    },
    langBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#6B7280',
      letterSpacing: 0.5,
    },
    formCard: {
      backgroundColor: 'rgba(255,255,255,0.94)',
      borderRadius: 32,
      padding: 28,
      gap: 14,
      borderWidth: 1,
      borderColor: 'rgba(139,92,246,0.08)',
      ...(shadow ?? {}),
    },
    formTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 4,
      letterSpacing: -0.3,
    },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#F8F7FF',
      borderRadius: 18,
      paddingHorizontal: 18,
      height: 54,
      borderWidth: 1,
      borderColor: 'rgba(139,92,246,0.08)',
      ...Platform.select({
        ios: { shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
        android: { elevation: 1 },
        web: { boxShadow: '0 2px 8px rgba(139,92,246,0.05)' } as any,
      }),
    },
    inputIcon: { marginRight: 12 },
    input: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '500',
    },
    submitBtnWrap: {
      borderRadius: 28,
      overflow: 'hidden',
      ...Platform.select({
        ios: { shadowColor: '#22C55E', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 18 },
        android: { elevation: 8 },
        web: { boxShadow: '0 8px 24px rgba(34,197,94,0.35)' } as any,
      }),
    },
    submitBtn: {
      height: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    submitText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      marginTop: 28,
    },
    switchLabel: { color: '#9CA3AF', fontSize: 14 },
    switchLink: { color: '#8B5CF6', fontWeight: '700', fontSize: 14 },
  });
}
