import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  api,
  clearSession,
  getStoredUser,
  getToken,
  isAdminPortalUser,
  setSession,
  type LoginPayload,
  type UserData,
} from '../api/client';

type AuthState = {
  user: UserData | null;
  token: string | null;
  loading: boolean;
  login: (userid: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserData | null>(() => getStoredUser());
  const [token, setToken] = useState<string | null>(() => getToken());
  const [loading, setLoading] = useState(false);

  const value = useMemo<AuthState>(
    () => ({
      user,
      token,
      loading,
      login: async (userid, password) => {
        setLoading(true);
        try {
          const res = await api<LoginPayload>('/api/User/login', {
            method: 'POST',
            auth: false,
            body: JSON.stringify({ userid, password }),
          });
          if (!res.status || !res.Data?.token || !res.Data.userData) {
            throw new Error(res.message || 'Login failed');
          }
          if (!isAdminPortalUser(res.Data.userData)) {
            throw new Error('This portal is for head office and store managers only.');
          }
          setSession(res.Data.token, res.Data.userData);
          setToken(res.Data.token);
          setUser(res.Data.userData);
        } finally {
          setLoading(false);
        }
      },
      logout: async () => {
        try {
          if (getToken()) {
            await api('/api/User/Logout', { method: 'POST' });
          }
        } catch {
          /* ignore */
        }
        clearSession();
        setToken(null);
        setUser(null);
      },
    }),
    [user, token, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
