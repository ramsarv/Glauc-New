/**
 * App.js — Glauc root entry point.
 *
 * Responsibilities:
 *   1. Load custom fonts (PlayfairDisplay + DMSans)
 *   2. Keep SplashScreen visible until fonts + auth state are ready
 *   3. Wrap everything in AuthProvider
 *   4. Render RootNavigator
 */

import React, { useCallback, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import {
  PlayfairDisplay_500Medium,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import {
  DMSans_300Light,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
} from '@expo-google-fonts/dm-sans';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import RootNavigator from './src/navigation';

// Prevent splash from auto-hiding until we're ready
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [fontsLoaded, setFontsLoaded] = React.useState(false);

  useEffect(() => {
    (async () => {
      try {
        await Font.loadAsync({
          PlayfairDisplay_500Medium,
          PlayfairDisplay_700Bold,
          DMSans_300Light,
          DMSans_400Regular,
          DMSans_500Medium,
          DMSans_600SemiBold,
        });
      } catch (err) {
        // Non-fatal: app renders with system fonts as fallback
        console.warn('Font loading failed:', err);
      } finally {
        setFontsLoaded(true);
      }
    })();
  }, []);

  const onReady = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <RootNavigator onReady={onReady} />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
