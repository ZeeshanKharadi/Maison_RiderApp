import {
  APP_SUPPORT_EMAIL,
  APP_SUPPORT_PHONE,
  APP_SUPPORT_PHONE_E164,
} from '../src/constants/app';
import {
  buildSupportMailtoUrl,
  resolveSupportContact,
} from '../src/support/supportContact';

describe('resolveSupportContact', () => {
  test('uses configured email and phone from app constants', () => {
    const contact = resolveSupportContact();
    expect(contact.kind).toBe('available');
    if (contact.kind !== 'available') return;
    expect(contact.email).toEqual({
      address: APP_SUPPORT_EMAIL,
      mailtoUrl: `mailto:${APP_SUPPORT_EMAIL}`,
    });
    expect(contact.phone?.display).toBe(APP_SUPPORT_PHONE);
    expect(contact.phone?.telUrl).toBe(
      `tel:${APP_SUPPORT_PHONE_E164.replace(/[^\d+]/g, '')}`,
    );
    expect(APP_SUPPORT_EMAIL).toBe('umerahsan2001@gmail.com');
    expect(APP_SUPPORT_PHONE).toBe('0334-3070373');
  });

  test('accepts explicit email and phone overrides', () => {
    const contact = resolveSupportContact(
      'ops@example.com',
      '0334-3070373',
      '+92-3343070373',
    );
    expect(contact.kind).toBe('available');
    if (contact.kind !== 'available') return;
    expect(contact.email?.mailtoUrl).toBe('mailto:ops@example.com');
    expect(contact.phone?.telUrl).toBe('tel:+923343070373');
  });

  test('reports unavailable without inventing a contact', () => {
    const contact = resolveSupportContact('', '', '');
    expect(contact.kind).toBe('unavailable');
    if (contact.kind !== 'unavailable') return;
    expect(contact.missing).toEqual(
      expect.arrayContaining([
        'support email (APP_SUPPORT_EMAIL)',
        'support phone number',
      ]),
    );
  });

  test('buildSupportMailtoUrl encodes subject for feedback drafts', () => {
    expect(
      buildSupportMailtoUrl('ops@example.com', {
        subject: 'Maison Delivery App — Rider feedback',
      }),
    ).toBe(
      'mailto:ops@example.com?subject=Maison%20Delivery%20App%20%E2%80%94%20Rider%20feedback',
    );
  });
});
