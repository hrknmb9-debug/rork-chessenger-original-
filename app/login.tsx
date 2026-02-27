import React, { useState, useCallback, useRef, useMemo } from 'react';
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
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Mail, Lock, User, ArrowRight, Languages, Trophy } from 'lucide-react-native';
import { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useChess } from '@/providers/ChessProvider';
import { t } from '@/utils/translations';

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

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  const handleSubmit = useCallback(async () => {
    if (loading) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Animated.sequence([
      Animated.timing(buttonScale, { toValue: 0.96, duration: 70, useNativeDriver: true }),
      Animated.timing(buttonScale, { toValue: 1, duration: 70, useNativeDriver: true }),
    ]).start();

    setLoading(true);
    try {
      if (isLogin) {
        const success = await login(email, password);
        if (success) router.replace('/(tabs)' as any);
      } else {
        const result = await register(name, email, password, {
          chessComRating: parseInt(chessComRating) || 0,
          lichessRating: parseInt(lichessRating) || 0,
          bio,
          skillLevel: 'beginner',
        });
        if (result.success) router.replace('/(tabs)' as any);
      }
    } finally {
      setLoading(false);
    }
  }, [isLogin, name, email, password, chessComRating, lichessRating, bio, loading]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          <View style={styles.topBar}>
            <Pressable onPress={toggleLanguage} style={styles.langBtn}>
              <Languages size={15} color={colors.textMuted} />
              <Text style={styles.langBtnText}>{language === 'ja' ? 'EN' : 'JA'}</Text>
            </Pressable>
          </View>

          <View style={styles.heroSection}>
            <View style={styles.logoMark}>
              <Text style={styles.logoIcon}>♟</Text>
            </View>
            <Text style={styles.appName}>Chessenger</Text>
            <Text style={styles.tagline}>{t('find_rival', language)}</Text>
          </View>

          <View style={styles.formSection}>
            {!isLogin && (
              <View style={styles.inputWrap}>
                <User size={17} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput style={styles.input} placeholder={t('name', language)} value={name} onChangeText={setName} />
              </View>
            )}

            <View style={styles.inputWrap}>
              <Mail size={17} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder={t('email', language)} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            </View>

            <View style={styles.inputWrap}>
              <Lock size={17} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder={t('password', language)} value={password} onChangeText={setPassword} secureTextEntry />
            </View>

            <Animated.View style={{ transform: [{ scale: buttonScale }], marginTop: 12 }}>
              <Pressable onPress={handleSubmit} style={styles.submitBtn} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : (
                  <><Text style={styles.submitText}>{isLogin ? t('login_submit', language) : t('register_submit', language)}</Text><ArrowRight size={18} color="#fff" /></>
                )}
              </Pressable>
            </Animated.View>
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{isLogin ? t('no_account', language) : t('has_account', language)}</Text>
            <Pressable onPress={() => setIsLogin(!isLogin)}>
              <Text style={styles.switchLink}>{isLogin ? t('register', language) : t('login', language)}</Text>
            </Pressable>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    keyboardView: { flex: 1 },
    scrollContent: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },
    topBar: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 20 },
    langBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8, borderRadius: 12, backgroundColor: colors.surface },
    langBtnText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
    heroSection: { alignItems: 'center', marginBottom: 40 },
    logoMark: { width: 80, height: 80, borderRadius: 24, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    logoIcon: { fontSize: 40, color: '#fff' },
    appName: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, letterSpacing: -1 },
    tagline: { fontSize: 15, color: colors.textMuted, marginTop: 4 },
    formSection: { gap: 12 },
    inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 16, height: 56, borderWidth: 1, borderColor: colors.cardBorder },
    inputIcon: { marginRight: 12 },
    input: { flex: 1, color: colors.textPrimary, fontSize: 16 },
    submitBtn: { height: 56, backgroundColor: colors.accent, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    switchRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 30 },
    switchLabel: { color: colors.textMuted },
    switchLink: { color: colors.accent, fontWeight: '700' },
  });
}