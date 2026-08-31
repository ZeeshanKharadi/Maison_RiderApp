/**
 * Design system — Color tokens
 * Semantic names are preferred for new code.
 * Legacy exports (BRAND_RED, etc.) remain for backward compatibility.
 */

export const colors = {
  // Brand
  primary: '#C41E1E',
  primaryDark: '#A52A2A',
  primaryPressed: '#8B1A1A',
  primarySoft: '#FFF0F0',
  secondary: '#1A1A1A',

  // Surfaces
  background: '#F5F5F5',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.45)',

  // Borders
  border: '#E8E8E8',
  borderStrong: '#D0D0D0',
  borderInput: '#F0D0D0',

  // Text
  textPrimary: '#1A1A1A',
  textSecondary: '#666666',
  textMuted: '#999999',
  textOnPrimary: '#FFFFFF',
  textDisabled: '#BDBDBD',

  // Semantic
  success: '#2E7D32',
  successSoft: '#E8F5E9',
  warning: '#E65100',
  warningSoft: '#FFF3E0',
  error: '#C62828',
  errorSoft: '#FFEBEE',
  info: '#1565C0',
  infoSoft: '#E3F2FD',

  // Accents (sparingly)
  star: '#F9A825',
  starSoft: '#FFF8E1',

  // States
  disabled: '#E0E0E0',
  disabledText: '#9E9E9E',
  pressed: 'rgba(0, 0, 0, 0.06)',
} as const;

export type ColorToken = keyof typeof colors;

/** @deprecated Prefer colors.primary */
export const BRAND_RED = colors.primary;
/** @deprecated Prefer colors.primaryDark */
export const BRAND_RED_DARK = colors.primaryDark;
/** @deprecated Prefer colors.success */
export const ACCEPT_GREEN = colors.success;
/** @deprecated Prefer colors.background */
export const BACKGROUND = colors.background;
/** @deprecated Prefer colors.surface */
export const CARD_WHITE = colors.surface;
/** @deprecated Prefer colors.textPrimary */
export const TEXT_PRIMARY = colors.textPrimary;
/** @deprecated Prefer colors.textSecondary */
export const TEXT_SECONDARY = colors.textSecondary;
/** @deprecated Prefer colors.textMuted */
export const TEXT_MUTED = colors.textMuted;
/** @deprecated Prefer colors.border */
export const BORDER_LIGHT = colors.border;
/** @deprecated Prefer colors.borderInput */
export const BORDER_INPUT = colors.borderInput;
