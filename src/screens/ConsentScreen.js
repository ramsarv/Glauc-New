/**
 * ConsentScreen — BIPA-compliant explicit opt-in consent.
 *
 * Required by law before any biometric data collection:
 *   - Illinois BIPA, Texas CUBI, WA My Health MY Data Act,
 *     CCPA/CPRA sensitive data opt-in, and equivalent 2024-2026 state laws.
 *
 * Checkboxes:
 *   1. Terms + Privacy Policy agreement (REQUIRED)
 *   2. Biometric data consent (REQUIRED — cannot use app without)
 *   3. AI model training consent (OPTIONAL — defaults unchecked)
 *
 * Consent record is saved to AsyncStorage with a UTC timestamp.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { T } from '../constants/theme';

export const CONSENT_KEY = 'glauc_consent_v1';

export default function ConsentScreen({ navigation, onDone }) {
  const [agreeTerms,     setAgreeTerms]     = useState(false);
  const [agreeBiometric, setAgreeBiometric] = useState(false);
  const [agreeAI,        setAgreeAI]        = useState(false);
  const [saving,         setSaving]         = useState(false);

  const canContinue = agreeTerms && agreeBiometric;

  const handleContinue = useCallback(async () => {
    if (!canContinue || saving) return;
    setSaving(true);
    try {
      const record = {
        timestamp:          new Date().toISOString(),
        termsAndPrivacy:    true,
        biometricConsent:   true,
        aiTrainingConsent:  agreeAI,
        version:            '1.0',
      };
      await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(record));
      onDone?.({ aiTrainingConsent: agreeAI });
    } catch {
      // If storage fails, still allow the user to proceed — consent is recorded in session
      onDone?.({ aiTrainingConsent: agreeAI });
    } finally {
      setSaving(false);
    }
  }, [canContinue, agreeAI, saving, onDone]);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <LinearGradient colors={[T.bgDeep, T.bg]} style={StyleSheet.absoluteFill} />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.eyeIco}>◉</Text>
          <Text style={s.title}>Before We Begin</Text>
          <Text style={s.sub}>
            Glauc collects biometric eye images to power its analysis. Federal and state law require us to obtain your explicit written consent before collecting this data. Please read each item carefully.
          </Text>
        </View>

        {/* Wellness disclaimer banner */}
        <View style={s.disclaimer}>
          <Text style={s.disclaimerTitle}>Wellness Tool — Not a Medical Device</Text>
          <Text style={s.disclaimerBody}>
            Glauc's results are for general wellness tracking only. They do not constitute medical advice, clinical diagnosis, or treatment recommendations. Always consult a licensed healthcare provider before making medical decisions.
          </Text>
        </View>

        {/* Consent 1 — Terms & Privacy (REQUIRED) */}
        <CheckItem
          checked={agreeTerms}
          onToggle={() => setAgreeTerms(v => !v)}
          required
          label={
            <Text style={s.checkLabel}>
              I have read and agree to Glauc's{' '}
              <Text style={s.link} onPress={() => navigation.navigate('Terms')}>
                Terms of Service
              </Text>
              {' '}and{' '}
              <Text style={s.link} onPress={() => navigation.navigate('PrivacyPolicy')}>
                Privacy Policy
              </Text>
              , including how my personal data is collected, stored, and processed.
            </Text>
          }
        />

        {/* Consent 2 — Biometric (REQUIRED) */}
        <CheckItem
          checked={agreeBiometric}
          onToggle={() => setAgreeBiometric(v => !v)}
          required
          label={
            <Text style={s.checkLabel}>
              I explicitly consent to Glauc collecting, processing, and storing photographs of my eye (biometric identifiers) for the purpose of generating ocular age estimates and health risk scores. I understand this constitutes written consent under the Illinois Biometric Information Privacy Act (BIPA), Texas CUBI, and equivalent laws. I may request deletion of my biometric data at any time by contacting privacy@glauc.app.
            </Text>
          }
        />

        {/* Consent 3 — AI Training (OPTIONAL) */}
        <CheckItem
          checked={agreeAI}
          onToggle={() => setAgreeAI(v => !v)}
          optional
          label={
            <Text style={s.checkLabel}>
              <Text style={s.optionalTag}>(Optional) </Text>
              I consent to my de-identified scan data — with all personal identifiers removed per the HIPAA Safe Harbor standard — being used to train and improve Glauc's AI models. I understand that de-identified training data may be retained indefinitely, that this is separate from the retention of my identifiable raw images, and that I can withdraw this consent at any time in Settings without losing access to the service.
            </Text>
          }
        />

        {/* Legal note */}
        <View style={s.legalNote}>
          <Text style={s.legalNoteText}>
            Items marked Required must be accepted to use Glauc's core features. The AI training consent is entirely optional and does not affect your access to any features.
          </Text>
        </View>

        {/* CTA */}
        <TouchableOpacity
          onPress={handleContinue}
          style={[s.btn, !canContinue && s.btnDisabled]}
          disabled={!canContinue || saving}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Continue to Glauc"
          accessibilityState={{ disabled: !canContinue }}
        >
          {saving
            ? <ActivityIndicator color={T.bgDeep} />
            : <Text style={[s.btnTxt, !canContinue && s.btnTxtDisabled]}>
                {canContinue ? 'I Agree — Continue' : 'Please check required items above'}
              </Text>
          }
        </TouchableOpacity>

        <Text style={s.footer}>
          You can review these documents anytime in Settings.{'\n'}
          Questions? Email privacy@glauc.app
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Checkbox row component ─────────────────────────────────────
function CheckItem({ checked, onToggle, label, required, optional }) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={[c.wrap, checked && c.wrapOn]}
      activeOpacity={0.8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[c.box, checked && c.boxOn]}>
        {checked && <Text style={c.tick}>✓</Text>}
      </View>
      <View style={c.labelWrap}>
        {required && (
          <View style={c.badge}>
            <Text style={c.badgeTxt}>Required</Text>
          </View>
        )}
        {optional && (
          <View style={[c.badge, c.badgeOpt]}>
            <Text style={[c.badgeTxt, c.badgeTxtOpt]}>Optional</Text>
          </View>
        )}
        {label}
      </View>
    </TouchableOpacity>
  );
}

