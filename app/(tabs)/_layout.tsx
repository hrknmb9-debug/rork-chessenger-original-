import { Tabs } from 'expo-router';
import { Search, Swords, User, Newspaper, MessageCircle } from 'lucide-react-native';
import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { ThemeColors } from '@/constants/colors';
import { t } from '@/utils/translations';

// ─── 個別タブアイテム ────────────────────────────────────────────────────────

interface TabItemProps {
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  icon: (color: string, size: number) => React.ReactNode;
  label: string;
  badge?: number;
  colors: ThemeColors;
}

function TabBarItem({ isFocused, onPress, onLongPress, icon, label, badge = 0, colors }: TabItemProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const pillScale = useRef(new Animated.Value(isFocused ? 1 : 0.7)).current;
  const pillOpacity = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const iconTranslate = useRef(new Animated.Value(isFocused ? -2 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(pillScale, {
        toValue: isFocused ? 1 : 0.7,
        speed: 18,
        bounciness: 5,
        useNativeDriver: true,
      }),
      Animated.timing(pillOpacity, {
        toValue: isFocused ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(iconTranslate, {
        toValue: isFocused ? -2 : 0,
        speed: 20,
        bounciness: 4,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isFocused]);

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.82, speed: 60, bounciness: 0, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, speed: 18, bounciness: 14, useNativeDriver: true }),
    ]).start();
    onPress();
  }, [onPress, scale]);

  const iconColor = isFocused ? '#fff' : colors.textMuted;
  const labelColor = isFocused ? colors.accent : colors.textMuted;

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress}
      style={tabStyles.item}
      accessibilityRole="button"
    >
      <Animated.View style={[tabStyles.itemInner, { transform: [{ scale }] }]}>
        {/* アクティブピル */}
        <Animated.View
          style={[
            tabStyles.pill,
            {
              backgroundColor: colors.accent,
              opacity: pillOpacity,
              transform: [{ scale: pillScale }],
            },
          ]}
        />

        {/* アイコン */}
        <Animated.View style={[tabStyles.iconWrap, { transform: [{ translateY: iconTranslate }] }]}>
          {badge > 0 && (
            <View style={[tabStyles.badge, { backgroundColor: colors.red }]}>
              <Text style={tabStyles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
            </View>
          )}
          {icon(iconColor, 22)}
        </Animated.View>

        {/* ラベル */}
        <Text
          style={[
            tabStyles.label,
            {
              color: labelColor,
              fontWeight: isFocused ? '700' : '500',
              opacity: isFocused ? 1 : 0.7,
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── カスタムタブバー ─────────────────────────────────────────────────────────

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, isDark } = useTheme();
  const { pendingIncoming, language, totalUnreadMessageCount, unreadTimelineNotificationCount } = useChess();
  const insets = useSafeAreaInsets();

  const matchBadge = pendingIncoming.length;

  const badges: Record<string, number> = {
    timeline: unreadTimelineNotificationCount,
    messages: totalUnreadMessageCount,
    matches: matchBadge,
  };

  const icons: Record<string, (c: string, s: number) => React.ReactNode> = {
    '(home)': (c, s) => <Search size={s} color={c} />,
    timeline: (c, s) => <Newspaper size={s} color={c} />,
    messages: (c, s) => <MessageCircle size={s} color={c} />,
    matches: (c, s) => <Swords size={s} color={c} />,
    profile: (c, s) => <User size={s} color={c} />,
  };

  return (
    <View style={[tabStyles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View
        style={[
          tabStyles.barShadow,
          Platform.select({
            ios: {
              shadowColor: colors.accent,
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.10,
              shadowRadius: 20,
            },
            android: { elevation: 12 },
          }),
        ]}
      >
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={72}
            tint={isDark ? 'dark' : 'light'}
            style={[tabStyles.bar, { borderColor: colors.tabBarBorder }]}
          >
            {state.routes.map((route, index) => {
              const { options } = descriptors[route.key];
              const isFocused = state.index === index;

              const onPress = () => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
              };
              const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });

              return (
                <TabBarItem
                  key={route.key}
                  isFocused={isFocused}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  icon={icons[route.name] ?? ((c, s) => <Search size={s} color={c} />)}
                  label={options.title ?? t('tab_search', language)}
                  badge={badges[route.name] ?? 0}
                  colors={colors}
                />
              );
            })}
          </BlurView>
        ) : (
          <View style={[tabStyles.bar, { backgroundColor: colors.tabBar, borderColor: colors.tabBarBorder }]}>
            {state.routes.map((route, index) => {
              const { options } = descriptors[route.key];
              const isFocused = state.index === index;

              const onPress = () => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
              };
              const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });

              return (
                <TabBarItem
                  key={route.key}
                  isFocused={isFocused}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  icon={icons[route.name] ?? ((c, s) => <Search size={s} color={c} />)}
                  label={options.title ?? t('tab_search', language)}
                  badge={badges[route.name] ?? 0}
                  colors={colors}
                />
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
  },
  barShadow: {
    borderRadius: 28,
    overflow: Platform.OS === 'android' ? 'hidden' : 'visible',
  },
  bar: {
    flexDirection: 'row',
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
    minWidth: 48,
  },
  pill: {
    position: 'absolute',
    width: 44,
    height: 36,
    borderRadius: 18,
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    marginBottom: 2,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -8,
    minWidth: 17,
    height: 17,
    borderRadius: 8.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    zIndex: 10,
  },
  badgeText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  label: { fontSize: 10, letterSpacing: 0.1 },
});

// ─── Layout ──────────────────────────────────────────────────────────────────

export default function TabLayout() {
  const { colors } = useTheme();
  const { language } = useChess();

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{ title: t('tab_search', language) }}
      />
      <Tabs.Screen
        name="timeline"
        options={{ title: t('tab_timeline', language) }}
      />
      <Tabs.Screen
        name="messages"
        options={{ title: t('tab_messages', language) }}
      />
      <Tabs.Screen
        name="matches"
        options={{ title: t('tab_matches', language) }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tab_profile', language) }}
      />
    </Tabs>
  );
}
