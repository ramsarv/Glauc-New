/**
 * ProcessingScreen v2 — New palette + animated stages.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Line } from 'react-native-svg';
import { T } from '../constants/theme';
import { apiScan } from '../services/api';

const STAGES = [
  { label: 'Loading image…',              duration: 700  },
  { label: 'Extracting visual features…', duration: 1300 },
  { label: 'Running ocular age model…',   duration: 1500 },
  { label: 'Computing risk scores…',      duration: 1000 },
  { label: 'Generating report…',          duration: 900  },
];

function IrisPulse({ pulse }) {
  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <Svg width={100} height={100} viewBox="0 0 100 100">
        <Circle cx="50" cy="50" r="46" stroke={T.sageDark} strokeWidth="1" fill="none" />
        <Circle cx="50" cy="50" r="32" stroke={T.sage}     strokeWidth="2" fill="none" />
        <Circle cx="50" cy="50" r="19" stroke={T.sage}     strokeWidth="1.5" fill={T.sageSoft} />
        <Circle cx="50" cy="50" r="8"  fill={T.sage} />
        <Circle cx="50" cy="50" r="3"  fill={T.bgDeep} />
        {[0,60,120,180,240,300].map((a, i) => {
          const rad = (a * Math.PI) / 180;
          const x1 = 50 + 20 * Math.cos(rad), y1 = 50 + 20 * Math.sin(rad);
          const x2 = 50 + 31 * Math.cos(rad), y2 = 50 + 31 * Math.sin(rad);
          return <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={T.sage} strokeWidth="1" opacity="0.4" />;
        })}
        <Circle cx="43" cy="45" r="4" fill={T.lavender} opacity="0.45" />
      </Svg>
    </Animated.View>
  );
}

export default function ProcessingScreen({ route, navigation }) {
  const { imageUri, metadata } = route.params;
  const [stageIdx, setStageIdx] = useState(0);
  const [error,    setError]    = useState(null);

  const pulse    = useRef(new Animated.Value(1)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const timerRef = useRef(null);
  const apiDone  = useRef(false);
  const stageDone= useRef(false);
  const resultRef= useRef(null);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  useEffect(() => {
    const total = STAGES.reduce((a, s) => a + s.duration, 0);
    Animated.timing(progress, { toValue: 1, duration: total, useNativeDriver: false }).start();

    let idx = 0;
    const advance = () => {
      if (idx >= STAGES.length - 1) { stageDone.current = true; maybeNavigate(); return; }
      idx++;
      setStageIdx(idx);
      timerRef.current = setTimeout(advance, STAGES[idx].duration);
    };
    timerRef.current = setTimeout(advance, STAGES[0].duration);
    return () => clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await apiScan(imageUri, metadata);
        if (!cancelled) { resultRef.current = result; apiDone.current = true; maybeNavigate(); }
      } catch (err) {
        if (!cancelled) { clearTimeout(timerRef.current); setError(err.message); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function maybeNavigate() {
    if (apiDone.current && stageDone.current && resultRef.current) {
      navigation.replace('Results', { result: resultRef.current });
    }
  }

  const progressW = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <LinearGradient colors={[T.bgDeep, T.bg]} style={StyleSheet.absoluteFill} />
      <View style={s.content}>
        <IrisPulse pulse={pulse} />
        <Text style={s.title}>Analyzing Your Scan</Text>

        {error ? (
          <View style={s.errBox}>
            <Text style={s.errTitle}>Analysis Failed</Text>
            <Text style={s.errBody}>{error}</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} style={s.retryBtn}>
              <Text style={s.retryTxt}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={s.stages}>
              {STAGES.map((st, i) => {
                const isDone   = i < stageIdx;
                const isActive = i === stageIdx;
                const color    = isDone ? T.sage : isActive ? T.lavender : T.faint;
                const icon     = isDone ? '✓' : isActive ? '◉' : '○';
                return (
                  <View key={i} style={s.stageRow}>
                    <Text style={[s.stageIcon, { color }]}>{icon}</Text>
                    <Text style={[s.stageTxt,  { color }]}>{st.label}</Text>
                  </View>
                );
              })}
            </View>

            <View style={s.track}>
              <Animated.View style={[s.fill, { width: progressW }]} />
            </View>

            <Text style={s.sub}>
              DINOv3 ViT-B/14 · Monte Carlo Dropout · TTA × 8
            </Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: T.bgDeep },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 28 },
  title:   { fontFamily: T.display, fontSize: 26, color: T.white, textAlign: 'center' },
  stages:  { width: '100%', gap: 4 },
  stageRow:{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  stageIcon:{ fontSize: 16, width: 22, textAlign: 'center' },
  stageTxt: { fontFamily: T.body, fontSize: 14 },
  track:   { width: '100%', height: 3, backgroundColor: T.border, borderRadius: 2, overflow: 'hidden' },
  fill:    { height: '100%', backgroundColor: T.sage, borderRadius: 2 },
  sub:     { fontFamily: T.bodyLight, fontSize: 11, color: T.faint, textAlign: 'center' },
  errBox:  { backgroundColor: T.errorSoft, borderRadius: T.rm, borderWidth: 1, borderColor: `${T.error}25`, padding: 24, width: '100%', alignItems: 'center', gap: 12 },
  errTitle:{ fontFamily: T.bodyMed, fontSize: 16, color: T.error },
  errBody: { fontFamily: T.body, fontSize: 14, color: T.cream, textAlign: 'center', lineHeight: 22 },
  retryBtn:{ marginTop: 8, backgroundColor: T.sage, paddingHorizontal: 28, paddingVertical: 12, borderRadius: T.rm },
  retryTxt:{ fontFamily: T.bodyMed, fontSize: 14, color: T.bgDeep },
});