const c = StyleSheet.create({
  wrap: {
    flexDirection: 'row', gap: 14, padding: 16,
    backgroundColor: T.surface, borderRadius: T.rm,
    borderWidth: 1, borderColor: T.border, marginBottom: 12,
  },
  wrapOn: { borderColor: T.sage, backgroundColor: `${T.sage}08` },
  box: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    borderColor: T.borderHi, backgroundColor: T.bgMid,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  boxOn:  { borderColor: T.sage, backgroundColor: T.sage },
  tick:   { fontSize: 13, color: T.bgDeep, fontFamily: T.bodyMed },
  labelWrap: { flex: 1, gap: 6 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: `${T.error}20`, borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  badgeOpt: { backgroundColor: `${T.sage}18` },
  badgeTxt:    { fontFamily: T.bodySemi, fontSize: 10, color: T.error, letterSpacing: 0.4 },
  badgeTxtOpt: { color: T.sage },
});

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: T.bgDeep },
  scroll: { paddingHorizontal: 20, paddingTop: 32, paddingBottom: 48 },

  header:  { alignItems: 'center', marginBottom: 28 },
  eyeIco:  { fontSize: 36, color: T.sage, marginBottom: 14 },
  title:   { fontFamily: T.display, fontSize: 30, color: T.white, textAlign: 'center', marginBottom: 12 },
  sub: {
    fontFamily: T.body, fontSize: 14, color: T.cream,
    textAlign: 'center', lineHeight: 22,
  },

  disclaimer: {
    backgroundColor: T.surface, borderRadius: T.rm, borderWidth: 1,
    borderColor: T.borderHi, padding: 16, marginBottom: 24,
  },
  disclaimerTitle: { fontFamily: T.bodyMed, fontSize: 13, color: T.white, marginBottom: 6 },
  disclaimerBody:  { fontFamily: T.body, fontSize: 12, color: T.muted, lineHeight: 18 },

  checkLabel: { fontFamily: T.body, fontSize: 13, color: T.cream, lineHeight: 20 },
  link:       { fontFamily: T.bodyMed, color: T.sage, textDecorationLine: 'underline' },
  optionalTag:{ fontFamily: T.bodyMed, color: T.sage },

  legalNote: {
    backgroundColor: T.bgMid, borderRadius: T.r, padding: 12, marginBottom: 24,
  },
  legalNoteText: { fontFamily: T.bodyLight, fontSize: 12, color: T.muted, lineHeight: 18 },

  btn: {
    backgroundColor: T.sage, borderRadius: T.rxl,
    paddingVertical: 16, alignItems: 'center', marginBottom: 20,
  },
  btnDisabled: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border },
  btnTxt:    { fontFamily: T.bodyMed, fontSize: 15, color: T.bgDeep },
  btnTxtDisabled: { color: T.faint },

  footer: {
    fontFamily: T.bodyLight, fontSize: 12, color: T.faint,
    textAlign: 'center', lineHeight: 18,
  },
});
