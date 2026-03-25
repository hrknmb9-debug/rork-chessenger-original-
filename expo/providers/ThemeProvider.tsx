import { useState, useCallback, useEffect } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LightTheme, DarkTheme, ThemeColors } from '@/constants/colors';

const THEME_KEY = 'chess_theme_mode';

export const [ThemeProvider, useTheme] = createContextHook(() => {
  const [isDark, setIsDark] = useState<boolean>(false);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_KEY);
        if (stored === 'dark') {
          setIsDark(true);
          console.log('Theme: Loaded dark mode');
        } else {
          console.log('Theme: Loaded light mode');
        }
      } catch (e) {
        console.log('Theme: Failed to load preference', e);
      }
    };
    loadTheme();
  }, []);

  const toggleTheme = useCallback(async () => {
    const newDark = !isDark;
    setIsDark(newDark);
    try {
      await AsyncStorage.setItem(THEME_KEY, newDark ? 'dark' : 'light');
      console.log('Theme: Saved', newDark ? 'dark' : 'light');
    } catch (e) {
      console.log('Theme: Failed to save preference', e);
    }
  }, [isDark]);

  const colors: ThemeColors = isDark ? DarkTheme : LightTheme;

  return { isDark, toggleTheme, colors };
});
