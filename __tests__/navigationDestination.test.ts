import {
  buildGoogleMapsSearchDestinationUrl,
  isUsablePhone,
  isUsableStreetAddress,
  openNavigationPlan,
  resolveNavigationPlan,
} from '../src/delivery/navigationDestination';

describe('isUsableStreetAddress', () => {
  test('accepts a normal street address', () => {
    expect(isUsableStreetAddress('88 Maple Ave, Apt 4B')).toBe(true);
  });

  test('rejects placeholders and store labels', () => {
    expect(isUsableStreetAddress(null)).toBe(false);
    expect(isUsableStreetAddress('')).toBe(false);
    expect(isUsableStreetAddress('  ')).toBe(false);
    expect(isUsableStreetAddress('Address unavailable')).toBe(false);
    expect(isUsableStreetAddress('—')).toBe(false);
    expect(isUsableStreetAddress('Store 12')).toBe(false);
  });
});

describe('resolveNavigationPlan', () => {
  test('uses valid coordinates', () => {
    const plan = resolveNavigationPlan({
      lat: 24.8607,
      lng: 67.0011,
      address: 'Should not be used',
    });
    expect(plan.kind).toBe('coordinates');
    if (plan.kind !== 'coordinates') return;
    expect(plan.latitude).toBe(24.8607);
    expect(plan.longitude).toBe(67.0011);
    expect(plan.url).toContain('destination=24.8607%2C67.0011');
    expect(plan.url).toContain('travelmode=driving');
  });

  test('treats 0,0 as unavailable coordinates and falls back to address', () => {
    const plan = resolveNavigationPlan({
      lat: 0,
      lng: 0,
      address: '142 Oak St, Downtown',
    });
    expect(plan.kind).toBe('address');
    if (plan.kind !== 'address') return;
    expect(plan.address).toBe('142 Oak St, Downtown');
    expect(plan.url).toBe(
      buildGoogleMapsSearchDestinationUrl('142 Oak St, Downtown'),
    );
  });

  test('rejects out-of-range coordinates and uses address', () => {
    const plan = resolveNavigationPlan({
      lat: 91,
      lng: 200,
      address: '210 River Rd',
    });
    expect(plan.kind).toBe('address');
    if (plan.kind !== 'address') return;
    expect(plan.address).toBe('210 River Rd');
  });

  test('address fallback when coordinates are missing', () => {
    const plan = resolveNavigationPlan({
      lat: null,
      lng: null,
      address: '5 Market Square',
    });
    expect(plan.kind).toBe('address');
    if (plan.kind !== 'address') return;
    expect(plan.url).toContain(encodeURIComponent('5 Market Square'));
  });

  test('no destination when coords and address are both missing', () => {
    const plan = resolveNavigationPlan({
      lat: 0,
      lng: 0,
      address: 'Address unavailable',
      contactPhone: '+1 (555) 201-8841',
      contactLabel: 'Call customer',
    });
    expect(plan.kind).toBe('unavailable');
    if (plan.kind !== 'unavailable') return;
    expect(plan.title).toBe('Navigation unavailable');
    expect(plan.message).toMatch(/coordinates or street address/i);
    expect(plan.contact).toEqual({
      phone: '+1 (555) 201-8841',
      label: 'Call customer',
    });
  });

  test('unavailable without contact when phone is missing', () => {
    const plan = resolveNavigationPlan({
      address: 'Store 3',
      contactPhone: '—',
    });
    expect(plan.kind).toBe('unavailable');
    if (plan.kind !== 'unavailable') return;
    expect(plan.contact).toBeNull();
  });

  test('includes origin when opening coordinate directions', () => {
    const plan = resolveNavigationPlan(
      { lat: 24.87, lng: 67.02 },
      { latitude: 24.86, longitude: 67.0 },
    );
    expect(plan.kind).toBe('coordinates');
    if (plan.kind !== 'coordinates') return;
    expect(plan.url).toContain('origin=');
    expect(plan.url).toContain('destination=');
  });
});

describe('openNavigationPlan', () => {
  test('offers Call when destination is unavailable', async () => {
    const openURL = jest.fn(async () => undefined);
    const alert = jest.fn();
    await openNavigationPlan(
      {
        kind: 'unavailable',
        title: 'Navigation unavailable',
        message: 'No destination',
        contact: { phone: '+15551212', label: 'Call customer' },
      },
      {
        canOpenURL: async () => false,
        openURL,
        alert,
      },
    );
    expect(alert).toHaveBeenCalledWith(
      'Navigation unavailable',
      'No destination',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ text: 'Call customer' }),
      ]),
    );
    const buttons = alert.mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    buttons.find(b => b.text === 'Call customer')?.onPress?.();
    expect(openURL).toHaveBeenCalledWith('tel:+15551212');
  });

  test('opens maps URL for coordinate plans', async () => {
    const openURL = jest.fn(async () => undefined);
    const canOpenURL = jest.fn(async () => true);
    await openNavigationPlan(
      {
        kind: 'coordinates',
        latitude: 1,
        longitude: 2,
        url: 'https://www.google.com/maps/dir/?api=1&destination=1%2C2',
      },
      { canOpenURL, openURL, alert: jest.fn() },
    );
    expect(openURL).toHaveBeenCalledWith(
      'https://www.google.com/maps/dir/?api=1&destination=1%2C2',
    );
  });
});

describe('isUsablePhone', () => {
  test('detects usable phones', () => {
    expect(isUsablePhone('+1 (555) 201-8841')).toBe(true);
    expect(isUsablePhone('—')).toBe(false);
    expect(isUsablePhone('')).toBe(false);
  });
});
