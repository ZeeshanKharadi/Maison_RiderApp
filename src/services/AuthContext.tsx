import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loginUser } from './UserService';
import { resetNavigation } from '../navigation/RootNavigation';

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
        const stored = await AsyncStorage.getItem('user');
        if (stored) {
          setUser(JSON.parse(stored));
        }
      } catch (error) {
        console.error('Auth init error:', error);
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
      setUser(userData);
      await AsyncStorage.setItem('user', result.data);
      resetNavigation('MainDrawer');
      return { status: true };
    }
    return { status: false, message: result.message };
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    await AsyncStorage.removeItem('user');
    resetNavigation('login');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        splashDone,
        setSplashDone,
        login,
        logout,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
