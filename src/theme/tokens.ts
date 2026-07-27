/**
 * Trove design tokens (the "Atelier" identity).
 * Warm, calm, communal. A noticeboard for real life, not software for work.
 * These exact values are the source of truth from the product spec.
 */

export const colors = {
  // Core
  paper: '#F2EAD9', // app background (warm oat)
  surface: '#FBF6EC', // cards
  surfaceAlt: '#F7F0E1', // subtle fills
  ink: '#2B2620', // primary text (warm espresso)
  inkSoft: '#6A5F52', // secondary text
  inkFaint: '#A3947E', // metadata
  hairline: '#E4D9C3', // borders
  hairlineSoft: '#EADFCB',

  // Brand
  brand: '#4C6444', // primary actions
  brandDeep: '#3A4E34', // pressed / dark-green text
  brandSoft: '#E7ECDD', // green wash, label backgrounds
  honey: '#D29A40', // warm accent and spark

  // On-color text
  onBrand: '#FBF6EC',

  // Priority
  priorityHigh: '#C04A3C',
  priorityMedium: '#4C6444',
  priorityLow: '#C9BCA4',

  // Overdue (light red card wash)
  overdueSurface: '#F6E1DC',
  overdueBorder: '#E4B6AC',

  white: '#FFFFFF',
  transparent: 'transparent',
} as const;

/** Accent colors a space can take (shown as a dot and on tags). */
export const spaceAccents = {
  sage: '#5F7050',
  brand: '#4C6444',
  moss: '#6E7A3C',
  teal: '#3F6E63',
  dusk: '#5B6E7A',
  lilac: '#7C6E9A',
  plum: '#8E5B6A',
  rose: '#B5566A',
  terracotta: '#C16E43',
  clay: '#A6572F',
  ochre: '#C2922F',
  honey: '#D29A40',
} as const;

export type SpaceAccentName = keyof typeof spaceAccents;

export const spaceAccentOrder: SpaceAccentName[] = [
  'sage',
  'brand',
  'moss',
  'teal',
  'dusk',
  'lilac',
  'plum',
  'rose',
  'terracotta',
  'clay',
  'ochre',
  'honey',
];

/** Resolve a stored space color (hex or accent name) to a hex value. */
export function resolveAccent(color: string | null | undefined): string {
  if (!color) return spaceAccents.sage;
  if (color in spaceAccents) return spaceAccents[color as SpaceAccentName];
  return color; // already a hex value
}

/** Example label chip tints (warm). */
export const labelChips = {
  urgent: { bg: '#F6E1DC', text: '#A23A30' },
  events: { bg: '#E7ECDD', text: '#3A4E34' },
  content: { bg: '#FBEFD9', text: '#9A6A12' },
} as const;

export const priority = {
  high: { color: colors.priorityHigh, label: 'High' },
  medium: { color: colors.priorityMedium, label: 'Medium' },
  low: { color: colors.priorityLow, label: 'Low' },
} as const;

export type PriorityLevel = keyof typeof priority;

// Muted red → amber → green ramp used to colour a task's urgency dot by its
// rank in the visible list (top = most urgent = red, bottom = green).
const HEAT_STOPS = ['#C04A3C', '#D99A4E', '#4C6444'] as const;

function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const mix = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return '#' + mix.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Colour for a task's urgency dot given its position in the list. `rank` 0 is
 * the top (red); the ramp reaches green at the last item, so the gradient
 * always spans the full list however many tasks it holds. A lone task shows the
 * top colour.
 */
export function heatColor(rank: number, total: number): string {
  if (total <= 1) return HEAT_STOPS[0];
  const t = Math.min(1, Math.max(0, rank / (total - 1)));
  const scaled = t * (HEAT_STOPS.length - 1);
  const i = Math.min(HEAT_STOPS.length - 2, Math.floor(scaled));
  return lerpHex(HEAT_STOPS[i], HEAT_STOPS[i + 1], scaled - i);
}

export const radii = {
  sm: 8,
  button: 12,
  card: 15,
  lg: 20,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Font families — must match the keys registered with useFonts in the root layout. */
export const fonts = {
  // Fraunces (serif) — display & headings
  displayRegular: 'Fraunces_400Regular',
  displayMedium: 'Fraunces_500Medium',
  displaySemiBold: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  // Hanken Grotesk (sans) — body & UI
  bodyRegular: 'HankenGrotesk_400Regular',
  bodyMedium: 'HankenGrotesk_500Medium',
  bodySemiBold: 'HankenGrotesk_600SemiBold',
  bodyBold: 'HankenGrotesk_700Bold',
} as const;

/** Type scale (mobile), from the spec. */
export const type = {
  screenTitle: { fontFamily: fonts.displaySemiBold, fontSize: 25, lineHeight: 30 },
  sectionHeading: { fontFamily: fonts.displaySemiBold, fontSize: 19, lineHeight: 24 },
  cardTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15.5, lineHeight: 21 },
  body: { fontFamily: fonts.bodyRegular, fontSize: 15.5, lineHeight: 22 },
  bodyMedium: { fontFamily: fonts.bodyMedium, fontSize: 15.5, lineHeight: 22 },
  button: { fontFamily: fonts.bodySemiBold, fontSize: 16, lineHeight: 20 },
  meta: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 17 },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
} as const;

/** Soft, warm shadows based on rgba(43,38,32,...). */
export const shadows = {
  card: {
    shadowColor: '#2B2620',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  floating: {
    shadowColor: '#2B2620',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;

export const theme = {
  colors,
  spaceAccents,
  labelChips,
  priority,
  radii,
  spacing,
  fonts,
  type,
  shadows,
} as const;

export type Theme = typeof theme;
