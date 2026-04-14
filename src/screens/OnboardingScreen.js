/**
 * OnboardingScreen v2 — Bella-inspired animated intro.
 * Slide 1: Brand + big stat counter (like Bella "100000+ Patients")
 * Slide 2: Effectiveness chart (Diet vs Glauc Treatment)
 * Slide 3: How it works — 3-step cards
 * Each slide animates in independently.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Line, Rect, Path, Text as SvgText } from 'react-native-svg';
import { T } from '../constants/theme';

const { width: W } = Dimensions.get('window');

export default function OnboardingScreen({ onDone }) {
  const scrollRef  = useRef(null);
  const [slide, setSlide] = useState(0);
  const TOTAL = 3;

  const goTo = useCallback((idx) => {
    scrollRef.current?.scrollTo({ x: idx * W, animated: true });
    setSlide(idx);
  }, []);

  const onScroll = useCallback((e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / W);
    setSlide(idx);
  }, []);

  const handleNext = useCallback(() => {
    if (slide < TOTAL - 1) goTo(slide + 1);
    else onDone();
  }, [slide, goTo, onDone]);

  return (
    <View style={s.root}>
      <LinearGradient colors={[T.bgDeep, T.bg]} style={StyleSheet.absoluteFill} />

      {/* Skip */}
      <SafeAreaView edges={['top']} style={s.topBar}>
        {slide < TOTAL - 1 ? (
          <TouchableOpacity onPress={onDone} style={s.skipBtn} accessibilityRole="button" accessibilityLabel="Skip">
            <Text style={s.skipTxt}>Skip</Text>
          </TouchableOpacity>
        ) : <View />}
        <View style={s.dotsRow}>
          {Array.from({ length: TOTAL }).map((_, i) => (
            <View key={i} style={[s.dot, slide === i && s.dotOn]} />
          ))}
        </View>
      </SafeAreaView>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onScroll}
        style={{ flex: 1 }}
      >
        <Slide1 active={slide === 0} />
        <Slide2 active={slide === 1} />
        <Slide3 active={slide === 2} />
      </ScrollView>

      {/* CTA */}
      <SafeAreaView edges={['bottom']} style={s.footer}>
        <TouchableOpacity onPress={handleNext} style={s.cta} activeOpacity={0.85} accessibilityRole="button">
          <Text style={s.ctaTxt}>{slide === TOTAL - 1 ? 'Get Started' : 'Next'}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

// ── Slide 1: Bella-style hero with animated counter ───────────
function Slide1({ active }) {
  const countAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const riseAnim  = useRef(new Animated.Value(24)).current;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!active) return;
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(riseAnim, { toValue: 0, duration: 500, delay: 100, useNativeDriver: true }),
    ]).start();
    // Count up to 12847
    const target = 12847;
    const steps  = 60;
    let step     = 0;
    const interval = setInterval(() => {
      step++;
      setCount(Math.round((step / steps) * target));
      if (step >= steps) clearInterval(interval);
    }, 20);
    return () => clearInterval(interval);
  }, [active]);

  return (
    <View style={[s.slide]}>
      <Animated.View style={[s.s1Content, { opacity: fadeAnim, transform: [{ translateY: riseAnim }] }]}>
        {/* Stat badge */}
        <View style={s.statBadge}>
          <Text style={s.statStar}>★</Text>
          <Text style={s.statBadgeTxt}>{count.toLocaleString()}+ Analyses Completed</Text>
        </View>

        {/* Main headline */}
        <Text style={s.s1Title}>
          Eye Health Is{'\n'}About To Get A{'\n'}Whole Lot{'\n'}Smarter.
        </Text>

        <View style={s.s1Rule} />

        <Text style={s.s1Body}>
          No ophthalmologist visit needed — just fast, AI-powered retinal analysis with results in under 60 seconds.
        </Text>

        {/* Social proof card */}
        <View style={s.testimonial}>
          <View style={s.testimonialAvatar}>
            <Text style={s.testimonialAvatarTxt}>S</Text>
          </View>
          <View>
            <Text style={s.testimonialQuote}>"Caught early-stage changes my doctor had missed."</Text>
            <Text style={s.testimonialMeta}>Sarah K. — 100% Satisfied</Text>
          </View>
        </View>

        {/* Large brand name */}
        <View style={s.brandRow}>
          <Text style={[s.brandLetter, { color: T.sage      }]}>G</Text>
          <Text style={[s.brandLetter, { color: T.lavender  }]}>l</Text>
          <Text style={[s.brandLetter, { color: T.sageDark  }]}>a</Text>
          <Text style={[s.brandLetter, { color: T.purple    }]}>u</Text>
          <Text style={[s.brandLetter, { color: T.lavenderHi}]}>c</Text>
        </View>
      </Animated.View>
    </View>
  );
}

