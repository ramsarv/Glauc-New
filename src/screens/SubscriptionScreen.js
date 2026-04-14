/**
 * SubscriptionScreen — Xefag-inspired plan selector + Stripe PaymentSheet.
 * 4 plans: Single Once ($19), Comprehensive Once ($29),
 *          Weekly Single ($6/wk), Weekly Comprehensive ($9/wk)
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useStripe } from '@stripe/stripe-react-native';
import Svg, { Polyline, Path } from 'react-native-svg';
import { T, PLANS } from '../constants/theme';
import { apiCreatePaymentIntent, apiActivateSubscription, apiGetSubscription } from '../services/api';

export default function SubscriptionScreen({ navigation, route }) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [tab,      setTab]      = useState('once');    // 'once' | 'weekly'
  const [selected, setSelected] = useState('comprehensive_once');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  const visiblePlans = PLANS.filter(p => p.type === tab);
  const plan         = PLANS.find(p => p.id === selected);

  // When tab changes, default-select the first plan of that tab
  useEffect(() => {
    const defaultPlan = PLANS.find(p => p.type === tab && !p.badge) || PLANS.find(p => p.type === tab);
    if (defaultPlan) setSelected(defaultPlan.id);
  }, [tab]);

  const handleSubscribe = useCallback(async () => {
    if (!plan) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Create payment intent on server
      const { clientSecret, paymentIntentId } = await apiCreatePaymentIntent(plan.id);

      // 2. Init Stripe Payment Sheet
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        merchantDisplayName: 'Glauc Health',
        style: 'alwaysDark',
        appearance: {
          colors: {
            primary:          T.sage,
            background:       T.surface,
            componentBackground: T.surfaceHi,
            componentBorder:  T.border,
            componentDivider: T.border,
            primaryText:      T.white,
            secondaryText:    T.muted,
            placeholderText:  T.faint,
            icon:             T.lavender,
            error:            T.error,
          },
          shapes: { borderRadius: T.rm },
        },
        googlePay: {
          merchantCountryCode: 'US',
          testEnv: __DEV__,
        },
        applePay: {
          merchantCountryCode: 'US',
        },
      });

      if (initError) throw new Error(initError.message);

      // 3. Present payment sheet
      const { error: payError } = await presentPaymentSheet();
      if (payError) {
        if (payError.code !== 'Canceled') throw new Error(payError.message);
        setLoading(false);
        return;
      }

      // 4. Activate on server
      await apiActivateSubscription(paymentIntentId, plan.id);

      // 5. Navigate into app
      navigation.replace('MainTabs');
    } catch (err) {
      setError(err.message || 'Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [plan, initPaymentSheet, presentPaymentSheet, navigation]);

  const handleRestore = useCallback(async () => {
    setLoading(true);
    try {
      const sub = await apiGetSubscription();
      if (sub?.status === 'active') {
        navigation.replace('MainTabs');
      } else {
        Alert.alert('No Active Subscription', 'We could not find an active subscription for this account.');
      }
    } catch {
      Alert.alert('Error', 'Could not check subscription status.');
    } finally {
      setLoading(false);
    }
  }, [navigation]);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <LinearGradient colors={[T.bgDeep, T.bg]} style={StyleSheet.absoluteFill} />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.eyebrow}>Ocular Health Intelligence</Text>
          <Text style={s.headline}>Choose Your{'\n'}Analysis Plan</Text>
          <Text style={s.subhead}>
            Professional-grade retinal AI. No clinic visit required.
          </Text>
        </View>

        {/* Social proof strip */}
        <View style={s.proofRow}>
          <ProofChip icon="★" label="4.8 Rating" />
          <ProofChip icon="◉" label="12,847 Analyses" />
          <ProofChip icon="✓" label="HIPAA Safe" />
        </View>

        {/* Tab toggle */}
        <View style={s.tabs}>
          <TabBtn label="One-Time" value="once"   active={tab === 'once'}   onPress={() => setTab('once')} />
          <TabBtn label="Weekly"   value="weekly" active={tab === 'weekly'} onPress={() => setTab('weekly')} />
        </View>

        {tab === 'weekly' && (
          <Text style={s.tabSub}>Billed monthly · Cancel anytime</Text>
        )}

        {/* Plan cards */}
        <View style={s.plans}>
          {visiblePlans.map(p => (
            <PlanCard
              key={p.id}
              plan={p}
              selected={selected === p.id}
              onPress={() => setSelected(p.id)}
            />
          ))}
        </View>

        {/* Selected plan summary */}
        {plan && (
          <View style={s.summary}>
            <Text style={s.summaryLabel}>Selected:</Text>
            <Text style={s.summaryValue}>
              {plan.label} — {plan.priceLabel}{plan.priceSub ? plan.priceSub : ''}
            </Text>
          </View>
        )}

        {error ? (
          <View style={s.errBox}><Text style={s.errTxt}>{error}</Text></View>
        ) : null}

        {/* CTA */}
        <TouchableOpacity
          onPress={handleSubscribe}
          style={[s.cta, loading && s.ctaOff]}
          disabled={loading || !plan}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          {loading ? (
            <ActivityIndicator color={T.bgDeep} size="small" />
          ) : (
            <Text style={s.ctaTxt}>
              {tab === 'weekly' ? 'Start Subscription' : 'Purchase Analysis'}
            </Text>
          )}
        </TouchableOpacity>

        {Platform.OS === 'ios' && (
          <View style={s.applePayNote}>
            <Text style={s.applePayTxt}>Apple Pay · Google Pay · Credit Card accepted</Text>
          </View>
        )}

        {/* Restore purchases */}
        <TouchableOpacity onPress={handleRestore} style={s.restoreBtn} accessibilityRole="button">
          <Text style={s.restoreTxt}>Restore Purchases</Text>
        </TouchableOpacity>

        {/* Guarantee strip */}
        <View style={s.guarantee}>
          <Text style={s.guaranteeIcon}>🛡</Text>
          <Text style={s.guaranteeTxt}>
            Secure payment via Stripe. Your card is never stored by Glauc.
            Weekly plans can be cancelled at any time in Settings.
          </Text>
        </View>

        <Text style={s.disclaimer}>
          For wellness use only — not a medical device.{'\n'}
          Results are informational and do not constitute medical advice.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Plan card ─────────────────────────────────────────────────
