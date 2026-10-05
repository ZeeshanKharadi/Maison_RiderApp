import type { RiderProfile } from '../data/account';
import { DEFAULT_PROFILE } from '../data/account';
import type { User } from '../services/AuthContext';

/** Device-local profile seed for the current auth user (no previous rider fields). */
export function profileSeedForUser(
  authUser: User | null,
  language: RiderProfile['language'] = DEFAULT_PROFILE.language,
): RiderProfile {
  if (!authUser) {
    return { ...DEFAULT_PROFILE, language };
  }
  return {
    ...DEFAULT_PROFILE,
    language,
    fullName: authUser.name || '',
    email: authUser.email || '',
    phone: authUser.phone ?? '',
    emergencyContact: authUser.emergencyContact ?? '',
  };
}

/**
 * Whether an async inbox response may update UI for the active rider session.
 * Late responses from a previous rider (or after logout) must be ignored.
 */
export function shouldApplyInboxForRider(
  responseForUserId: string | null | undefined,
  activeUserId: string | null | undefined,
): boolean {
  if (!responseForUserId || !activeUserId) return false;
  return responseForUserId === activeUserId;
}
