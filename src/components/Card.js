import React from 'react';
import { View, StyleSheet } from 'react-native';
import { T } from '../constants/theme';

export default function Card({ children, style, glow = false }) {
  return (
    <View style={[styles.card, glow && styles.glow, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.surface,
    borderRadius: T.rl,
    borderWidth: 1,
    borderColor: T.border,
    overflow: 'hidden',
  },
  glow: {
    borderColor: `${T.amber}40`,
    shadowColor: T.amber,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 6,
  },
});
