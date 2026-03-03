import { Tabs } from 'expo-router';
import { Search, Swords, User, Newspaper, MessageCircle, Bell } from 'lucide-react-native';
import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '@/providers/ThemeProvider';
import { useChess } from '@/providers/ChessProvider';
import { ThemeColors } from '@/constants/colors';
import { t } from '@/utils/translations';

function BadgeIcon({ children, count, colors }: { children: React.ReactNode; count: number; colors: ThemeColors }) {
  if (count <= 0) return <>{children}</>;
  return (
    <View style={{ position: 'relative' }}>
      {children}
      <View style={{
        position: 'absolute',
        top: -5,
        right: -10,
        backgroundColor: colors.red,
        borderRadius: 9,
        minWidth: 18,
        height: 18,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        paddingHorizontal: 4,
      }}>
        <Text style={{ fontSize: 10, fontWeight: '700' as const, color: '#fff' }}>
          {count > 99 ? '99+' : count}
        </Text>
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { colors } = useTheme();
  const { pendingIncoming, language, unreadNotificationCount, totalUnreadMessageCount } = useChess();

  const matchBadge = pendingIncoming.length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600' as const,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="(home)"
        options={{
          title: t('tab_search', language),
          tabBarIcon: ({ color, size }) => <Search size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="timeline"
        options={{
          title: t('tab_timeline', language),
          tabBarIcon: ({ color, size }) => <Newspaper size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('tab_messages', language),
          tabBarIcon: ({ color, size }) => (
            <BadgeIcon count={totalUnreadMessageCount} colors={colors}>
              <MessageCircle size={size} color={color} />
            </BadgeIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: t('tab_matches', language),
          tabBarIcon: ({ color, size }) => (
            <BadgeIcon count={matchBadge} colors={colors}>
              <Swords size={size} color={color} />
            </BadgeIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t('notifications', language),
          tabBarBadge: unreadNotificationCount > 0 ? unreadNotificationCount : undefined,
          tabBarIcon: ({ color, size }) => (
            <Bell size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tab_profile', language),
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
