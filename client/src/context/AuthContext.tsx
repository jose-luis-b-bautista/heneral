import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, getToken, setToken } from '../services/api';
import type { PublicUser } from '../types';

interface AuthContextValue {
  user: PublicUser | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [token, setTokenState] = useState<string | null>(getToken());
  const [loading, setLoading] = useState(Boolean(getToken()));

  // Restore the profile on first load if we already hold a token.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const { user: profile } = await api.me();
        if (!cancelled) setUser(profile);
      } catch {
        // Expired/invalid token: clear it.
        if (!cancelled) {
          setToken(null);
          setTokenState(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const adopt = useCallback((newToken: string, profile: PublicUser) => {
    setToken(newToken);
    setTokenState(newToken);
    setUser(profile);
    setLoading(false);
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const { token: t, user: profile } = await api.login(username, password);
      adopt(t, profile);
    },
    [adopt],
  );

  const register = useCallback(
    async (username: string, password: string) => {
      const { token: t, user: profile } = await api.register(username, password);
      adopt(t, profile);
    },
    [adopt],
  );

  const logout = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    const { user: profile } = await api.me();
    setUser(profile);
  }, [token]);

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout, refresh }),
    [user, token, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
