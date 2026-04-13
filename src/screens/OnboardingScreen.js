/**
 * OnboardingScreen — 3-slide intro shown to new users once.
 * Uses a horizontal paging ScrollView with dot indicators.
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { T } from '../constants/theme';
import IrisMotif from '../components/IrisMotif';
import PrimaryButton from '../components/PrimaryButton';

const { width: SCREEN_W } = Dimensions.get('window');

const SLIDES = [
  {
    icon: <IrisMotif size={120} opacity={1} />,
    title: 'Precision Eye Analysis',
    body:  'DINOv3 vision AI analyzes your fundus photograph in seconds — detecting subtle biomarkers that correlate with ocular aging and glaucoma risk.',
  },
  {
    icon: <ChartIcon />,
    title: 'Your Ocular Age Report',
    body:  'Receive your predicted ocular age, biological vs chronological age delta, risk scores for IOP and structural changes, and a personalized clinical narrative.',
  },
  {
    icon: <ShieldIcon />,
    title: 'Private by Design',
    body:  'Your eye images are analyzed and immediately discarded. Only anonymized biomarkers are stored — never your photo, never your identity.',
  },
];

export default function OnboardingScreen({ onDone }) {
  const scrollRef  = useRef(null);
  const [slide, setSlide] = useState(0);

  const goTo = useCallback((index) => {
    scrollRef.current?.scrollTo({ x: index * SCREEN_W, animated: true });
    setSlide(index);
  }, []);

  const handleScroll = useCallback((e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setSlide(idx);
  }, []);

  const handleNext = useCallback(() => {
    if (slide < SLIDES.length - 1) {
      goTo(slide + 1);
    } else {
      onDone();
    }
  }, [slide, goTo, onDone]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <LinearGradient
        colors={[`${T.amber}18`, T.obsidian]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.7 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Skip */}
      {slide < SLIDES.length - 1 && (
        <TouchableOpacity
          onPress={onDone}
          style={styles.skipBtn}
          accessibilityLabel="Skip onboarding"
          accessibilityRole="button"
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleScroll}
        style={styles.scroller}
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={styles.slide}>
            <View style={styles.iconWrap}>{s.icon}</View>
            <Text style={styles.slideTitle}>{s.title}</Text>
            <Text style={styles.slideBody}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Dots */}
      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => goTo(i)}
            accessibilityLabel={`Go to slide ${i + 1}`}
          >
            <View style={[styles.dot, slide === i && styles.dotActive]} />
          </TouchableOpacity>
        ))}
      </View>

      {/* CTA */}
      <View style={styles.footer}>
        <PrimaryButton onPress={handleNext}>
          {slide === SLIDES.length - 1 ? 'Get Started' : 'Next'}
        </PrimaryButton>
      </View>
    </SafeAreaView>
  );
}

// ── Inline SVG-free icons ──────────────────────────────────────
function ChartIcon() {
  return (
    <View style={iconStyles.wrap}>
      {[0.3, 0.6, 0.85, 0.5, 0.95, 0.4, 0.7].map((h, i) => (
        <View
          key={i}
          style={[iconStyles.bar, { height: 80 * h, backgroundColor: i === 4 ? T.amber : T.border }]}
        />
      ))}
    </View>
  );
}

function ShieldIcon() {
  return (
    <View style={iconStyles.shieldOuter}>
      <View style={iconStyles.shieldInner}>
        <Text style={iconStyles.shieldCheck}>✓</Text>
      </View>
    </View>
  );
}

const iconStyles = StyleSheet.create({
  wrap:        { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 100 },
  bar:         { width: 14, borderRadius: 4 },
  shieldOuter: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: T.amberGlow,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: `${T.amber}40`,
  },
  shieldInner: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: T.amber,
    alignItems: 'center', justifyContent: 'center',
  },
  shieldCheck: { fontSize: 30, color: T.obsidian },
});

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: T.obsidian },

  skipBtn: { alignSelf: 'flex-end', paddingHorizontal: 24, paddingTop: 12 },
  skipText: {
    fontFamily: T.body,
    fontSize: 14,
    color: T.creamLow,
  },

  scroller: { flex: 1 },
  slide: {
    width: SCREEN_W,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    gap: 28,
  },
  iconWrap:   { marginBottom: 8 },
  slideTitle: {
    fontFamily: T.display,
    fontSize: 28,
    color: T.cream,
    textAlign: 'center',
    lineHeight: 36,
  },
  slideBody: {
    fontFamily: T.body,
    fontSize: 15,
    color: T.creamMid,
    textAlign: 'center',
    lineHeight: 24,
  },

  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 20,
  },
  dot: {
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: T.border,
  },
  dotActive: {
    backgroundColor: T.amber,
    width: 24,
  },

  footer: {
    paddingHorizontal: 28,
    paddingBottom: 20,
  },
});
