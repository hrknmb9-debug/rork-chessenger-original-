import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { LogBox, Platform, View, StatusBar } from "react-native";

LogBox.ignoreLogs([
  "[SafeImage] onError",
  "Image data is nil",
  "useNativeDriver", // web では RCTAnimation 未対応のため警告を抑制
]);
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { LocationProvider } from "@/providers/LocationProvider";
import { ChessProvider } from "@/providers/ChessProvider";
import { AuthProvider } from "@/providers/AuthProvider";
import { ThemeProvider, useTheme } from "@/providers/ThemeProvider";

// スプラッシュ画面を自動で隠さないように設定
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { colors, isDark } = useTheme();
  const backTitle = Platform.OS === 'ios' ? ' ' : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <Stack
        screenOptions={{
          headerBackTitle: backTitle,
          headerTintColor: colors.textPrimary,
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false, // 境界線を消してスッキリさせる
          contentStyle: { backgroundColor: colors.background },
          gestureEnabled: true,
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false, presentation: "fullScreenModal" }} />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  useEffect(() => {
    // 起動時に少し待ってからスプラッシュを消す
    const hideSplash = async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await SplashScreen.hideAsync();
    };
    hideSplash();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AuthProvider>
          <LocationProvider>
            <ChessProvider>
              <ThemeProvider>
                <RootLayoutNav />
              </ThemeProvider>
            </ChessProvider>
          </LocationProvider>
        </AuthProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}