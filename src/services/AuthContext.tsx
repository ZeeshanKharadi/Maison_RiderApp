import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as authRepository from '../repositories/authRepository';
import { clearTokens, getAccessToken } from '../api/tokenStorage';
import { loginUser } from './UserService';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
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
        return { status: true };
      }
      return { status: false, message: result.message };
    },
    [persistUser],
  );

  const logout = useCallback(async () => {
    setUser(null);
    await AsyncStorage.removeItem('user');
    await clearTokens();
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
