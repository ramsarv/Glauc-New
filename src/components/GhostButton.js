import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { T } from '../constants/theme';

export default function GhostButton({ children, onPress, style, textStyle }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.button, style]}
      activeOpacity={0.7}
    >
      <Text style={[styles.label, textStyle]}>{children}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: T.rm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: T.body,
    fontSize: 15,
    color: T.creamMid,
    letterSpacing: 0.3,
  },
});
