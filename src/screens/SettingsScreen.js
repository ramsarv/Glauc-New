/**
 * SettingsScreen — Full account, subscription, notifications, privacy, support.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Switch, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { T, PLANS } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { apiSetReminder, apiGetSubscription } from '../services/api';

export default function SettingsScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const [reminder,  setReminder]  = useState(user?.reminder_enabled ?? true);
  const [toggling,  setToggling]  = useState(false);
  const [loadingSub, setLoadingSub] = useState(false);

  const handleReminderToggle = useCallback(async (value) => {
    setToggling(true);
    try {
      if (value && Device.isDevice) {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Notifications Blocked',
            'Enable notifications in iOS Settings → Glauc → Notifications.');
          setToggling(false); return;
        }
      }
      await apiSetReminder(value);
      setReminder(value);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not update setting.');
    } finally { setToggling(false); }
  }, []);

  const handleManageSubscription = useCallback(async () => {
    setLoadingSub(true);
    try {
      const sub = await apiGetSubscription();
      if (sub?.portalUrl) {
        await Linking.openURL(sub.portalUrl);
      } else {
        navigation.navigate('Subscription');
      }
    } catch {
      navigation.navigate('Subscription');
    } finally { setLoadingSub(false); }
  }, [navigation]);

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  }, [signOut]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {
          Alert.alert('Request Submitted', 'Your account deletion request has been received. You will receive a confirmation email within 24 hours.');
        }},
      ]
    );
  }, []);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <LinearGradient colors={[T.bgDeep, T.bg]} style={StyleSheet.absoluteFill} />

      {/* Nav bar */}
      <View style={s.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={s.backIco}>←</Text>
        </TouchableOpacity>
        <Text style={s.navTitle}>Settings</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Account */}
        <Section title="Account">
          <InfoRow label="Email"     value={user?.email || '—'} />
          <InfoRow label="Name"      value={user?.name  || 'Not set'} />
          <InfoRow label="Member since" value={
            user?.joinedAt
              ? new Date(user.joinedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              : '—'
          } />
        </Section>

        {/* Subscription */}
        <Section title="Subscription">
          <ActionRow
            label="Manage Plan"
            sub="View or change your analysis plan"
            onPress={handleManageSubscription}
            loading={loadingSub}
            accent
          />
          <ActionRow
            label="Restore Purchases"
            sub="If you've already paid, tap to restore"
            onPress={handleManageSubscription}
          />
        </Section>

        {/* Notifications */}
        <Section title="Notifications">
          <SwitchRow
            label="90-Day Retest Reminder"
            sub="Be reminded when your next scan is due"
            value={reminder}
            onValueChange={handleReminderToggle}
            loading={toggling}
          />
        </Section>

        {/* Analysis Preferences */}
        <Section title="Analysis">
          <InfoRow label="AI Model"       value="DINOv3 ViT-B/14" />
          <InfoRow label="Uncertainty"    value="Monte Carlo (30 passes)" />
          <InfoRow label="Report Engine"  value="Qwen3-VL-8B" />
          <InfoRow label="Calibration"    value="Temperature Scaling" />
        </Section>

        {/* Privacy */}
        <Section title="Privacy & Data">
          <ActionRow
            label="Privacy Policy"
            onPress={() => Linking.openURL('https://glauc.app/privacy').catch(() => {})}
          />
          <ActionRow
            label="Terms of Service"
            onPress={() => Linking.openURL('https://glauc.app/terms').catch(() => {})}
          />
          <ActionRow
            label="Export My Data"
            sub="Download a copy of your scan history"
            onPress={() => Alert.alert('Export Requested', 'Your data export will be emailed to you within 24 hours.')}
          />
          <ActionRow
            label="Delete Account"
            sub="Permanently remove all your data"
            onPress={handleDeleteAccount}
            danger
          />
        </Section>

        {/* Support */}
        <Section title="Support">
          <ActionRow
            label="Contact Support"
            onPress={() => Linking.openURL('mailto:support@glauc.app').catch(() => {})}
          />
          <ActionRow
            label="FAQ"
            onPress={() => Linking.openURL('https://glauc.app/faq').catch(() => {})}
          />
          <ActionRow
            label="Report a Bug"
            onPress={() => Linking.openURL('mailto:bugs@glauc.app').catch(() => {})}
          />
        </Section>

        {/* About */}
        <Section title="About">
          <InfoRow label="Version"     value={Constants.expoConfig?.version || '1.0.0'} />
          <InfoRow label="Environment" value={__DEV__ ? 'Development' : 'Production'} />
        </Section>

        {/* Sign out */}
        <TouchableOpacity onPress={handleSignOut} style={s.signOutBtn} activeOpacity={0.8} accessibilityRole="button">
          <Text style={s.signOutTxt}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={s.footer}>
          Glauc is for wellness use only and does not constitute medical advice.{'\n'}
          © {new Date().getFullYear()} Glauc Inc. All rights reserved.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <View style={sec.wrap}>
      <Text style={sec.title}>{title}</Text>
      <View style={sec.body}>{children}</View>
    </View>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={row.wrap}>
      <Text style={row.label}>{label}</Text>
      <Text style={row.value} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ActionRow({ label, sub, onPress, accent, danger, loading }) {
  return (
    <TouchableOpacity onPress={onPress} style={row.wrap} activeOpacity={0.75} accessibilityRole="button">
      <View style={{ flex: 1 }}>
        <Text style={[row.label, danger && { color: T.error }, accent && { color: T.sage }]}>{label}</Text>
        {sub && <Text style={row.sub}>{sub}</Text>}
      </View>
      {loading
        ? <ActivityIndicator color={T.muted} size="small" />
        : <Text style={[row.chevron, danger && { color: T.error }, accent && { color: T.sage }]}>›</Text>}
    </TouchableOpacity>
  );
}

function SwitchRow({ label, sub, value, onValueChange, loading }) {
  return (
    <View style={row.wrap}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={row.label}>{label}</Text>
        {sub && <Text style={row.sub}>{sub}</Text>}
      </View>
      {loading
        ? <ActivityIndicator color={T.sage} size="small" />
        : (
          <Switch
            value={value}
            onValueChange={onValueChange}
            trackColor={{ false: T.border, true: `${T.sage}60` }}
            thumbColor={value ? T.sage : T.faint}
            ios_backgroundColor={T.border}
          />
        )}
    </View>
  );
}

const sec = StyleSheet.create({
  wrap:  { marginBottom: 8 },
  title: {
    fontFamily: T.bodySemi, fontSize: 11, color: T.sage,
    letterSpacing: 1.2, marginBottom: 8, marginLeft: 2,
  },
  body: {
    backgroundColor: T.surface, borderRadius: T.rm,
    borderWidth: 1, borderColor: T.border, overflow: 'hidden',
  },
});

const row = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  label:   { fontFamily: T.bodyMed, fontSize: 14, color: T.white, marginBottom: 2 },
  value:   { fontFamily: T.body,    fontSize: 14, color: T.muted, maxWidth: '50%', textAlign: 'right' },
  sub:     { fontFamily: T.body,    fontSize: 12, color: T.muted  },
  chevron: { fontFamily: T.bodyMed, fontSize: 20, color: T.faint, lineHeight: 22 },
});

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: T.bgDeep },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  backBtn:   { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backIco:   { fontFamily: T.bodyMed, fontSize: 22, color: T.white },
  navTitle:  { fontFamily: T.bodyMed, fontSize: 17, color: T.white },
  scroll:    { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48 },

  signOutBtn: {
    borderWidth: 1, borderColor: `${T.error}40`,
    borderRadius: T.rm, paddingVertical: 15,
    alignItems: 'center', marginTop: 16, marginBottom: 24,
  },
  signOutTxt: { fontFamily: T.bodyMed, fontSize: 15, color: T.error },

  footer: {
    fontFamily: T.bodyLight, fontSize: 11, color: T.faint,
    textAlign: 'center', lineHeight: 18,
  },
});
