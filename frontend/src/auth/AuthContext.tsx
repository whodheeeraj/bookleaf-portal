import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api, clearSession, getToken, readStoredUser, setSession, UNAUTHORIZED_EVENT } from "@/lib/api";
import type { User } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readStoredUser());
  const [token, setToken] = useState<string | null>(() => getToken());
  const [loading, setLoading] = useState<boolean>(() => Boolean(getToken()));

  useEffect(() => {
    const existing = getToken();
    if (!existing) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    api
      .me()
      .then((freshUser) => {
        if (cancelled) return;
        setSession(existing, freshUser);
        setUser(freshUser);
        setToken(existing);
      })
      .catch(() => {
        if (cancelled) return;
        clearSession();
        setUser(null);
        setToken(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      clearSession();
      setUser(null);
      setToken(null);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.login(email, password);
    setSession(response.access_token, response.user);
    setUser(response.user);
    setToken(response.access_token);
    return response.user;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    setToken(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, logout }),
    [user, token, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
