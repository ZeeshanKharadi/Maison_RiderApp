import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  acknowledgeCancellationKeys,
  clearSessionCancellationAlerts,
  getSessionCancellationAlerts,
  loadAcknowledgedCancellationKeys,
  markSessionCancellationAlerts,
} from '../src/repositories/cancellationAckRepository';
import {
  buildCancellationEventKey,
  filterUnacknowledgedCancellationKeys,
} from '../src/utils/cancellationAck';
import { planCancellationAlerts } from '../src/utils/cancellationAlertPlan';

const mockMemory = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockMemory.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockMemory.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockMemory.delete(key);
    }),
    clear: jest.fn(async () => {
      mockMemory.clear();
    }),
  },
}));

describe('cancellationAck keys', () => {
  test('prefers assigned order id', () => {
    expect(
      buildCancellationEventKey({
        backendId: 42,
        externalOrderId: 'EXT-1',
        id: 'EXT-1',
      }),
    ).toBe('ao:42');
  });

  test('filterUnacknowledgedCancellationKeys drops durable acks', () => {
    const keys = ['ao:1', 'ao:2', 'ao:3'];
    const acked = new Set(['ao:2']);
    expect(filterUnacknowledgedCancellationKeys(keys, acked)).toEqual([
      'ao:1',
      'ao:3',
    ]);
  });
});

describe('planCancellationAlerts dedupe', () => {
  test('one cancel → one UI alert key when nothing acked', () => {
    const plan = planCancellationAlerts({
      eventKeys: ['ao:9'],
      durableAcked: new Set(),
      sessionAlerted: new Set(),
      suppressUiAlert: false,
    });
    expect(plan.keysToShowAlert).toEqual(['ao:9']);
    expect(plan.keysNeedingAck).toEqual(['ao:9']);
  });

  test('duplicate delivery in same session does not re-alert', () => {
    const plan = planCancellationAlerts({
      eventKeys: ['ao:9'],
      durableAcked: new Set(),
      sessionAlerted: new Set(['ao:9']),
      suppressUiAlert: false,
    });
    expect(plan.keysToShowAlert).toEqual([]);
    expect(plan.keysNeedingAck).toEqual(['ao:9']);
  });

  test('FCM suppress path still needs durable ack without UI alert', () => {
    const plan = planCancellationAlerts({
      eventKeys: ['ao:9'],
      durableAcked: new Set(),
      sessionAlerted: new Set(),
      suppressUiAlert: true,
    });
    expect(plan.keysToShowAlert).toEqual([]);
    expect(plan.keysNeedingAck).toEqual(['ao:9']);
  });

  test('durable ack hides future alerts (storage success path)', () => {
    const plan = planCancellationAlerts({
      eventKeys: ['ao:9'],
      durableAcked: new Set(['ao:9']),
      sessionAlerted: new Set(),
      suppressUiAlert: false,
    });
    expect(plan.keysToShowAlert).toEqual([]);
    expect(plan.keysNeedingAck).toEqual([]);
  });

  test('storage read failure treated as empty durable → still surfaces cancel', () => {
    const plan = planCancellationAlerts({
      eventKeys: ['ao:11'],
      durableAcked: new Set(),
      sessionAlerted: new Set(),
      suppressUiAlert: false,
    });
    expect(plan.keysToShowAlert).toEqual(['ao:11']);
  });
});

describe('cancellationAckRepository storage failures', () => {
  const userId = 'rider-test-1';

  beforeEach(() => {
    clearSessionCancellationAlerts();
    mockMemory.clear();
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
      mockMemory.get(key) ?? null,
    );
    (AsyncStorage.setItem as jest.Mock).mockImplementation(
      async (key: string, value: string) => {
        mockMemory.set(key, value);
      },
    );
  });

  test('load failure returns empty set (fail open)', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('disk'));
    const keys = await loadAcknowledgedCancellationKeys(userId);
    expect(keys.size).toBe(0);
  });

  test('write failure returns false and does not durable-ack', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk'));
    const ok = await acknowledgeCancellationKeys(userId, ['ao:7']);
    expect(ok).toBe(false);
    const loaded = await loadAcknowledgedCancellationKeys(userId);
    expect(loaded.has('ao:7')).toBe(false);
  });

  test('session markers prevent duplicate UI even when write fails', () => {
    markSessionCancellationAlerts(userId, ['ao:7']);
    expect(getSessionCancellationAlerts(userId).has('ao:7')).toBe(true);
    const plan = planCancellationAlerts({
      eventKeys: ['ao:7'],
      durableAcked: new Set(),
      sessionAlerted: getSessionCancellationAlerts(userId),
      suppressUiAlert: false,
    });
    expect(plan.keysToShowAlert).toEqual([]);
    expect(plan.keysNeedingAck).toEqual(['ao:7']);
  });

  test('successful write then second plan shows no alert', async () => {
    await acknowledgeCancellationKeys(userId, ['ao:5']);
    const durable = await loadAcknowledgedCancellationKeys(userId);
    const plan = planCancellationAlerts({
      eventKeys: ['ao:5'],
      durableAcked: durable,
      sessionAlerted: new Set(),
      suppressUiAlert: false,
    });
    expect(plan.keysToShowAlert).toEqual([]);
  });
});
