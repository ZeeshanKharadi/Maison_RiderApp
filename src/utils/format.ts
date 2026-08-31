/** Shared formatters — keep UI free of ad-hoc money/date logic. */

import { CURRENCY_CODE, CURRENCY_LOCALE } from '../constants/app';

let moneyFormatter: Intl.NumberFormat | null | undefined;
let moneyFormatterWhole: Intl.NumberFormat | null | undefined;

/** Hermes may throw when constructing unsupported currency formatters — init lazily. */
function getMoneyFormatter(whole: boolean): Intl.NumberFormat | null {
  if (whole) {
    if (moneyFormatterWhole !== undefined) return moneyFormatterWhole;
    try {
      moneyFormatterWhole = new Intl.NumberFormat(CURRENCY_LOCALE, {
        style: 'currency',
        currency: CURRENCY_CODE,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    } catch {
      moneyFormatterWhole = null;
    }
    return moneyFormatterWhole;
  }

  if (moneyFormatter !== undefined) return moneyFormatter;
  try {
    moneyFormatter = new Intl.NumberFormat(CURRENCY_LOCALE, {
      style: 'currency',
      currency: CURRENCY_CODE,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  } catch {
    moneyFormatter = null;
  }
  return moneyFormatter;
}

/** Fallback if Intl currency is unavailable on a device. */
function formatPkrFallback(amount: number, decimals = 2): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const fixed = abs.toFixed(decimals);
  const [whole, frac] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}Rs ${grouped}${decimals > 0 ? `.${frac}` : ''}`;
}

function formatCurrency(amount: number, whole = false): string {
  const formatter = getMoneyFormatter(whole);
  if (!formatter) return formatPkrFallback(amount, whole ? 0 : 2);
  try {
    return formatter.format(amount);
  } catch {
    return formatPkrFallback(amount, whole ? 0 : 2);
  }
}

export function formatMoney(amount: number, compact = false): string {
  if (compact && Math.abs(amount) >= 1000) {
    return `Rs ${(amount / 1000).toFixed(1)}k`;
  }
  return formatCurrency(amount);
}

export function formatMoneyShort(amount: number): string {
  if (Math.abs(amount) >= 1000) {
    return `Rs ${(amount / 1000).toFixed(1)}k`;
  }
  return formatCurrency(amount, true);
}

/** Plain text for descriptions (no locale symbol quirks). */
export function formatMoneyPlain(amount: number): string {
  return formatPkrFallback(amount, 2);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const day = startOfDay(d);

  if (day.getTime() === today.getTime()) return 'Today';
  if (day.getTime() === yesterday.getTime()) return 'Yesterday';

  try {
    return d.toLocaleDateString(CURRENCY_LOCALE, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(CURRENCY_LOCALE, {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}

export function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(CURRENCY_LOCALE, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }
}
