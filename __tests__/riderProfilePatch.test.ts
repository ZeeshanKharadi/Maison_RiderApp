import { buildRiderProfilePatchBody } from '../src/utils/riderProfilePatch';

describe('buildRiderProfilePatchBody', () => {
  test('returns null when nothing changed', () => {
    expect(
      buildRiderProfilePatchBody({
        currentPhone: '03001234567',
        currentEmergency: '03007654321',
        nextPhone: '03001234567',
        nextEmergency: '03007654321',
      }),
    ).toBeNull();
  });

  test('includes only changed phone', () => {
    expect(
      buildRiderProfilePatchBody({
        currentPhone: '03001234567',
        currentEmergency: '03007654321',
        nextPhone: '03331112233',
        nextEmergency: '03007654321',
      }),
    ).toEqual({ phoneNumber: '03331112233' });
  });

  test('includes emergency when cleared to empty', () => {
    expect(
      buildRiderProfilePatchBody({
        currentPhone: '03001234567',
        currentEmergency: '03007654321',
        nextPhone: '03001234567',
        nextEmergency: '',
      }),
    ).toEqual({ emergencyContactNumber: '' });
  });
});
