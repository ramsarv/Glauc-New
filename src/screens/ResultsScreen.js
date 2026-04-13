/**
 * ResultsScreen — Displays full prediction results and polls for AI explanation.
 * Route params: { result: API response object }
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
import GhostButton from '../components/GhostButton';
import { apiGetExplanation } from '../services/api';

const POLL_INTERVAL_MS = 4_000;
const MAX_POLLS        = 30; // 2 minutes max

export default function ResultsScreen({ route, navigation }) {
  const { result } = route.params;

  const [explanation,   setExplanation]   = useState(result.explanation || null);
  const [explLoading,   setExplLoading]   = useState(!result.explanation && !!result.job_id);
  const [explError,     setExplError]     = useState(null);

  const pollCount = useRef(0);
  const pollTimer = useRef(null);

  // ── Risk level helper ───────────────────────────────────────
  const riskLevel = result.risk_level?.toLowerCase() || 'low';
  const riskColor = RISK_COLORS[riskLevel] || T.teal;

  // ── Age delta display ───────────────────────────────────────
  const deltaAge   = result.predicted_age != null && result.chronological_age != null
    ? +(result.predicted_age - result.chronological_age).toFixed(1)
    : null;
  const deltaLabel = deltaAge == null
    ? '—'
    : deltaAge > 0
      ? `+${deltaAge} yrs older`
      : deltaAge < 0
        ? `${Math.abs(deltaAge)} yrs younger`
        : 'On track';

  // ── Poll for explanation ────────────────────────────────────
  useEffect(() => {
    if (!result.job_id || result.explanation) return;

    let cancelled = false;

    async function poll() {
      if (cancelled || pollCount.current >= MAX_POLLS) {
        setExplLoading(false);
        if (!cancelled) setExplError('Report generation timed out.');
        return;
      }
      pollCount.current++;
      try {
        const data = await apiGetExplanation(result.job_id);
        if (data.status === 'done' && data.explanation) {
          if (!cancelled) {
            setExplanation(data.explanation);
            setExplLoading(false);
          }
        } else if (data.status === 'error') {
          if (!cancelled) {
            setExplError('Clinical report generation failed.');
            setExplLoading(false);
          }
        } else {
          pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
        if (!cancelled && pollCount.current < MAX_POLLS) {
          pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS);
        } else if (!cancelled) {
          setExplLoading(false);
          setExplError('Could not retrieve clinical report.');
        }
      }
    }

    pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(pollTimer.current);
    };
  }, [result.job_id]);

  const handleShare = useCallback(async () => {
    const msg = [
      `Glauc Ocular Analysis`,
      `Date: ${new Date(result.timestamp || Date.now()).toLocaleDateString()}`,
      `Predicted Ocular Age: ${result.predicted_age?.toFixed(1)} yrs`,
      `Chronological Age: ${result.chronological_age} yrs`,
      `Risk Level: ${riskLevel.toUpperCase()}`,
      explanation ? `\nClinical Report:\n${explanation}` : '',
      `\nFor wellness use only. Not a medical device.`,
    ].join('\n');
    await Share.share({ message: msg });
  }, [result, explanation, riskLevel]);

  const handleNewScan = useCallback(() => {
    navigation.navigate('Scan');
  }, [navigation]);

  // Confidence percentage
  const confidence = result.confidence != null
    ? `${(result.confidence * 100).toFixed(0)}%`
    : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <LinearGradient
        colors={[`${riskColor}12`, T.obsidian]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.heading}>Your Results</Text>
          <Text style={styles.date}>
            {new Date(result.timestamp || Date.now()).toLocaleDateString('en-US', {
              month: 'long', day: 'numeric', year: 'numeric',
            })}
          </Text>
        </View>

        {/* ── Ocular Age Card ──────────────────────────────── */}
        <Card glow style={styles.ageCard}>
          <Text style={styles.ageLabel}>Predicted Ocular Age</Text>
          {result.predicted_age != null ? (
            <AnimatedNumber
              value={result.predicted_age}
              suffix=" yrs"
              decimals={1}
              style={styles.ageValue}
            />
          ) : (
            <Text style={styles.ageValue}>—</Text>
          )}
          {deltaAge != null && (
            <View style={[styles.deltaBadge, { backgroundColor: `${riskColor}20` }]}>
              <Text style={[styles.deltaText, { color: riskColor }]}>{deltaLabel}</Text>
            </View>
          )}
          {confidence && (
            <Text style={styles.confidence}>Model confidence: {confidence}</Text>
          )}
        </Card>

        {/* ── Risk Level Card ──────────────────────────────── */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Overall Risk</Text>
          <View style={[styles.riskRow, { backgroundColor: `${riskColor}15` }]}>
            <View style={[styles.riskDot, { backgroundColor: riskColor }]} />
            <Text style={[styles.riskLabel, { color: riskColor }]}>
              {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} Risk
            </Text>
          </View>
        </Card>

        {/* ── Risk Breakdown ───────────────────────────────── */}
        {result.risk_scores && Object.keys(result.risk_scores).length > 0 && (
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Risk Breakdown</Text>
            {Object.entries(result.risk_scores).map(([key, val]) => (
              <RiskBadge
                key={key}
                label={formatRiskKey(key)}
                score={val.score ?? val}
                level={(val.level ?? scoreToLevel(val.score ?? val)).toLowerCase()}
              />
            ))}
          </Card>
        )}

        {/* ── Uncertainty ──────────────────────────────────── */}
        {result.uncertainty != null && (
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Measurement Uncertainty</Text>
            <Text style={styles.uncertaintyText}>
              ±{result.uncertainty.toFixed(2)} years (95% CI from 30 Monte Carlo passes)
            </Text>
          </Card>
        )}

        {/* ── Clinical Report ──────────────────────────────── */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Clinical Report</Text>
          {explLoading ? (
            <View style={styles.explLoading}>
              <ActivityIndicator color={T.amber} size="small" />
              <Text style={styles.explLoadingText}>Generating AI report…</Text>
            </View>
          ) : explError ? (
            <Text style={styles.explError}>{explError}</Text>
          ) : explanation ? (
            <Text style={styles.explText}>{explanation}</Text>
          ) : (
            <Text style={styles.explEmpty}>No report available for this scan.</Text>
          )}
        </Card>

        {/* ── Disclaimer ───────────────────────────────────── */}
        <Text style={styles.disclaimer}>
          For wellness use only. Not a medical device.{'\n'}
          Consult an ophthalmologist for clinical assessment.
        </Text>

        {/* ── Actions ─────────────────────────────────────── */}
        <View style={styles.actions}>
          <TouchableOpacity onPress={handleShare} style={styles.shareBtn} accessibilityLabel="Share results">
            <Text style={styles.shareBtnText}>Share Results</Text>
          </TouchableOpacity>
          <GhostButton onPress={handleNewScan}>New Scan</GhostButton>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Helpers ───────────────────────────────────────────────────
function formatRiskKey(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function scoreToLevel(score) {
  if (score == null) return 'low';
  if (score < 0.33)  return 'low';
  if (score < 0.66)  return 'moderate';
  return 'elevated';
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: T.obsidian },
  scroll: { paddingHorizontal: 20, paddingBottom: 48 },

  header: { paddingTop: 20, paddingBottom: 8 },
  heading: {
    fontFamily: T.display,
    fontSize: 30,
    color: T.cream,
  },
  date: {
    fontFamily: T.body,
    fontSize: 13,
    color: T.creamLow,
    marginTop: 4,
  },

  ageCard: {
    alignItems: 'center',
    padding: 28,
    marginTop: 16,
    marginBottom: 12,
  },
  ageLabel: {
    fontFamily: T.bodyMed,
    fontSize: 13,
    color: T.creamMid,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  ageValue: {
    fontFamily: T.displayBold,
    fontSize: 52,
    color: T.cream,
  },
  deltaBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 10,
  },
  deltaText: {
    fontFamily: T.bodySemi,
    fontSize: 13,
  },
  confidence: {
    fontFamily: T.bodyLight,
    fontSize: 11,
    color: T.creamLow,
    marginTop: 10,
  },

  section: { padding: 20, marginBottom: 12 },
  sectionTitle: {
    fontFamily: T.bodyMed,
    fontSize: 13,
    color: T.creamMid,
    letterSpacing: 0.5,
    marginBottom: 14,
  },

  riskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: T.r,
  },
  riskDot: { width: 10, height: 10, borderRadius: 5 },
  riskLabel: {
    fontFamily: T.bodySemi,
    fontSize: 16,
  },

  uncertaintyText: {
    fontFamily: T.body,
    fontSize: 14,
    color: T.creamMid,
    lineHeight: 22,
  },

  explLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  explLoadingText: {
    fontFamily: T.body,
    fontSize: 13,
    color: T.creamMid,
  },
  explError: {
    fontFamily: T.body,
    fontSize: 13,
    color: T.red,
  },
  explText: {
    fontFamily: T.body,
    fontSize: 14,
    color: T.cream,
    lineHeight: 24,
  },
  explEmpty: {
    fontFamily: T.body,
    fontSize: 13,
    color: T.creamLow,
  },

  disclaimer: {
    fontFamily: T.bodyLight,
    fontSize: 11,
    color: T.creamLow,
    textAlign: 'center',
    lineHeight: 18,
    marginVertical: 12,
  },

  actions: { gap: 12, marginTop: 8 },
  shareBtn: {
    backgroundColor: T.amber,
    borderRadius: T.rm,
    paddingVertical: 16,
    alignItems: 'center',
  },
  shareBtnText: {
    fontFamily: T.bodyMed,
    fontSize: 15,
    color: T.obsidian,
  },
});
