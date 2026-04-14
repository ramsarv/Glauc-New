import React from 'react';
import Svg, {
  Circle, Line, Defs, RadialGradient, Stop, G,
} from 'react-native-svg';
import { T } from '../constants/theme';

export default function IrisMotif({ size = 200, opacity = 0.18 }) {
  const rings = [100, 88, 76, 64, 52, 40, 28];
  const lines = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * Math.PI * 2;
    return {
      x1: 100 + Math.cos(angle) * 30,
      y1: 100 + Math.sin(angle) * 30,
      x2: 100 + Math.cos(angle) * 95,
      y2: 100 + Math.sin(angle) * 95,
    };
  });

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      opacity={opacity}
    >
      <Defs>
        <RadialGradient id="irisGrad" cx="50%" cy="50%" r="50%">
          <Stop offset="0%"   stopColor={T.amber} stopOpacity="1" />
          <Stop offset="40%"  stopColor={T.gold}  stopOpacity="0.6" />
          <Stop offset="100%" stopColor={T.amber} stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {rings.map((r, i) => (
        <Circle
          key={i}
          cx="100" cy="100" r={r}
          fill="none"
          stroke={T.amber}
          strokeWidth={i === 0 ? 0.3 : 0.5}
          opacity={0.3 - i * 0.03}
        />
      ))}

      {lines.map((l, i) => (
        <Line
          key={i}
          x1={l.x1} y1={l.y1}
          x2={l.x2} y2={l.y2}
          stroke={T.amber}
          strokeWidth="0.4"
          opacity="0.25"
        />
      ))}

      <Circle cx="100" cy="100" r="18" fill={T.amber} opacity="0.9" />
      <Circle cx="100" cy="100" r="8"  fill={T.obsidian} />
      <Circle cx="93"  cy="93"  r="2.5" fill="white" opacity="0.9" />
    </Svg>
  );
}
