/**
 * ProcessingScreen — Animated processing stages while the real API call runs.
 * Receives imageUri and metadata as route params.
 * Navigates to ResultsScreen on success or shows an error + back option.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { T } from '../constants/theme';
import IrisMotif from '../components/IrisMotif';
import { apiScan } from '../services/api';

const STAGES = [
  { label: 'Loading image…',              duration: 600  },
  { label: 'Extracting visual features…', duration: 1200 },
  { label: 'Running ocular age model…',   duration: 1400 },
  { label: 'Computing risk scores…',      duration: 1000 },
  { label: 'Generating report…',          duration: 800  },
];

export default function ProcessingScreen({ route, navigation }) {
  const { imageUri, metadata } = route.params;

  const [stageIndex, setStageIndex] = useState(0);
  const [error,      setError]      = useState(null);

  const pulseAnim   = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const stageLoop   = useRef(null);
  const apiDone     = useRef(false);
  const stageDone   = useRef(false);
  const resultRef   = useRef(null);

  // ── Iris pulse animation ────────────────────────────────────
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // ── Stage ticker ────────────────────────────────────────────
  useEffect(() => {
    let idx     = 0;
    let elapsed = 0;
    const totalStageTime = STAGES.reduce((a, s) => a + s.duration, 0);

    Animated.timing(progressAnim, {
      toValue: 1, duration: totalStageTime, useNativeDriver: false,
    }).start();

    function advance() {
      if (idx >= STAGES.length - 1) {
        stageDone.current = true;
        maybeNavigate();
        return;
      }
      elapsed += STAGES[idx].duration;
      idx++;
      setStageIndex(idx);
      stageLoop.current = setTimeout(advance, STAGES[idx].duration);
    }

    stageLoop.current = setTimeout(advance, STAGES[0].duration);
    return () => clearTimeout(stageLoop.current);
  }, []);

  // ── API call ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await apiScan(imageUri, metadata);
        if (!cancelled) {
          resultRef.current = result;
          apiDone.current   = true;
          maybeNavigate();
        }
      } catch (err) {
        if (!cancelled) {
          clearTimeout(stageLoop.current);
          setError(err.message);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Navigate only when BOTH stages done AND API done
  function maybeNavigate() {
    if (apiDone.current && stageDone.current && resultRef.current) {
      navigation.replace('Results', { result: resultRef.current });
    }
  }

  const handleRetry = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // ── Progress bar interpolation ──────────────────────────────
  const progressWidth = progressAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <LinearGradient
        colors={[T.obsidian, T.obsidian2, T.obsidian]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        {/* Pulsing iris */}
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <IrisMotif size={120} opacity={0.9} />
        </Animated.View>

        <Text style={styles.heading}>Analyzing Your Scan</Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Analysis Failed</Text>
            <Text style={styles.errorBody}>{error}</Text>
            <TouchableOpacity onPress={handleRetry} style={styles.retryBtn}>
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Stage list */}
            <View style={styles.stages}>
              {STAGES.map((s, i) => (
                <StageRow
                  key={i}
                  label={s.label}
                  status={
                    i < stageIndex  ? 'done'
                    : i === stageIndex ? 'active'
                    : 'pending'
                  }
                />
              ))}
            </View>

            {/* Progress bar */}
            <View style={styles.progressTrack}>
              <Animated.View
                style={[styles.progressFill, { width: progressWidth }]}
              />
            </View>

            <Text style={styles.subtext}>
              Using DINOv3 ViT-B/14 with Monte Carlo uncertainty quantification
            </Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function StageRow({ label, status }) {
  const color =
    status === 'done'   ? T.teal :
    status === 'active' ? T.amber :
    T.creamLow;

  const icon =
    status === 'done'   ? '✓' :
    status === 'active' ? '◉' :
    '○';

  return (
    <View style={stageStyles.row}>
      <Text style={[stageStyles.icon, { color }]}>{icon}</Text>
      <Text style={[stageStyles.label, { color }]}>{label}</Text>
    </View>
  );
}

const stageStyles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  icon:  { fontSize: 16, width: 20, textAlign: 'center' },
  label: { fontFamily: T.body, fontSize: 14 },
});

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: T.obsidian },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 24,
  },

  heading: {
    fontFamily: T.display,
    fontSize: 26,
    color: T.cream,
    textAlign: 'center',
  },

  stages: { width: '100%', gap: 2 },

  progressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: T.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: T.amber,
    borderRadius: 2,
  },

  subtext: {
    fontFamily: T.bodyLight,
    fontSize: 11,
    color: T.creamLow,
    textAlign: 'center',
  },

  errorBox: {
    backgroundColor: T.redSoft,
    borderRadius: T.rm,
    borderWidth: 1,
    borderColor: `${T.red}30`,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  errorTitle: {
    fontFamily: T.bodyMed,
    fontSize: 16,
    color: T.red,
  },
  errorBody: {
    fontFamily: T.body,
    fontSize: 14,
    color: T.creamMid,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: T.amber,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: T.rm,
  },
  retryText: {
    fontFamily: T.bodyMed,
    fontSize: 14,
    color: T.obsidian,
  },
});
