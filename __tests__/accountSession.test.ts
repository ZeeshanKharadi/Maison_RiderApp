import {
  profileSeedForUser,
  shouldApplyInboxForRider,
} from '../src/utils/accountSession';
import type { User } from '../src/services/AuthContext';

const riderA: User = {
  id: 'rider-a',
  name: 'Ali',
  email: 'ali@example.com',
  phone: '111',
  emergencyContact: '222',
};

const riderB: User = {
  id: 'rider-b',
  name: 'Bilal',
  email: 'bilal@example.com',
  phone: '333',
  emergencyContact: '444',
};

describe('accountSession rider transitions', () => {
  test('profileSeedForUser clears previous vehicle fields', () => {
    const seeded = profileSeedForUser(riderB, 'en');
    expect(seeded.fullName).toBe('Bilal');
    expect(seeded.email).toBe('bilal@example.com');
    expect(seeded.phone).toBe('333');
    expect(seeded.vehicle).toBe('');
    expect(seeded.vehicleNumber).toBe('');
    expect(seeded.licenseNumber).toBe('');
  });

  test('profileSeedForUser on logout is empty defaults', () => {
    const seeded = profileSeedForUser(null, 'ur');
    expect(seeded.fullName).toBe('');
    expect(seeded.email).toBe('');
    expect(seeded.language).toBe('ur');
  });

  test('late inbox for previous rider is rejected', () => {
    expect(shouldApplyInboxForRider('rider-a', 'rider-b')).toBe(false);
    expect(shouldApplyInboxForRider('rider-a', null)).toBe(false);
    expect(shouldApplyInboxForRider(null, 'rider-b')).toBe(false);
  });

  test('inbox for active rider is accepted', () => {
    expect(shouldApplyInboxForRider('rider-a', 'rider-a')).toBe(true);
    expect(shouldApplyInboxForRider(riderA.id, riderA.id)).toBe(true);
  });
});