function PlanCard({ plan, selected, onPress }) {
  const borderColor = selected ? T.sage    : T.border;
  const bgColor     = selected ? T.sageSoft : T.surface;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={[s.planCard, { borderColor, backgroundColor: bgColor }]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      {plan.badge && (
        <View style={[s.badge, { backgroundColor: plan.badge === 'Best Value' ? T.purpleSoft : T.lavenderSoft }]}>
          <Text style={[s.badgeTxt, { color: plan.badge === 'Best Value' ? T.lavenderHi : T.lavender }]}>
            {plan.badge}
          </Text>
        </View>
      )}

      <View style={s.planTop}>
        <View style={s.planLeft}>
          <View style={[s.radioOuter, selected && s.radioOuterOn]}>
            {selected && <View style={s.radioInner} />}
          </View>
          <View>
            <Text style={s.planLabel}>{plan.label}</Text>
            <Text style={s.planDesc}>{plan.description}</Text>
          </View>
        </View>
        <View style={s.priceWrap}>
          <Text style={[s.planPrice, selected && { color: T.sage }]}>{plan.priceLabel}</Text>
          {plan.priceSub && <Text style={s.planPriceSub}>{plan.priceSub}</Text>}
        </View>
      </View>

      <View style={s.features}>
        {plan.features.map((f, i) => (
          <View key={i} style={s.feature}>
            <Text style={[s.featureCheck, selected && { color: T.sage }]}>✓</Text>
            <Text style={s.featureTxt}>{f}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
}

function TabBtn({ label, value, active, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[s.tab, active && s.tabOn]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Text style={[s.tabTxt, active && s.tabTxtOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ProofChip({ icon, label }) {
  return (
    <View style={s.chip}>
      <Text style={s.chipIcon}>{icon}</Text>
      <Text style={s.chipTxt}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: T.bgDeep },
  scroll: { paddingHorizontal: 22, paddingBottom: 48 },

  header:   { paddingTop: 36, marginBottom: 20 },
  eyebrow:  { fontFamily: T.bodySemi, fontSize: 11, color: T.sage, letterSpacing: 1.5, marginBottom: 8 },
  headline: { fontFamily: T.display,  fontSize: 36, color: T.white, lineHeight: 44, marginBottom: 10 },
  subhead:  { fontFamily: T.body, fontSize: 14, color: T.cream, lineHeight: 22 },

  proofRow: { flexDirection: 'row', gap: 8, marginBottom: 24, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: T.surface, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: T.border,
  },
  chipIcon: { fontSize: 12, color: '#F6C94E' },
  chipTxt:  { fontFamily: T.body, fontSize: 12, color: T.muted },

  tabs: {
    flexDirection: 'row', backgroundColor: T.surface,
    borderRadius: T.rm, borderWidth: 1, borderColor: T.border,
    overflow: 'hidden', marginBottom: 8,
  },
  tab:    { flex: 1, paddingVertical: 13, alignItems: 'center' },
  tabOn:  { backgroundColor: T.sageSoft },
  tabTxt: { fontFamily: T.body,    fontSize: 14, color: T.muted },
  tabTxtOn:{ fontFamily: T.bodyMed, fontSize: 14, color: T.sage },
  tabSub: { fontFamily: T.body, fontSize: 12, color: T.muted, textAlign: 'center', marginBottom: 20 },

  plans: { gap: 14, marginBottom: 20 },
  planCard: {
    borderRadius: T.rm, borderWidth: 1.5, padding: 18,
    position: 'relative', overflow: 'hidden',
  },
  badge: {
    position: 'absolute', top: 12, right: 12,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  badgeTxt: { fontFamily: T.bodySemi, fontSize: 11, letterSpacing: 0.3 },
  planTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  planLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flex: 1 },
  radioOuter: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: T.border,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  radioOuterOn: { borderColor: T.sage },
  radioInner:   { width: 10, height: 10, borderRadius: 5, backgroundColor: T.sage },
  planLabel:    { fontFamily: T.bodyMed, fontSize: 16, color: T.white, marginBottom: 2 },
  planDesc:     { fontFamily: T.body,    fontSize: 13, color: T.muted,  lineHeight: 18 },
  priceWrap:    { alignItems: 'flex-end', marginLeft: 8 },
  planPrice:    { fontFamily: T.display,  fontSize: 28, color: T.white },
  planPriceSub: { fontFamily: T.body,     fontSize: 11, color: T.muted  },

  features: { gap: 7 },
  feature:  { flexDirection: 'row', gap: 8, alignItems: 'center' },
  featureCheck: { fontFamily: T.bodyMed, fontSize: 13, color: T.muted, width: 16 },
  featureTxt:   { fontFamily: T.body,    fontSize: 13, color: T.cream },

  summary: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
    backgroundColor: T.sageSoft, borderRadius: T.r,
    borderWidth: 1, borderColor: T.borderSage,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16,
  },
  summaryLabel: { fontFamily: T.body,    fontSize: 13, color: T.muted },
  summaryValue: { fontFamily: T.bodyMed, fontSize: 13, color: T.sage, flex: 1 },

  errBox: {
    backgroundColor: T.errorSoft, borderRadius: T.r,
    borderWidth: 1, borderColor: `${T.error}25`,
    padding: 12, marginBottom: 16,
  },
  errTxt: { fontFamily: T.body, fontSize: 13, color: T.error },

  cta: {
    backgroundColor: T.sage, borderRadius: T.rxl,
    paddingVertical: 16, alignItems: 'center', marginBottom: 14,
  },
  ctaOff: { opacity: 0.5 },
  ctaTxt: { fontFamily: T.bodyMed, fontSize: 16, color: T.bgDeep },

  applePayNote: { alignItems: 'center', marginBottom: 4 },
  applePayTxt:  { fontFamily: T.body, fontSize: 12, color: T.faint },

  restoreBtn: { alignItems: 'center', paddingVertical: 12, marginBottom: 16 },
  restoreTxt: { fontFamily: T.body, fontSize: 13, color: T.lavender },

  guarantee: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: T.surface, borderRadius: T.rm,
    borderWidth: 1, borderColor: T.border,
    padding: 16, marginBottom: 16,
  },
  guaranteeIcon: { fontSize: 18 },
  guaranteeTxt:  { fontFamily: T.body, fontSize: 12, color: T.muted, lineHeight: 20, flex: 1 },

  disclaimer: {
    fontFamily: T.bodyLight, fontSize: 11, color: T.faint,
    textAlign: 'center', lineHeight: 18,
  },
});
