// Glauc Design System — shared by all screens and components
export const T = {
  // Palette
  obsidian:    '#0A0A0F',
  obsidian2:   '#111118',
  obsidian3:   '#181820',
  surface:     '#1E1E28',
  surfaceHi:   '#252532',
  border:      '#2A2A38',
  amber:       '#C8922A',
  amberHi:     '#E5A832',
  amberGlow:   'rgba(200,146,42,0.12)',
  amberSoft:   'rgba(200,146,42,0.06)',
  cream:       '#F2EDE4',
  creamMid:    '#B8B0A0',
  creamLow:    '#5A5650',
  teal:        '#2AADA0',
  tealSoft:    'rgba(42,173,160,0.12)',
  red:         '#C84040',
  redSoft:     'rgba(200,64,64,0.12)',
  gold:        '#D4A843',

  // Border radii
  r:           8,
  rm:          12,
  rl:          20,
  rxl:         32,

  // Fonts
  display:     'PlayfairDisplay_500Medium',
  displayBold: 'PlayfairDisplay_700Bold',
  body:        'DMSans_400Regular',
  bodyMed:     'DMSans_500Medium',
  bodySemi:    'DMSans_600SemiBold',
  bodyLight:   'DMSans_300Light',
};

export const RISK_COLORS = {
  low:      T.teal,
  moderate: T.gold,
  elevated: T.red,
};

export const RISK_BG = {
  low:      T.tealSoft,
  moderate: T.amberSoft,
  elevated: T.redSoft,
};
