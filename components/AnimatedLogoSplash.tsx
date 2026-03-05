/**
 * アプリ起動時のロゴ SVG アニメーション
 * チェスのポーンをアクティブにパルス・スケールで表現
 */
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const LOGO_SIZE = 120;
const ACCENT = '#2B9B50';
const BG = '#FFFFFF';
const DURATION_MS = 1500;

// チェスのポーン（Material Design Icons ベース、viewBox 24x24）
const PawnPath = () => (
  <Path
    d="M19 22H5V20H19V22M16 18H8L10.18 10H8V8H10.72L10.79 7.74C10.1 7.44 9.55 6.89 9.25 6.2C8.58 4.68 9.27 2.91 10.79 2.25C12.31 1.58 14.08 2.27 14.74 3.79C15.41 5.31 14.72 7.07 13.2 7.74L13.27 8H16V10H13.82L16 18Z"
    fill={ACCENT}
  />
);

const useNativeDriver = Platform.OS !== 'web';

export function AnimatedLogoSplash({ onComplete }: { onComplete?: () => void }) {
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 登場: フェードイン + スケール
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver,
      }),
    ]).start();

    // パルスループ: 呼吸するような動き
    const pulseLoop = () => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 800,
            useNativeDriver,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.96,
            duration: 800,
            useNativeDriver,
          }),
        ]),
        { iterations: -1 }
      ).start();
    };

    const t1 = setTimeout(pulseLoop, 450);

    // 指定時間後にフェードアウトして完了
    const t2 = setTimeout(() => {
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver,
      }).start(() => {
        onComplete?.();
      });
    }, DURATION_MS);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onComplete]);

  const scaleInterpolate = Animated.multiply(scaleAnim, pulseAnim);

  return (
    <View style={[styles.container, { pointerEvents: 'none' }]}>
      <Animated.View
        style={[
          styles.logoWrap,
          {
            opacity: opacityAnim,
            transform: [{ scale: scaleInterpolate }],
          },
        ]}
      >
        <Svg width={LOGO_SIZE} height={LOGO_SIZE} viewBox="0 0 24 24">
          <PawnPath />
        </Svg>
      </Animated.View>
    </View>
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
    zIndex: 9999,
  },
  logoWrap: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
