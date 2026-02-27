import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { Platform, View, Text } from "react-native"; // Textを追加
import { supabase, supabaseNoAuth } from "@/utils/supabaseClient";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { LocationProvider } from "@/providers/LocationProvider";
import { ChessProvider } from "@/providers/ChessProvider";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { ThemeProvider, useTheme } from "@/providers/ThemeProvider";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { colors } = useTheme();
  const { isLoggedIn, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === ('login' as string);
    if (!isLoggedIn && !inAuthGroup) {
      router.replace('/login' as any);
      hasNavigated.current = true;
    } else if (isLoggedIn && inAuthGroup) {
      router.replace('/(tabs)' as any);
      hasNavigated.current = true;
    }
  }, [isLoggedIn, isLoading, segments]);

  const backTitle = Platform.OS === 'ios' ? ' ' : undefined;

  return (
    <View style={{ flex: 1 }}>
      {/* 🚨 ここがピンクのバナー：これが見えたら同期成功 */}
      <View style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        right: 0, 
        height: 100, 
        backgroundColor: '#FF00FF', 
        zIndex: 99999, 
        justifyContent: 'center', 
        alignItems: 'center',
        paddingTop: 40
      }}>
        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 18 }}>
          UI_EXPLOSION_MODE_ACTIVE (SYNCED)
        </Text>
      </View>

      <Stack
        screenOptions={{
          headerBackTitle: backTitle,
          headerTintColor: 'white',
          headerStyle: { backgroundColor: colors.card },
          contentStyle: { backgroundColor: colors.background },
          gestureEnabled: true,
          animation: 'default',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false, presentation: "fullScreenModal" }} />
        {/* ...他のScreen設定は維持されます... */}
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <AuthProvider>
            <LocationProvider>
              <ChessProvider>
                <ThemeProvider>
                  <RootLayoutNav />
                </ThemeProvider>
              </ChessProvider>
            </LocationProvider>
          </AuthProvider>
        </View>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}