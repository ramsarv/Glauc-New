/**
 * ProfileScreen v2 — Subscription status + settings navigation.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { T, PLANS } from '../constants/theme';
import Card from '../components/Card';
import { useAuth } from '../context/AuthContext';
import { apiGetSubscription } from '../services/api';

export default function ProfileScreen({ navigation }) {
  const { user } = useAuth();
  const [sub, setSub] = useState(null);
  const [loadSub, setLoadSub] = useState(true);

  useEffect(() => {
    apiGetSubscription()
      .then(s => setSub(s))
      .catch(() => setSub(null))
      .finally(() => setLoadSub(false));
  }, []);

  const planInfo = sub ? PLANS.find(p => p.id === sub.plan) : null;

  const joinedDate = user?.joinedAt
    ? new Date(user.joinedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;
  const lastScan = user?.lastScan
    ? new Date(user.lastScan).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Never';

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <LinearGradient colors={[`${T.sage}0A`, T.bgDeep]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.35 }} style={StyleSheet.absoluteFill} />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header row */}
        <View style={s.topRow}>
          <Text style={s.heading}>Profile</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={s.settingsBtn} accessibilityRole="button" accessibilityLabel="Open Settings">
            <Text style={s.settingsIco}>⚙</Text>
          </TouchableOpacity>
        </View>

        {/* Avatar + identity */}
        <Card style={s.identityCard}>
          <View style={s.avatarRow}>
            <View style={s.avatar}>
              <Text style={s.avatarTxt}>
                {(user?.name?.[0] || user?.email?.[0] || '?').toUpperCase()}
              </Text>
            </View>
            <View style={s.identity}>
              {user?.name ? <Text style={s.name}>{user.name}</Text> : null}
              <Text style={s.email}>{user?.email || '—'}</Text>
              {joinedDate && <Text style={s.meta}>Member since {joinedDate}</Text>}
            </View>
          </View>
        </Card>

        {/* Subscription status */}
        <Card style={s.sec}>
          <Text style={s.secTitle}>Subscription</Text>
          {loadSub ? (
            <ActivityIndicator color={T.sage} style={{ paddingVertical: 12 }} />
          ) : sub?.status === 'active' ? (
            <View>
              <View style={s.subActive}>
                <View style={s.subDot} />
                <Text style={s.subPlan}>{planInfo?.label || sub.plan}</Text>
              </View>
              {sub.currentPeriodEnd && (
                <Text style={s.subExpiry}>
                  Renews {new Date(sub.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              )}
              <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={s.manageBtn}>
                <Text style={s.manageTxt}>Manage Plan →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={s.noSub}>No active subscription</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Subscription')} style={s.upgradeBtn} activeOpacity={0.85}>
                <Text style={s.upgradeTxt}>Choose a Plan</Text>
              </TouchableOpacity>
            </View>
          )}
        </Card>

        {/* Scan stats */}
        <Card style={s.sec}>
          <Text style={s.secTitle}>Scan Activity</Text>
          <StatRow label="Scans today" value={String(user?.scansToday ?? 0)} />
          <StatRow label="Last scan"   value={lastScan} />
          <StatRow label="Daily limit" value="10 scans" />
        </Card>

        {/* Quick links */}
        <Card style={s.sec}>
          <Text style={s.secTitle}>Account</Text>
          <ActionRow label="Settings"          onPress={() => navigation.navigate('Settings')} />
          <ActionRow label="Manage Subscription" onPress={() => navigation.navigate('Subscription')} />
          <ActionRow label="Privacy Policy"    onPress={() => {}} />
          <ActionRow label="Terms of Service"  onPress={() => {}} />
        </Card>

        <Text style={s.disclaimer}>
          Glauc is for wellness use only.{'\n'}
          Not a medical device or clinical diagnostic tool.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatRow({ label, value }) {
  return (
    <View style={r.row}>
      <Text style={r.label}>{label}</Text>
      <Text style={r.value}>{value}</Text>
    </View>
  );
}

function ActionRow({ label, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={r.row} activeOpacity={0.75} accessibilityRole="button">
      <Text style={r.label}>{label}</Text>
      <Text style={r.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const r = StyleSheet.create({
  row:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border },
  label:  { fontFamily: T.body,    fontSize: 14, color: T.cream  },
  value:  { fontFamily: T.bodyMed, fontSize: 14, color: T.white  },
  chevron:{ fontFamily: T.bodyMed, fontSize: 20, color: T.faint, lineHeight: 22 },
});

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: T.bgDeep },
  scroll: { paddingHorizontal: 20, paddingBottom: 100 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 24, marginBottom: 18 },
  heading:{ fontFamily: T.display, fontSize: 32, color: T.white },
  settingsBtn:{ width: 44, height: 44, borderRadius: 22, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  settingsIco:{ fontSize: 18, color: T.muted },

  identityCard: { padding: 20, marginBottom: 14 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: T.sageSoft, borderWidth: 2, borderColor: `${T.sage}40`,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarTxt: { fontFamily: T.display,  fontSize: 24, color: T.sage },
  identity:  { flex: 1 },
  name:  { fontFamily: T.bodyMed, fontSize: 17, color: T.white, marginBottom: 2 },
  email: { fontFamily: T.body,    fontSize: 13, color: T.muted  },
  meta:  { fontFamily: T.bodyLight,fontSize: 12, color: T.faint, marginTop: 2 },

  sec:     { padding: 20, marginBottom: 14 },
  secTitle:{ fontFamily: T.bodySemi, fontSize: 11, color: T.sage, letterSpacing: 1.2, marginBottom: 14 },

  subActive: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  subDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: T.sage },
  subPlan: { fontFamily: T.bodyMed, fontSize: 15, color: T.white },
  subExpiry:{ fontFamily: T.body, fontSize: 12, color: T.muted, marginBottom: 12 },
  manageBtn:{ paddingVertical: 4 },
  manageTxt:{ fontFamily: T.bodyMed, fontSize: 13, color: T.lavender },

  noSub:    { fontFamily: T.body, fontSize: 14, color: T.muted, marginBottom: 14 },
  upgradeBtn:{ backgroundColor: T.sage, borderRadius: T.rm, paddingVertical: 12, alignItems: 'center' },
  upgradeTxt:{ fontFamily: T.bodyMed, fontSize: 14, color: T.bgDeep },

  disclaimer:{ fontFamily: T.bodyLight, fontSize: 11, color: T.faint, textAlign: 'center', lineHeight: 18, marginTop: 8 },
});
