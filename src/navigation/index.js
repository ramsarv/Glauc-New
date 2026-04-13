/**
 * Navigation — Root navigator for Glauc.
 *
 * Structure:
 *   RootStack
 *   ├── Auth          (shown while logged out)
 *   ├── Onboarding    (shown once for new users)
 *   └── Main
 *       ├── Tabs (BottomTab)
 *       │   ├── Scan
 *       │   ├── History
 *       │   └── Profile
 *       ├── Processing  (modal, no tab bar)
 *       └── Results     (modal, no tab bar)
 */

import React, { useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Dimensions, Platform,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';

import { T } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

import AuthScreen       from '../screens/AuthScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import ScanScreen       from '../screens/ScanScreen';
import ProcessingScreen from '../screens/ProcessingScreen';
import ResultsScreen    from '../screens/ResultsScreen';
import HistoryScreen    from '../screens/HistoryScreen';
import ProfileScreen    from '../screens/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

const ONBOARDING_KEY = 'glauc_onboarding_done';

// ── Main tab navigator ────────────────────────────────────────
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tab.Screen
        name="Scan"
        component={ScanScreen}
        options={{ tabBarLabel: 'Scan' }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ tabBarLabel: 'History' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

// ── Custom tab bar ────────────────────────────────────────────
function CustomTabBar({ state, descriptors, navigation }) {
  const insets  = useSafeAreaInsets();
  const focused = state.index;

  return (
    <View style={[tabStyles.bar, { paddingBottom: insets.bottom || 12 }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label       = options.tabBarLabel || route.name;
        const isFocused   = focused === index;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={tabStyles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={label}
          >
            <TabIcon name={route.name} focused={isFocused} />
            <Text style={[tabStyles.label, isFocused && tabStyles.labelActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function TabIcon({ name, focused }) {
  const color = focused ? T.amber : T.creamLow;
  const size  = 22;

  if (name === 'Scan') {
    return (
      <Svg width={size} height={size} viewBox="0 0 22 22">
        <Circle cx="11" cy="11" r="8" stroke={color} strokeWidth="1.5" fill="none" />
        <Circle cx="11" cy="11" r="3.5" stroke={color} strokeWidth="1.5" fill="none" />
        <Circle cx="11" cy="11" r="1" fill={color} />
        <Line x1="3" y1="11" x2="6" y2="11" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Line x1="16" y1="11" x2="19" y2="11" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Line x1="11" y1="3" x2="11" y2="6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Line x1="11" y1="16" x2="11" y2="19" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </Svg>
    );
  }

  if (name === 'History') {
    return (
      <Svg width={size} height={size} viewBox="0 0 22 22">
        <Circle cx="11" cy="11" r="8" stroke={color} strokeWidth="1.5" fill="none" />
        <Line x1="11" y1="7" x2="11" y2="11" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Line x1="11" y1="11" x2="14" y2="13" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </Svg>
    );
  }

  if (name === 'Profile') {
    return (
      <Svg width={size} height={size} viewBox="0 0 22 22">
        <Circle cx="11" cy="8" r="3.5" stroke={color} strokeWidth="1.5" fill="none" />
        <Line x1="4" y1="19" x2="18" y2="19" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Line x1="4" y1="19" x2="5.5" y2="14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Line x1="18" y1="19" x2="16.5" y2="14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <Line x1="5.5" y1="14" x2="16.5" y2="14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </Svg>
    );
  }

  return null;
}

// ── Root navigator ────────────────────────────────────────────
export default function RootNavigator() {
  const { user, loading } = useAuth();
  const [showOnboarding, setShowOnboarding] = React.useState(null);

  // Check if user has seen onboarding
  React.useEffect(() => {
    (async () => {
      try {
        const done = await AsyncStorage.getItem(ONBOARDING_KEY);
        setShowOnboarding(done !== '1');
      } catch {
        setShowOnboarding(false);
      }
    })();
  }, []);

  const handleOnboardingDone = useCallback(async () => {
    try { await AsyncStorage.setItem(ONBOARDING_KEY, '1'); } catch {}
    setShowOnboarding(false);
  }, []);

  const handleAuthSuccess = useCallback(async (authUser, isNewUser) => {
    if (isNewUser) {
      try { await AsyncStorage.removeItem(ONBOARDING_KEY); } catch {}
      setShowOnboarding(true);
    }
  }, []);

  // Still loading auth state
  if (loading || showOnboarding === null) {
    return null; // SplashScreen is visible
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {!user ? (
          // ── Not authenticated ──────────────────────────
          <Stack.Screen name="Auth">
            {(props) => <AuthScreen {...props} onSuccess={handleAuthSuccess} />}
          </Stack.Screen>
        ) : showOnboarding ? (
          // ── New user onboarding ────────────────────────
          <Stack.Screen name="Onboarding">
            {(props) => <OnboardingScreen {...props} onDone={handleOnboardingDone} />}
          </Stack.Screen>
        ) : (
          // ── Authenticated main app ─────────────────────
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
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

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: T.surface,
    borderTopWidth: 1,
    borderTopColor: T.border,
    paddingTop: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingBottom: 2,
  },
  label: {
    fontFamily: T.body,
    fontSize: 10,
    color: T.creamLow,
    letterSpacing: 0.3,
  },
  labelActive: {
    fontFamily: T.bodyMed,
    color: T.amber,
  },
});
