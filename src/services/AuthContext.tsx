import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as accountRepository from '../repositories/accountRepository';
import * as authRepository from '../repositories/authRepository';
import { clearTokens, getAccessToken } from '../api/tokenStorage';
import notificationService from './NotificationService';
import { stopNativeLocationTracking } from './locationTrackingNative';
import { loginUser } from './UserService';
import { shouldRegisterPushToken } from '../utils/pushRegistration';
import { resolveLogoutPushCleanupStatus } from '../utils/logoutCleanup';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  emergencyContact?: string;
  emergencyContactName?: string;
  isAvailableOnline?: boolean;
  currentOnlineStartedAt?: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  splashDone: boolean;
  setSplashDone: (done: boolean) => void;
  login: (
    employeeId: string,
    password: string,
  ) => Promise<{ status: boolean; message?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function serializeUser(user: User): string {
  return JSON.stringify(user);
}

/** Load persisted push preference and sync this device’s server token. */
async function syncPushRegistrationFromStoredPreference(): Promise<void> {
  const loaded = await accountRepository.loadSettings();
  const enabled = loaded.ok
    ? loaded.data.pushNotifications
    : true;
  notificationService.setPushPreferred(enabled);
  if (shouldRegisterPushToken(enabled)) {
    await notificationService.saveTokensToBackend();
  } else {
    await notificationService.removeTokenFromBackend();
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [splashDone, setSplashDone] = useState(false);

  const persistUser = useCallback(async (next: User) => {
    setUser(next);
    await AsyncStorage.setItem('user', serializeUser(next));
  }, []);

  const refreshUser = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;

    const result = await authRepository.fetchCurrentUser();
    if (result.ok) {
      await persistUser(result.data);
      void syncPushRegistrationFromStoredPreference();
    }
  }, [persistUser]);

  useEffect(() => {
    const init = async () => {
      try {
        const [stored, token] = await Promise.all([
          AsyncStorage.getItem('user'),
          getAccessToken(),
        ]);
        if (stored && token) {
          setUser(JSON.parse(stored));
          await refreshUser();
        } else {
          await AsyncStorage.removeItem('user');
          await clearTokens();
        }
      } catch {
        // Keep session empty on corrupt storage
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [refreshUser]);

  const login = useCallback(
    async (employeeId: string, password: string) => {
      const result = await loginUser(employeeId, password);
      if (result.status && result.data) {
        const userData: User = JSON.parse(result.data);
        await persistUser(userData);
        void syncPushRegistrationFromStoredPreference();
        return { status: true };
      }
      return { status: false, message: result.message };
    },
    [persistUser],
  );

  const logout = useCallback(async () => {
    try {
      await stopNativeLocationTracking();
    } catch {
      /* ignore */
    }

    // Revoke this device's FCM registration while the JWT is still valid.
    const deviceToken = await notificationService.peekFcmToken();
    let tokenRemoved = deviceToken == null;

    if (deviceToken) {
      tokenRemoved = await notificationService.removeTokenFromBackend();
    }

    // Same authenticated logout can also revoke the token if DELETE failed.
    const serverLogout = await authRepository.logout(
      !tokenRemoved && deviceToken
        ? { deviceToken }
        : undefined,
    );
    if (serverLogout.ok && deviceToken && !tokenRemoved) {
      tokenRemoved = true;
    }

    // Local sign-out always proceeds.
    setUser(null);
    await AsyncStorage.removeItem('user');
    await clearTokens();

    const cleanup = resolveLogoutPushCleanupStatus({
      hadDeviceToken: deviceToken != null,
      removed: tokenRemoved,
    });
    if (cleanup.kind === 'failed') {
      Alert.alert('Signed out', cleanup.message);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      splashDone,
      setSplashDone,
      login,
      logout,
      refreshUser,
    }),
    [user, isLoading, splashDone, login, logout, refreshUser],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
