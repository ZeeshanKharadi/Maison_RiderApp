import { TextStyle } from 'react-native';
import { colors } from './colors';

/**
 * Cap system font scaling so layouts stay usable on large accessibility sizes.
 * Apply via `maxFontSizeMultiplier` on Text / TextInput.
 */
export const MAX_FONT_SIZE_MULTIPLIER = 1.35;

/**
 * Typography scale — system fonts for performance & platform feel.
 * Use these styles via StyleSheet or spread into Text style arrays.
 */
export const typography = {
  display: {
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 40,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  } satisfies TextStyle,

  heading: {
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 32,
    color: colors.textPrimary,
  } satisfies TextStyle,

  title: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    color: colors.textPrimary,
  } satisfies TextStyle,

  /** Section headings on main screens (Dashboard, lists, etc.). */
  section: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    color: colors.textPrimary,
  } satisfies TextStyle,

  subtitle: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    color: colors.textSecondary,
  } satisfies TextStyle,

  body: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    color: colors.textPrimary,
  } satisfies TextStyle,

  bodyStrong: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    color: colors.textPrimary,
  } satisfies TextStyle,

  caption: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textSecondary,
  } satisfies TextStyle,

  label: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
    color: colors.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  } satisfies TextStyle,

  button: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    color: colors.textOnPrimary,
  } satisfies TextStyle,

  buttonSmall: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    color: colors.textOnPrimary,
  } satisfies TextStyle,
} as const;

export type TypographyToken = keyof typeof typography;
