import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppNotification,
  AppSettings,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  MOCK_APP_NOTIFICATIONS,
  RiderProfile,
} from '../data/account';
import { ApiResult, fail, ok } from './types';

const PROFILE_KEY = '@rapid_delivery/profile';
const SETTINGS_KEY = '@rapid_delivery/settings';
const NOTIF_KEY = '@rapid_delivery/notifications';

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    if (Array.isArray(fallback)) {
      return JSON.parse(raw) as T;
    }
    return { ...(fallback as object), ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

export async function loadProfile(): Promise<ApiResult<RiderProfile>> {
  return ok(await readJson(PROFILE_KEY, DEFAULT_PROFILE));
}

export async function saveProfile(
  profile: RiderProfile,
): Promise<ApiResult<RiderProfile>> {
  try {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return ok(profile);
  } catch {
    return fail('SAVE_FAILED', 'Could not save profile. Please try again.');
  }
}

export async function loadSettings(): Promise<ApiResult<AppSettings>> {
  return ok(await readJson(SETTINGS_KEY, DEFAULT_SETTINGS));
}

export async function saveSettings(
  settings: AppSettings,
): Promise<ApiResult<AppSettings>> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return ok(settings);
  } catch {
    return fail('SAVE_FAILED', 'Could not save settings. Please try again.');
  }
}

export async function loadNotifications(): Promise<
  ApiResult<AppNotification[]>
> {
  return ok(await readJson(NOTIF_KEY, MOCK_APP_NOTIFICATIONS));
}

export async function saveNotifications(
  items: AppNotification[],
): Promise<ApiResult<AppNotification[]>> {
  try {
    await AsyncStorage.setItem(NOTIF_KEY, JSON.stringify(items));
    return ok(items);
  } catch {
    return fail('SAVE_FAILED', 'Could not update notifications.');
  }
}
