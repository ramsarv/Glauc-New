import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { T, RISK_COLORS, RISK_BG } from '../constants/theme';

export default function RiskBadge({ label, score, level }) {
  const color = RISK_COLORS[level] || T.creamMid;
  const bg    = RISK_BG[level]    || T.surface;
  const pct   = Math.min(Math.max(score, 0), 1);

  return (
    <View style={[styles.row, { backgroundColor: bg, borderColor: `${color}30` }]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.right}>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
        </View>
        <Text style={[styles.levelText, { color }]}>
          {level.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: T.r,
    borderWidth: 1,
    marginBottom: 10,
  },
  label: {
    fontFamily: T.body,
    fontSize: 13,
    color: T.creamMid,
    flex: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barTrack: {
    width: 60,
    height: 4,
    backgroundColor: T.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
  levelText: {
    fontFamily: T.bodySemi,
    fontSize: 11,
    letterSpacing: 0.8,
    minWidth: 60,
    textAlign: 'right',
  },
});
