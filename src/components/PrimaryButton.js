import React, { useRef } from 'react';
import {
  TouchableOpacity, Text, ActivityIndicator,
  StyleSheet, Animated,
} from 'react-native';
import { T } from '../constants/theme';

export default function PrimaryButton({
  children, onPress, disabled = false, loading = false, style,
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97, useNativeDriver: true, speed: 40,
    }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1, useNativeDriver: true, speed: 40,
    }).start();
  };

  const isDisabled = disabled || loading;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={isDisabled ? undefined : onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled }}
        style={[
          styles.button,
          isDisabled && styles.disabled,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={T.obsidian} />
        ) : (
          <Text style={[styles.label, isDisabled && styles.labelDisabled]}>
            {children}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    paddingVertical: 18,
    paddingHorizontal: 24,
    backgroundColor: T.amber,
    borderRadius: T.rm,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: T.amber,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  disabled: {
    backgroundColor: T.surface,
    shadowOpacity: 0,
    elevation: 0,
  },
  label: {
    fontFamily: T.bodySemi,
    fontSize: 16,
    color: T.obsidian,
    letterSpacing: 0.6,
  },
  labelDisabled: {
    color: T.creamLow,
  },
});
