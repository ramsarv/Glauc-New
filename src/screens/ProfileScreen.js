/**
 * ProfileScreen — User account, reminder settings, sign out.
 * Loads real user data from AuthContext, toggles push notifications.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Switch, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { T } from '../constants/theme';
import Card from '../components/Card';
import GhostButton from '../components/GhostButton';
import { useAuth } from '../context/AuthContext';
import { apiSetReminder } from '../services/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge:  false,
  }),
});

export default function ProfileScreen() {
  const { user, signOut, refreshUser } = useAuth();

  const [reminder,   setReminder]   = useState(user?.reminder_enabled ?? true);
  const [toggling,   setToggling]   = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Sync reminder state when user data updates
  useEffect(() => {
    if (user?.reminder_enabled != null) {
      setReminder(!!user.reminder_enabled);
    }
  }, [user?.reminder_enabled]);

  // ── Notification permission + token ────────────────────────
  const requestNotificationPermission = useCallback(async () => {
    if (!Device.isDevice) return null; // Simulator — no push tokens
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return existing;
    const { status } = await Notifications.requestPermissionsAsync();
    return status;
  }, []);

  // ── Toggle reminder ─────────────────────────────────────────
  const handleReminderToggle = useCallback(async (value) => {
    setToggling(true);
    try {
      if (value) {
        const status = await requestNotificationPermission();
        if (status !== 'granted') {
          Alert.alert(
            'Notifications Blocked',
            'Enable notifications in Settings to receive 90-day retest reminders.',
          );
          setToggling(false);
          return;
        }
      }
      await apiSetReminder(value);
      setReminder(value);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not update reminder setting.');
    } finally {
      setToggling(false);
    }
  }, [requestNotificationPermission]);

  // ── Sign out ────────────────────────────────────────────────
  const handleSignOut = useCallback(() => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            await signOut();
          },
        },
      ]
    );
  }, [signOut]);

  const joinedDate = user?.joinedAt
    ? new Date(user.joinedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  const lastScanDate = user?.lastScan
    ? new Date(user.lastScan).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Never';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <LinearGradient
        colors={[`${T.amber}10`, T.obsidian]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.4 }}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Profile</Text>

        {/* ── Account Info ──────────────────────────────────── */}
        <Card style={styles.section}>
          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>
                {(user?.name?.[0] || user?.email?.[0] || '?').toUpperCase()}
              </Text>
            </View>
            <View style={styles.userInfo}>
              {user?.name ? (
                <Text style={styles.userName}>{user.name}</Text>
              ) : null}
              <Text style={styles.userEmail}>{user?.email || '—'}</Text>
              {joinedDate && (
                <Text style={styles.userMeta}>Member since {joinedDate}</Text>
              )}
            </View>
          </View>
        </Card>

        {/* ── Scan Stats ───────────────────────────────────── */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Scan Activity</Text>
          <StatRow label="Scans today" value={String(user?.scansToday ?? 0)} />
          <StatRow label="Last scan"   value={lastScanDate} />
          <StatRow label="Daily limit" value="10 scans" />
        </Card>

        {/* ── Notifications ────────────────────────────────── */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Text style={styles.settingLabel}>90-Day Retest Reminder</Text>
              <Text style={styles.settingDesc}>
                Get reminded when it's time for your next ocular scan.
              </Text>
            </View>
            {toggling ? (
              <ActivityIndicator color={T.amber} size="small" />
            ) : (
              <Switch
                value={reminder}
                onValueChange={handleReminderToggle}
                trackColor={{ false: T.border, true: `${T.amber}60` }}
                thumbColor={reminder ? T.amber : T.creamLow}
                ios_backgroundColor={T.border}
              />
            )}
          </View>
        </Card>

        {/* ── About ────────────────────────────────────────── */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <StatRow label="App version"    value={Constants.expoConfig?.version || '1.0.0'} />
          <StatRow label="Model"          value="DINOv3 ViT-B/14" />
          <StatRow label="Analysis"       value="Qwen3-VL-8B" />
          <StatRow label="Inference"      value="MC Dropout + TTA" />
        </Card>

        {/* ── Legal ────────────────────────────────────────── */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>
          <Text style={styles.legalText}>
            Glauc is a wellness application for informational purposes only. It is not a
            medical device and does not provide medical diagnoses or treatment recommendations.
            Always consult a qualified ophthalmologist for clinical assessment.
          </Text>
        </Card>

        {/* ── Sign Out ─────────────────────────────────────── */}
        <View style={styles.signOutWrap}>
          {signingOut ? (
            <ActivityIndicator color={T.red} />
          ) : (
            <GhostButton
              onPress={handleSignOut}
              style={styles.signOutBtn}
              textStyle={styles.signOutText}
            >
              Sign Out
            </GhostButton>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatRow({ label, value }) {
  return (
    <View style={statStyles.row}>
      <Text style={statStyles.label}>{label}</Text>
      <Text style={statStyles.value}>{value}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  label: {
    fontFamily: T.body,
    fontSize: 14,
    color: T.creamMid,
  },
  value: {
    fontFamily: T.bodyMed,
    fontSize: 14,
    color: T.cream,
  },
});

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: T.obsidian },
  scroll: { paddingHorizontal: 20, paddingBottom: 48 },

  heading: {
    fontFamily: T.display,
    fontSize: 30,
    color: T.cream,
    marginTop: 20,
    marginBottom: 16,
  },

  section: { padding: 20, marginBottom: 12 },
  sectionTitle: {
    fontFamily: T.bodyMed,
    fontSize: 13,
    color: T.creamMid,
    letterSpacing: 0.5,
    marginBottom: 14,
  },

  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: {
    width: 56, height: 56,
    borderRadius: 28,
    backgroundColor: T.amberGlow,
    borderWidth: 2,
    borderColor: `${T.amber}40`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: T.displayBold,
    fontSize: 22,
    color: T.amber,
  },
  userInfo:   { flex: 1 },
  userName: {
    fontFamily: T.bodyMed,
    fontSize: 16,
    color: T.cream,
    marginBottom: 2,
  },
  userEmail: {
    fontFamily: T.body,
    fontSize: 13,
    color: T.creamMid,
  },
  userMeta: {
    fontFamily: T.bodyLight,
    fontSize: 12,
    color: T.creamLow,
    marginTop: 2,
  },

  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingLeft:  { flex: 1 },
  settingLabel: {
    fontFamily: T.bodyMed,
    fontSize: 14,
    color: T.cream,
    marginBottom: 4,
  },
  settingDesc: {
    fontFamily: T.bodyLight,
    fontSize: 12,
    color: T.creamMid,
    lineHeight: 18,
  },

  legalText: {
    fontFamily: T.body,
    fontSize: 13,
    color: T.creamMid,
    lineHeight: 22,
  },

  signOutWrap: { marginTop: 8, marginBottom: 24 },
  signOutBtn:  { borderColor: `${T.red}40` },
  signOutText: { color: T.red },
});
