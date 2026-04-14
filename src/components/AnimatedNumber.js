import React, { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';

export default function AnimatedNumber({
  value, suffix = '', decimals = 1, style,
}) {
  const [display, setDisplay] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    const target   = parseFloat(value) || 0;
    const duration = 1200;
    const steps    = 60;
    const interval = duration / steps;
    const delta    = target / steps;
    let current    = 0;
    let step       = 0;

    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      step++;
      current += delta;
      if (step >= steps) {
        setDisplay(target);
        clearInterval(timerRef.current);
      } else {
        setDisplay(current);
      }
    }, interval);

    return () => clearInterval(timerRef.current);
  }, [value]);

  return (
    <Text style={style}>
      {display.toFixed(decimals)}{suffix}
    </Text>
  );
}