// ── Slide 2: Effectiveness chart (Bella center bar chart) ─────
function Slide2({ active }) {
  const barAnim   = useRef(new Animated.Value(0)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const numAnim   = useRef(new Animated.Value(0)).current;
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!active) return;
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(barAnim,  { toValue: 1, duration: 900, delay: 200, useNativeDriver: false }),
    ]).start();
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setPct(parseFloat(((step / 60) * 24.1).toFixed(1)));
      if (step >= 60) clearInterval(interval);
    }, 15);
    return () => clearInterval(interval);
  }, [active]);

  const BAR_W = W - 96;
  const bars = [
    { label: 'Diet Only',             pct: 0.28, color: '#C8B84A', pattern: true },
    { label: 'Glauc + Monitoring',    pct: 0.75, color: T.lavender },
    { label: 'Glauc + Full Treatment',pct: 0.90, color: T.sage },
  ];

  return (
    <View style={s.slide}>
      <Animated.View style={[s.s2Content, { opacity: fadeAnim }]}>
        <View style={s.ratingRow}>
          <Text style={s.ratingStar}>★</Text>
          <Text style={s.ratingTxt}>4.8 Average Rating</Text>
          <View style={s.ratingDot} />
          <Text style={s.ratingTxt}>2,847 Reviews</Text>
        </View>

        <Text style={s.bigPct}>{pct.toFixed(1)}%</Text>
        <Text style={s.bigPctSub}>Improvement in Ocular Age Score — Avg.</Text>

        <View style={s.chartArea}>
          {bars.map((bar, i) => (
            <View key={i} style={s.barGroup}>
              <Text style={s.barLabel}>{bar.label}</Text>
              <View style={s.barTrack}>
                <Animated.View
                  style={[
                    s.barFill,
                    {
                      backgroundColor: bar.color,
                      width: barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${bar.pct * 100}%`] }),
                      opacity: bar.pattern ? 0.85 : 1,
                    },
                  ]}
                />
              </View>
            </View>
          ))}
          {/* X axis */}
          <View style={s.xAxis}>
            {[0, 5, 10, 15, 20].map(n => (
              <Text key={n} style={s.xLabel}>{n}</Text>
            ))}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

// ── Slide 3: How it works — 3 step cards ─────────────────────
function Slide3({ active }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const anims    = [0, 1, 2].map(() => useRef(new Animated.Value(30)).current);

  useEffect(() => {
    if (!active) return;
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    anims.forEach((a, i) => {
      Animated.timing(a, { toValue: 0, duration: 450, delay: 150 + i * 120, useNativeDriver: true }).start();
    });
  }, [active]);

  const steps = [
    {
      num: '01', icon: '◉',
      title: 'Capture',
      body:  'Photograph your fundus image with your phone camera or upload from your gallery.',
      color: T.sage,
    },
    {
      num: '02', icon: '◈',
      title: 'Analyze',
      body:  'DINOv3 AI + Monte Carlo uncertainty quantification computes your ocular biomarkers.',
      color: T.lavender,
    },
    {
      num: '03', icon: '◇',
      title: 'Report',
      body:  'Receive your ocular age, risk scores, and a personalized Qwen3-VL clinical narrative.',
      color: T.purple,
    },
  ];

  return (
    <View style={s.slide}>
      <Animated.View style={[s.s3Content, { opacity: fadeAnim }]}>
        <Text style={s.s3Super}>Built on Medical Expertise,</Text>
        <Text style={s.s3Title}>Now Centered on You</Text>
        <Text style={s.s3Sub}>
          Get access to AI analysis calibrated on clinical datasets — delivered instantly to your phone.
        </Text>

        <View style={s.stepsWrap}>
          {steps.map((step, i) => (
            <Animated.View
              key={i}
              style={[s.stepCard, { transform: [{ translateY: anims[i] }], opacity: anims[i].interpolate({ inputRange: [0, 30], outputRange: [1, 0] }) }]}
            >
              <View style={[s.stepNum, { backgroundColor: `${step.color}20`, borderColor: `${step.color}30` }]}>
                <Text style={[s.stepNumTxt, { color: step.color }]}>{step.num}</Text>
              </View>
              <View style={s.stepBody}>
                <Text style={s.stepTitle}>{step.icon} {step.title}</Text>
                <Text style={s.stepDesc}>{step.body}</Text>
              </View>
            </Animated.View>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bgDeep },

  topBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 24, paddingTop: 4, paddingBottom: 8,
  },
  skipBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  skipTxt: { fontFamily: T.body, fontSize: 14, color: T.muted },
  dotsRow: { flexDirection: 'row', gap: 6 },
  dot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: T.border },
  dotOn:   { width: 22, backgroundColor: T.sage },

  slide:    { width: W, flex: 1 },

  // Slide 1
  s1Content:  { flex: 1, paddingHorizontal: 28, paddingTop: 8 },
  statBadge:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24 },
  statStar:   { fontSize: 14, color: '#F6C94E' },
  statBadgeTxt:{ fontFamily: T.bodyMed, fontSize: 13, color: T.muted },
  s1Title: {
    fontFamily: T.display, fontSize: 36, color: T.white, lineHeight: 44, marginBottom: 20,
  },
  s1Rule:  { width: 48, height: 2, backgroundColor: T.sage, marginBottom: 16 },
  s1Body:  { fontFamily: T.body, fontSize: 14, color: T.cream, lineHeight: 24, marginBottom: 24 },
  testimonial: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: T.surface, borderRadius: T.rm, borderWidth: 1,
    borderColor: T.border, padding: 14, marginBottom: 24,
  },
  testimonialAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: T.sageSoft, borderWidth: 1, borderColor: T.borderSage,
    alignItems: 'center', justifyContent: 'center',
  },
  testimonialAvatarTxt: { fontFamily: T.bodyMed, fontSize: 16, color: T.sage },
  testimonialQuote: { fontFamily: T.bodyMed, fontSize: 12, color: T.cream, flex: 1, lineHeight: 18 },
  testimonialMeta:  { fontFamily: T.body, fontSize: 11, color: T.muted, marginTop: 2 },
  brandRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 },
  brandLetter: { fontFamily: T.display, fontSize: 72, lineHeight: 80 },

  // Slide 2
  s2Content: { flex: 1, paddingHorizontal: 28, paddingTop: 16 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  ratingStar:{ fontSize: 13, color: '#F6C94E' },
  ratingTxt: { fontFamily: T.body, fontSize: 12, color: T.muted },
  ratingDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: T.faint },
  bigPct:    { fontFamily: T.display, fontSize: 72, color: T.white, lineHeight: 82 },
  bigPctSub: { fontFamily: T.body, fontSize: 13, color: T.muted, marginBottom: 32 },
  chartArea: { gap: 14 },
  barGroup:  { gap: 6 },
  barLabel:  { fontFamily: T.body, fontSize: 13, color: T.cream },
  barTrack:  { height: 36, backgroundColor: T.surface, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: T.border },
  barFill:   { height: '100%', borderRadius: 6 },
  xAxis:     { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  xLabel:    { fontFamily: T.body, fontSize: 11, color: T.faint },

  // Slide 3
  s3Content: { flex: 1, paddingHorizontal: 28, paddingTop: 12 },
  s3Super:   { fontFamily: T.body, fontSize: 13, color: T.sage, letterSpacing: 0.3, marginBottom: 6 },
  s3Title:   { fontFamily: T.display, fontSize: 34, color: T.white, lineHeight: 42, marginBottom: 14 },
  s3Sub:     { fontFamily: T.body, fontSize: 14, color: T.cream, lineHeight: 22, marginBottom: 28 },
  stepsWrap: { gap: 12 },
  stepCard: {
    flexDirection: 'row', gap: 14, backgroundColor: T.surface,
    borderRadius: T.rm, borderWidth: 1, borderColor: T.border, padding: 16,
  },
  stepNum: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  stepNumTxt: { fontFamily: T.bodySemi, fontSize: 13 },
  stepBody:   { flex: 1 },
  stepTitle:  { fontFamily: T.bodyMed, fontSize: 15, color: T.white, marginBottom: 4 },
  stepDesc:   { fontFamily: T.body, fontSize: 13, color: T.muted, lineHeight: 20 },

  // Footer
  footer:  { paddingHorizontal: 28, paddingBottom: 12 },
  cta: {
    backgroundColor: T.sage, borderRadius: T.rxl,
    paddingVertical: 16, alignItems: 'center',
  },
  ctaTxt: { fontFamily: T.bodyMed, fontSize: 16, color: T.bgDeep },
});
