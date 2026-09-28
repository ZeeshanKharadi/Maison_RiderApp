import {
  fingerprintIssuePayload,
  resolveIssueRequestId,
  validateDeliveryIssueInput,
} from '../src/delivery/issueReasons';
import { createRequestId } from '../src/repositories/ordersRepository';

describe('delivery issue reporting (client)', () => {
  it('requires a known reason and note for Other', () => {
    expect(validateDeliveryIssueInput(null, '')).toBe('Select a reason');
    expect(validateDeliveryIssueInput('VehicleBroken', 'x')).toBe(
      'Select a reason',
    );
    expect(validateDeliveryIssueInput('Other', '')).toBe(
      'Add a short note for Other',
    );
    expect(validateDeliveryIssueInput('Other', 'ab')).toBe(
      'Add a short note for Other',
    );
    expect(validateDeliveryIssueInput('Other', 'No access code')).toBeNull();
    expect(
      validateDeliveryIssueInput('CustomerUnreachable', ''),
    ).toBeNull();
  });

  it('createRequestId produces stable-format keys for idempotent retries', () => {
    const a = createRequestId();
    const b = createRequestId();
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(a).not.toBe(b);
  });

  it('reuses requestId only for exact same reason+note after uncertain response', () => {
    const first = resolveIssueRequestId({
      existingRequestId: null,
      existingFingerprint: null,
      reason: 'CustomerUnreachable',
      note: 'No answer',
      createId: () => 'req-a',
    });
    expect(first.requestId).toBe('req-a');
    expect(first.fingerprint).toBe(
      fingerprintIssuePayload('CustomerUnreachable', 'No answer'),
    );

    const exactRetry = resolveIssueRequestId({
      existingRequestId: first.requestId,
      existingFingerprint: first.fingerprint,
      reason: 'CustomerUnreachable',
      note: 'No answer',
      createId: () => 'req-b',
    });
    expect(exactRetry.requestId).toBe('req-a');

    const editedReason = resolveIssueRequestId({
      existingRequestId: first.requestId,
      existingFingerprint: first.fingerprint,
      reason: 'AddressIssue',
      note: 'No answer',
      createId: () => 'req-c',
    });
    expect(editedReason.requestId).toBe('req-c');

    const editedNote = resolveIssueRequestId({
      existingRequestId: first.requestId,
      existingFingerprint: first.fingerprint,
      reason: 'CustomerUnreachable',
      note: 'Called twice',
      createId: () => 'req-d',
    });
    expect(editedNote.requestId).toBe('req-d');
  });
});
