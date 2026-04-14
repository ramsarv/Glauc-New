/**
 * ResultsScreen v2 — New palette + Eden-style card layout.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Share, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { T, RISK_COLORS } from '../constants/theme';
import Card from '../components/Card';
import RiskBadge from '../components/RiskBadge';
import AnimatedNumber from '../components/AnimatedNumber';
import { apiGetExplanation } from '../services/api';

const POLL_MS  = 4_000;
const MAX_POLL = 30;

export default function ResultsScreen({ route, navigation }) {
  const { result } = route.params;

  const [explanation, setExplanation] = useState(result.explanation || null);
  const [explLoading, setExplLoading] = useState(!result.explanation && !!result.job_id);
  const [explError,   setExplError]   = useState(null);

  const pollCount = useRef(0);
  const pollTimer = useRef(null);

  const riskLevel = result.risk_level?.toLowerCase() || 'low';
  const riskColor = RISK_COLORS[riskLevel] || T.sage;

  const deltaAge = result.predicted_age != null && result.chronological_age != null
    ? +(result.predicted_age - result.chronological_age).toFixed(1) : null;
  const deltaLabel = deltaAge == null ? '—'
    : deltaAge > 0  ? `+${deltaAge} yrs older`
    : deltaAge < 0  ? `${Math.abs(deltaAge)} yrs younger`
    : 'On track';

  useEffect(() => {
    if (!result.job_id || result.explanation) return;
    let cancelled = false;
    async function poll() {
      if (cancelled || pollCount.current >= MAX_POLL) {
        setExplLoading(false);
        if (!cancelled) setExplError('Report generation timed out.');
        return;
      }
      pollCount.current++;
      try {
        const data = await apiGetExplanation(result.job_id);
        if (data.status === 'done' && data.explanation) {
          if (!cancelled) { setExplanation(data.explanation); setExplLoading(false); }
        } else if (data.status === 'error') {
          if (!cancelled) { setExplError('Report generation failed.'); setExplLoading(false); }
        } else {
          pollTimer.current = setTimeout(poll, POLL_MS);
        }
      } catch {
        if (!cancelled && pollCount.current < MAX_POLL)
          pollTimer.current = setTimeout(poll, POLL_MS);
        else if (!cancelled) { setExplLoading(false); setExplError('Could not retrieve report.'); }
      }
    }
    pollTimer.current = setTimeout(poll, POLL_MS);
    return () => { cancelled = true; clearTimeout(pollTimer.current); };
  }, [result.job_id]);

  const handleShare = useCallback(async () => {
    const msg = [
      'Glauc Ocular Analysis',
      `Date: ${new Date(result.timestamp || Date.now()).toLocaleDateString()}`,
      `Predicted Ocular Age: ${result.predicted_age?.toFixed(1)} yrs`,
      `Chronological Age: ${result.chronological_age} yrs`,
      `Risk: ${riskLevel.toUpperCase()}`,
      explanation ? `\nClinical Report:\n${explanation}` : '',
      '\nFor wellness use only. Not a medical device.',
    ].join('\n');
    await Share.share({ message: msg });
  }, [result, explanation, riskLevel]);

  const confidence = result.confidence != null ? `${(result.confidence * 100).toFixed(0)}%` : null;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <LinearGradient colors={[`${riskColor}10`, T.bgDeep]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.4 }} style={StyleSheet.absoluteFill} />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.navigate('MainTabs')} style={s.backBtn} accessibilityRole="button">
            <Text style={s.backTxt}>← Done</Text>
          </TouchableOpacity>
          <Text style={s.date}>
            {new Date(result.timestamp || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </Text>
        </View>
        <Text style={s.heading}>Your Results</Text>

        {/* Age card */}
        <View style={[s.ageCard, { borderColor: `${riskColor}40` }]}>
          <LinearGradient colors={[`${riskColor}12`, T.surface]} style={[StyleSheet.absoluteFill, { borderRadius: T.rl }]} />
          <Text style={s.ageLabel}>Predicted Ocular Age</Text>
          {result.predicted_age != null ? (
            <AnimatedNumber value={result.predicted_age} suffix=" yrs" decimals={1} style={s.ageVal} />
          ) : <Text style={s.ageVal}>—</Text>}
          {deltaAge != null && (
            <View style={[s.deltaBadge, { backgroundColor: `${riskColor}18` }]}>
              <Text style={[s.deltaTxt, { color: riskColor }]}>{deltaLabel}</Text>
            </View>
          )}
          {confidence && <Text style={s.confidence}>Model confidence: {confidence}</Text>}
        </View>

        {/* Risk */}
        <Card style={s.sec}>
          <Text style={s.secTitle}>Overall Risk</Text>
          <View style={[s.riskPill, { backgroundColor: `${riskColor}18` }]}>
            <View style={[s.riskDot, { backgroundColor: riskColor }]} />
            <Text style={[s.riskTxt, { color: riskColor }]}>
              {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} Risk
            </Text>
          </View>
        </Card>

        {/* Risk breakdown */}
        {result.risk_scores && Object.keys(result.risk_scores).length > 0 && (
          <Card style={s.sec}>
            <Text style={s.secTitle}>Risk Breakdown</Text>
            {Object.entries(result.risk_scores).map(([key, val]) => (
              <RiskBadge
                key={key}
                label={key.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
                score={val.score ?? val}
                level={(val.level ?? (val.score ?? val) < 0.33 ? 'low' : (val.score ?? val) < 0.66 ? 'moderate' : 'elevated').toLowerCase()}
              />
            ))}
          </Card>
        )}

        {/* Uncertainty */}
        {result.uncertainty != null && (
          <Card style={s.sec}>
            <Text style={s.secTitle}>Measurement Uncertainty</Text>
            <Text style={s.secBody}>±{result.uncertainty.toFixed(2)} years (95% CI · 30 MC passes)</Text>
          </Card>
        )}

        {/* Clinical report */}
        <Card style={s.sec}>
          <Text style={s.secTitle}>Clinical Report</Text>
          {explLoading ? (
            <View style={s.explLoading}>
              <ActivityIndicator color={T.lavender} size="small" />
              <Text style={s.explLoadingTxt}>Generating AI clinical report…</Text>
            </View>
          ) : explError ? (
            <Text style={s.explErr}>{explError}</Text>
          ) : explanation ? (
            <Text style={s.explTxt}>{explanation}</Text>
          ) : (
            <Text style={s.explEmpty}>No report available for this scan.</Text>
          )}
        </Card>

        <Text style={s.disclaimer}>
          For wellness use only — not a medical device.{'\n'}
          Consult an ophthalmologist for clinical assessment.
        </Text>

        {/* Actions */}
        <View style={s.actions}>
          <TouchableOpacity onPress={handleShare} style={s.shareBtn} accessibilityRole="button">
            <Text style={s.shareTxt}>Share Results</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Scan')} style={s.newScanBtn} accessibilityRole="button">
            <Text style={s.newScanTxt}>New Scan</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: T.bgDeep },
  scroll: { paddingHorizontal: 20, paddingBottom: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, marginBottom: 4 },
  backBtn:{ paddingVertical: 8, paddingRight: 12 },
  backTxt:{ fontFamily: T.bodyMed, fontSize: 14, color: T.sage },
  date:   { fontFamily: T.body, fontSize: 12, color: T.muted },
  heading:{ fontFamily: T.display, fontSize: 34, color: T.white, marginBottom: 20 },

  ageCard: {
    alignItems: 'center', padding: 32, borderRadius: T.rl,
    borderWidth: 1.5, marginBottom: 14, overflow: 'hidden',
  },
  ageLabel: { fontFamily: T.bodyMed, fontSize: 13, color: T.muted, letterSpacing: 0.5, marginBottom: 10 },
  ageVal:   { fontFamily: T.display, fontSize: 56, color: T.white },
  deltaBadge:{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, marginTop: 10 },
  deltaTxt:  { fontFamily: T.bodySemi, fontSize: 13 },
  confidence:{ fontFamily: T.bodyLight, fontSize: 11, color: T.faint, marginTop: 10 },

  sec:      { padding: 20, marginBottom: 14 },
  secTitle: { fontFamily: T.bodySemi, fontSize: 11, color: T.sage, letterSpacing: 1.2, marginBottom: 14 },
  secBody:  { fontFamily: T.body, fontSize: 14, color: T.cream, lineHeight: 22 },

  riskPill: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderRadius: T.r },
  riskDot:  { width: 10, height: 10, borderRadius: 5 },
  riskTxt:  { fontFamily: T.bodySemi, fontSize: 16 },

  explLoading:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  explLoadingTxt:{ fontFamily: T.body, fontSize: 13, color: T.muted },
  explErr:   { fontFamily: T.body, fontSize: 13, color: T.error },
  explTxt:   { fontFamily: T.body, fontSize: 14, color: T.cream, lineHeight: 24 },
  explEmpty: { fontFamily: T.body, fontSize: 13, color: T.faint },

  disclaimer:{ fontFamily: T.bodyLight, fontSize: 11, color: T.faint, textAlign: 'center', lineHeight: 18, marginVertical: 14 },

  actions:   { gap: 12, marginTop: 4 },
  shareBtn:  { backgroundColor: T.sage, borderRadius: T.rm, paddingVertical: 15, alignItems: 'center' },
  shareTxt:  { fontFamily: T.bodyMed, fontSize: 15, color: T.bgDeep },
  newScanBtn:{ borderWidth: 1, borderColor: T.borderHi, borderRadius: T.rm, paddingVertical: 14, alignItems: 'center' },
  newScanTxt:{ fontFamily: T.bodyMed, fontSize: 15, color: T.cream },
});
