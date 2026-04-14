/**
 * Glauc Design System v2.0
 * Palette: Sage green (#789D7F) + Forest darks (#30342F, #383645) + Lavender (#9C87A4)
 */

export const T = {
  // ── Backgrounds ────────────────────────────────────────────
  bgDeep:      '#1A1D1A',   // deepest: behind everything
  bg:          '#22261F',   // primary page background
  bgMid:       '#2B2F27',   // between bg and surface
  surface:     '#30342F',   // card / modal background
  surfaceHi:   '#383645',   // elevated card (the navy)
  surfaceNav:  '#2A2E27',   // bottom navigation bar

  // ── Brand ─────────────────────────────────────────────────
  sage:        '#789D7F',   // primary — buttons, active states
  sageHi:      '#8FB897',   // hover/pressed sage
  sageDark:    '#4C584E',   // dark sage — borders, subtle
  sageSoft:    'rgba(120,157,127,0.14)',
  sageGlow:    'rgba(120,157,127,0.08)',

  // ── Accent ────────────────────────────────────────────────
  lavender:    '#9C87A4',   // secondary accent
  lavenderHi:  '#B09AB8',   // bright lavender
  lavenderSoft:'rgba(156,135,164,0.14)',
  lavenderGlow:'rgba(156,135,164,0.08)',
  purple:      '#5F4569',   // deep purple — premium badge
  purpleSoft:  'rgba(95,69,105,0.20)',

  // ── Text ──────────────────────────────────────────────────
  white:       '#F4F1EC',   // primary text
  cream:       '#D9D4CA',   // secondary text
  muted:       '#8B9088',   // placeholder / metadata
  faint:       '#515750',   // disabled / very subtle

  // ── Borders ───────────────────────────────────────────────
  border:      '#333632',   // default border
  borderHi:    '#454843',   // highlighted border
  borderSage:  '#3D5240',   // sage-tinted border

  // ── Semantic ──────────────────────────────────────────────
  success:     '#789D7F',
  successSoft: 'rgba(120,157,127,0.14)',
  error:       '#C84040',
  errorSoft:   'rgba(200,64,64,0.12)',
  warning:     '#C8922A',
  warningSoft: 'rgba(200,146,42,0.12)',

  // ── Radii ─────────────────────────────────────────────────
  r:    10,
  rm:   16,
  rl:   24,
  rxl:  36,

  // ── Fonts ─────────────────────────────────────────────────
  display:     'PlayfairDisplay_700Bold',
  displayMed:  'PlayfairDisplay_500Medium',
  body:        'DMSans_400Regular',
  bodyMed:     'DMSans_500Medium',
  bodySemi:    'DMSans_600SemiBold',
  bodyLight:   'DMSans_300Light',
};

// ── Risk semantic colors (unchanged — clinical standard) ─────
export const RISK_COLORS = {
  low:      '#789D7F',   // sage = safe
  moderate: '#C8922A',   // amber = caution
  elevated: '#C84040',   // red = concern
};

export const RISK_BG = {
  low:      'rgba(120,157,127,0.12)',
  moderate: 'rgba(200,146,42,0.12)',
  elevated: 'rgba(200,64,64,0.12)',
};

// ── Plan config (single source of truth) ────────────────────
export const PLANS = [
  {
    id:          'single_once',
    type:        'once',
    label:       'Single Analysis',
    price:       19,
    priceLabel:  '$19',
    description: 'One complete ocular age analysis',
    features:    ['Ocular age prediction', 'IOP risk score', 'Instant PDF report'],
    badge:       null,
  },
  {
    id:          'comprehensive_once',
    type:        'once',
    label:       'Comprehensive Panel',
    price:       29,
    priceLabel:  '$29',
    description: 'Full 8-biomarker panel + AI clinical report',
    features:    ['All Single features', '8 biomarker panel', 'AI clinical narrative', 'Priority processing'],
    badge:       'Most Popular',
  },
  {
    id:          'single_weekly',
    type:        'weekly',
    label:       'Weekly Single',
    price:       6,
    priceLabel:  '$6',
    priceSub:    '/week · ~$24/mo',
    description: 'Regular monitoring with single analyses',
    features:    ['Unlimited single scans', 'Progress tracking', 'Trend alerts'],
    badge:       null,
  },
  {
    id:          'comprehensive_weekly',
    type:        'weekly',
    label:       'Weekly Comprehensive',
    price:       9,
    priceLabel:  '$9',
    priceSub:    '/week · ~$36/mo',
    description: 'Maximum insight with weekly comprehensive panels',
    features:    ['Unlimited comprehensive scans', '8 biomarker panel', 'AI clinical narrative', 'Priority + trend alerts'],
    badge:       'Best Value',
  },
];
