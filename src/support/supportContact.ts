import {
  APP_SUPPORT_EMAIL,
  APP_SUPPORT_PHONE,
  APP_SUPPORT_PHONE_E164,
} from '../constants/app';

export type SupportContactChannels = {
  email: { address: string; mailtoUrl: string } | null;
  phone: { display: string; telUrl: string } | null;
};

export type SupportContact =
  | ({ kind: 'available' } & SupportContactChannels)
  | { kind: 'unavailable'; missing: string[] };

function usableEmail(email?: string | null): string | null {
  const trimmed = (email ?? '').trim();
  return trimmed.includes('@') ? trimmed : null;
}

function usablePhone(
  display?: string | null,
  e164?: string | null,
): { display: string; telUrl: string } | null {
  const shown = (display ?? '').trim();
  const dial = (e164 ?? display ?? '').trim().replace(/[^\d+]/g, '');
  if (!shown || !dial || !/\d/.test(dial)) return null;
  return { display: shown, telUrl: `tel:${dial}` };
}

/**
 * Resolve Help contacts from project config only.
 * Does not invent phone numbers, emails, or support hours.
 */
export function resolveSupportContact(
  email: string | null | undefined = APP_SUPPORT_EMAIL,
  phoneDisplay: string | null | undefined = APP_SUPPORT_PHONE,
  phoneE164: string | null | undefined = APP_SUPPORT_PHONE_E164,
): SupportContact {
  const address = usableEmail(email);
  const phone = usablePhone(phoneDisplay, phoneE164);

  if (!address && !phone) {
    return {
      kind: 'unavailable',
      missing: [
        'support email (APP_SUPPORT_EMAIL)',
        'support phone number',
        'published support hours (optional)',
      ],
    };
  }

  return {
    kind: 'available',
    email: address
      ? { address, mailtoUrl: buildSupportMailtoUrl(address) }
      : null,
    phone,
  };
}

/** Build a mailto URL with optional subject/body (percent-encoded). */
export function buildSupportMailtoUrl(
  address: string,
  opts?: { subject?: string; body?: string },
): string {
  const trimmed = address.trim();
  const parts: string[] = [];
  if (opts?.subject) {
    parts.push(`subject=${encodeURIComponent(opts.subject)}`);
  }
  if (opts?.body) {
    parts.push(`body=${encodeURIComponent(opts.body)}`);
  }
  return parts.length > 0
    ? `mailto:${trimmed}?${parts.join('&')}`
    : `mailto:${trimmed}`;
}
