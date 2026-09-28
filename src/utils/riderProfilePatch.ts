/**
 * Pure helpers for rider profile edit drafts (Jest-friendly).
 */
export function buildRiderProfilePatchBody(input: {
  currentPhone: string;
  currentEmergency: string;
  nextPhone?: string;
  nextEmergency?: string;
}): { phoneNumber?: string; emergencyContactNumber?: string } | null {
  const body: { phoneNumber?: string; emergencyContactNumber?: string } = {};
  if (
    input.nextPhone !== undefined &&
    input.nextPhone.trim() !== (input.currentPhone || '').trim()
  ) {
    body.phoneNumber = input.nextPhone.trim();
  }
  if (
    input.nextEmergency !== undefined &&
    input.nextEmergency.trim() !== (input.currentEmergency || '').trim()
  ) {
    body.emergencyContactNumber = input.nextEmergency.trim();
  }
  return Object.keys(body).length === 0 ? null : body;
}
