/**
 * Delivery issue reason codes — must match backend DeliveryIssueReasons.
 */
export const DELIVERY_ISSUE_REASONS = [
  {
    code: 'CustomerUnreachable' as const,
    label: 'Customer unreachable',
  },
  {
    code: 'CustomerRefused' as const,
    label: 'Customer refused',
  },
  {
    code: 'AddressIssue' as const,
    label: 'Address issue',
  },
  {
    code: 'Other' as const,
    label: 'Other',
  },
];

export type DeliveryIssueReasonCode =
  (typeof DELIVERY_ISSUE_REASONS)[number]['code'];

export function isOtherIssueReason(code: string | null | undefined): boolean {
  return code === 'Other';
}

export function fingerprintIssuePayload(
  reason: string | null | undefined,
  note: string | null | undefined,
): string {
  return `${reason ?? ''}|${(note ?? '').trim()}`;
}

/**
 * Reuse an in-flight requestId only for an exact same reason+note retry
 * (uncertain network). Editing the form must mint a new key.
 */
export function resolveIssueRequestId(opts: {
  existingRequestId: string | null;
  existingFingerprint: string | null;
  reason: string;
  note: string;
  createId: () => string;
}): { requestId: string; fingerprint: string } {
  const fingerprint = fingerprintIssuePayload(opts.reason, opts.note);
  if (
    opts.existingRequestId &&
    opts.existingFingerprint &&
    opts.existingFingerprint === fingerprint
  ) {
    return { requestId: opts.existingRequestId, fingerprint };
  }
  return { requestId: opts.createId(), fingerprint };
}

export function validateDeliveryIssueInput(
  reason: string | null | undefined,
  note: string | null | undefined,
): string | null {
  if (!reason || !DELIVERY_ISSUE_REASONS.some(r => r.code === reason)) {
    return 'Select a reason';
  }
  const trimmed = (note ?? '').trim();
  if (isOtherIssueReason(reason) && trimmed.length < 3) {
    return 'Add a short note for Other';
  }
  if (trimmed.length > 500) {
    return 'Note must be 500 characters or fewer';
  }
  return null;
}
