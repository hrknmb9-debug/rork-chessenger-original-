/**
 * アプリ起動時のスプラッシュアニメーション
 * アプリアイコン + "Chessenger" テキストをダイナミックに表示
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { Image } from 'expo-image';

const useNativeDriver = Platform.OS !== 'web';
const ICON_SIZE = 100;
const BG = '#FFFFFF';

export function AnimatedLogoSplash({ onComplete }: { onComplete?: () => void }) {
  const iconScale   = useRef(new Animated.Value(0.4)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY       = useRef(new Animated.Value(16)).current;
  const dotScale    = useRef(new Animated.Value(0)).current;
  const pulse       = useRef(new Animated.Value(1)).current;
  const shimmer     = useRef(new Animated.Value(0)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 1) アイコン登場（spring）
    Animated.parallel([
      Animated.spring(iconScale,   { toValue: 1, tension: 60, friction: 7, useNativeDriver }),
      Animated.timing(iconOpacity, { toValue: 1, duration: 350, useNativeDriver }),
    ]).start(() => {
      // 2) テキスト + ドット フェードイン
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 400, useNativeDriver }),
        Animated.spring(textY,       { toValue: 0, speed: 14, bounciness: 6, useNativeDriver }),
        Animated.spring(dotScale,    { toValue: 1, tension: 80, friction: 6, useNativeDriver }),
      ]).start();

      // 3) アイコンのパルスループ
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.08, duration: 700, useNativeDriver }),
          Animated.timing(pulse, { toValue: 0.95, duration: 700, useNativeDriver }),
        ])
      ).start();

      // 4) タイトルシマーループ（useNativeDriver 非対応の color は JS 側で）
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmer, { toValue: 1, duration: 1200, useNativeDriver: false }),
          Animated.timing(shimmer, { toValue: 0, duration: 1200, useNativeDriver: false }),
        ])
      ).start();
    });

    // 5) 一定時間後にフェードアウトして完了
    const t = setTimeout(() => {
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver,
      }).start(() => onComplete?.());
    }, 1800);

    return () => clearTimeout(t);
  }, [onComplete]);

  const titleColor = shimmer.interpolate({
    inputRange:  [0, 0.5, 1],
    outputRange: ['#18181B', '#22C55E', '#18181B'],
  });

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity }]} pointerEvents="none">
      {/* アイコン */}
      <Animated.View
        style={[
          styles.iconWrap,
          {
            opacity: iconOpacity,
            transform: [{ scale: Animated.multiply(iconScale, pulse) }],
          },
        ]}
      >
        <Image
          source={require('@/assets/images/app-icon.png')}
          style={styles.icon}
          contentFit="cover"
        />
      </Animated.View>

      {/* Chessenger テキスト */}
      <Animated.View style={{ opacity: textOpacity, transform: [{ translateY: textY }] }}>
        <Animated.Text style={[styles.title, { color: titleColor }]}>
          Chessenger
        </Animated.Text>
        <View style={styles.subtitleRow}>
          <Animated.View style={[styles.dot, { transform: [{ scale: dotScale }] }]} />
          <Text style={styles.subtitle}>Find your match</Text>
          <Animated.View style={[styles.dot, { transform: [{ scale: dotScale }] }]} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    zIndex: 9999,
  },
  iconWrap: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE * 0.23,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#22C55E',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.40,
        shadowRadius: 20,
      },
      android: { elevation: 12 },
    }),
  },
  icon: { width: ICON_SIZE, height: ICON_SIZE },
  title: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.2,
    textAlign: 'center',
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});
