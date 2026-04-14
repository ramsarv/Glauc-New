/**
 * Navigation v2 — Root navigator with subscription gate.
 *
 * Flow:
 *   RootStack
 *   ├── Auth              (no session)
 *   ├── Onboarding        (new user, once)
 *   ├── Subscription      (no active subscription)
 *   └── App
 *       ├── MainTabs
 *       │   ├── Scan
 *       │   ├── History
 *       │   └── Profile
 *       ├── Processing    (modal)
 *       ├── Results       (modal)
 *       └── Settings      (push)
 */

import React, { useCallback, useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, Line } from 'react-native-svg';

import { T } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { apiGetSubscription } from '../services/api';

import AuthScreen         from '../screens/AuthScreen';
import OnboardingScreen   from '../screens/OnboardingScreen';
import SubscriptionScreen from '../screens/SubscriptionScreen';
import ScanScreen         from '../screens/ScanScreen';
import ProcessingScreen   from '../screens/ProcessingScreen';
import ResultsScreen      from '../screens/ResultsScreen';
import HistoryScreen      from '../screens/HistoryScreen';
import ProfileScreen      from '../screens/ProfileScreen';
import SettingsScreen     from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

const ONBOARDING_KEY = 'glauc_onboarding_v2';

// ── Main tab navigator ────────────────────────────────────────
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tab.Screen name="Scan"    component={ScanScreen}    options={{ tabBarLabel: 'Scan' }} />
      <Tab.Screen name="History" component={HistoryScreen} options={{ tabBarLabel: 'History' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}

// ── Custom tab bar ────────────────────────────────────────────
function CustomTabBar({ state, descriptors, navigation }) {
  const insets  = useSafeAreaInsets();

  return (
    <View style={[tab.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label       = options.tabBarLabel || route.name;
        const isFocused   = state.index === index;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={tab.item}
            accessibilityRole="tab"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={label}
          >
            <TabIcon name={route.name} focused={isFocused} />
            <Text style={[tab.label, isFocused && tab.labelOn]}>
              {label}
            </Text>
            {isFocused && <View style={tab.indicator} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function TabIcon({ name, focused }) {
  const color = focused ? T.sage : T.faint;
  const size  = 24;

  if (name === 'Scan') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx="12" cy="12" r="9"  stroke={color} strokeWidth="1.5" fill="none" />
        <Circle cx="12" cy="12" r="4"  stroke={color} strokeWidth="1.5" fill="none" />
        <Circle cx="12" cy="12" r="1.5" fill={color} />
        <Line x1="3.5" y1="12" x2="7"  y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Line x1="17"  y1="12" x2="20.5" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Line x1="12" y1="3.5" x2="12" y2="7"  stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Line x1="12" y1="17" x2="12" y2="20.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </Svg>
    );
  }
  if (name === 'History') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx="12" cy="12" r="9"  stroke={color} strokeWidth="1.5" fill="none" />
        <Line x1="12" y1="7"  x2="12" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Line x1="12" y1="12" x2="15" y2="14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </Svg>
    );
  }
  if (name === 'Profile') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx="12" cy="8"  r="3.5" stroke={color} strokeWidth="1.5" fill="none" />
        <Line x1="5"  y1="20" x2="19" y2="20" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Line x1="5"  y1="20" x2="6.5" y2="15" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Line x1="19" y1="20" x2="17.5" y2="15" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Line x1="6.5" y1="15" x2="17.5" y2="15" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </Svg>
    );
  }
  return null;
}

// ── Root navigator ────────────────────────────────────────────
export default function RootNavigator() {
  const { user, loading } = useAuth();

  const [onboardingDone, setOnboardingDone] = useState(null);
  const [subscription,   setSubscription]   = useState(null);
  const [subChecked,     setSubChecked]     = useState(false);

  // Check first-launch flag
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then(val => {
      setOnboardingDone(val === '1');
    }).catch(() => setOnboardingDone(true));
  }, []);

  // Check subscription when user is known
  useEffect(() => {
    if (!user) { setSubChecked(true); setSubscription(null); return; }
    apiGetSubscription()
      .then(sub => { setSubscription(sub); setSubChecked(true); })
      .catch(() => { setSubChecked(true); });
  }, [user?.id]);

  const finishOnboarding = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, '1').catch(() => {});
    setOnboardingDone(true);
  }, []);

  const handleAuthSuccess = useCallback(async (_authUser, isNewUser) => {
    if (isNewUser) {
      await AsyncStorage.removeItem(ONBOARDING_KEY).catch(() => {});
      setOnboardingDone(false);
    }
  }, []);

  const hasActiveSubscription = subscription?.status === 'active' || subscription?.status === 'trialing';

  // Wait for all checks
  if (loading || onboardingDone === null || !subChecked) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {!user ? (
          /* ── No session ─────────────────────────────── */
          <Stack.Screen name="Auth">
            {(props) => <AuthScreen {...props} onSuccess={handleAuthSuccess} />}
          </Stack.Screen>

        ) : !onboardingDone ? (
          /* ── New user onboarding ─────────────────────── */
          <Stack.Screen name="Onboarding">
            {(props) => <OnboardingScreen {...props} onDone={finishOnboarding} />}
          </Stack.Screen>

        ) : !hasActiveSubscription ? (
          /* ── Paywall ─────────────────────────────────── */
          <Stack.Screen
            name="Subscription"
            component={SubscriptionScreen}
            options={{ animation: 'slide_from_bottom' }}
          />

        ) : (
          /* ── Authenticated + subscribed ──────────────── */
          <>
            <Stack.Screen name="MainTabs"    component={MainTabs} />
            <Stack.Screen name="Settings"    component={SettingsScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="Subscription" component={SubscriptionScreen} options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen
              name="Processing"
              component={ProcessingScreen}
              options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
            />
            <Stack.Screen
              name="Results"
              component={ResultsScreen}
              options={{ animation: 'slide_from_right' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const tab = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: T.surfaceNav,
    borderTopWidth: 1,
    borderTopColor: T.border,
    paddingTop: 10,
  },
  item: {
    flex: 1, alignItems: 'center', gap: 4, paddingBottom: 2,
  },
  label: {
    fontFamily: T.body, fontSize: 10, color: T.faint, letterSpacing: 0.3,
  },
  labelOn: {
    fontFamily: T.bodyMed, color: T.sage,
  },
  indicator: {
    position: 'absolute', bottom: -2, width: 20, height: 2,
    backgroundColor: T.sage, borderRadius: 1,
  },
});
