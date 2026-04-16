/**
 * App.js — Glauc root entry point
 *
 * Responsibilities:
 *   1. Load custom fonts (PlayfairDisplay + DM Sans)
 *   2. Hold splash screen until fonts are ready
 *   3. Wrap tree: GestureHandler → SafeArea → Stripe → Auth → Navigation
 */

import React, { useCallback } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerRootComponent } from 'expo';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import {
  useFonts,
  PlayfairDisplay_700Bold,
  PlayfairDisplay_500Medium,
} from '@expo-google-fonts/playfair-display';
import {
  DMSans_300Light,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
} from '@expo-google-fonts/dm-sans';

import { AuthProvider } from './src/context/AuthContext';
import { T }           from './src/constants/theme';

// Load the navigator via require() so any module-load failure is catchable.
// Static `import` is hoisted and silently kills AppRegistry if one module fails.
let RootNavigator;
let _loadError = null;
try {
  RootNavigator = require('./src/navigation/index').default;
} catch (e) {
  _loadError = e.message + '\n\n' + (e.stack || '').slice(0, 1200);
  console.error('[Glauc] FATAL module load error:\n', _loadError);
  RootNavigator = () => (
    <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', padding: 24 }}>
      <Text style={{ color: '#ff5555', fontSize: 12, fontFamily: 'monospace', lineHeight: 18 }}>
        {'MODULE LOAD ERROR\n\n' + _loadError}
      </Text>
    </View>
  );
}

// Keep splash visible until fonts resolve
SplashScreen.preventAutoHideAsync();

// Optional Stripe — wraps the app only when the publishable key is configured
const STRIPE_KEY = process.env.EXPO_PUBLIC_STRIPE_KEY || '';

// Lazy-load StripeProvider so the app boots without Stripe if key is absent
let StripeProvider = null;
try {
  // This will succeed in EAS builds where the Stripe SDK is installed
  StripeProvider = require('@stripe/stripe-react-native').StripeProvider;
} catch {
  // Expo Go / no Stripe SDK — subscription screen will show a friendly message
  StripeProvider = null;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    PlayfairDisplay_700Bold,
    PlayfairDisplay_500Medium,
    DMSans_300Light,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Hold render until fonts are ready (avoids FOUT)
  if (!fontsLoaded && !fontError) return null;

  const tree = (
    <GestureHandlerRootView style={s.flex}>
      <SafeAreaProvider>
        <View style={s.flex} onLayout={onLayoutRootView}>
          <StatusBar style="light" backgroundColor={T.bgDeep} />
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );

  // Wrap with StripeProvider only when both key and SDK are available
  if (STRIPE_KEY && StripeProvider) {
    return (
      <StripeProvider
        publishableKey={STRIPE_KEY}
        merchantIdentifier="merchant.com.glauc.app"
        urlScheme="glauc"
      >
        {tree}
      </StripeProvider>
    );
  }

  return tree;
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: T.bgDeep },
});

// Explicit registration — required in Expo 51 when "main" points to App.js directly.
registerRootComponent(App);
