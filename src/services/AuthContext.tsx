import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearTokens, getAccessToken } from '../api/tokenStorage';
import { loginUser } from './UserService';

export interface User {
  id: string;
  name: string;
  email: string;
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const [stored, token] = await Promise.all([
          AsyncStorage.getItem('user'),
          getAccessToken(),
        ]);
        if (stored && token) {
          setUser(JSON.parse(stored));
        } else {
          // Stale mock session without JWT — force fresh login
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
  }, []);

  const login = useCallback(async (employeeId: string, password: string) => {
    const result = await loginUser(employeeId, password);
    if (result.status && result.data) {
      const userData: User = JSON.parse(result.data);
      await AsyncStorage.setItem('user', result.data);
      setUser(userData);
      // App.tsx remounts the authenticated stack when `user` is set.
      // Do not resetNavigation here — MainDrawer is not on the login stack yet.
      return { status: true };
    }
    return { status: false, message: result.message };
  }, []);

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
    }),
    [user, isLoading, splashDone, login, logout],
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
