import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import api, { decodeJwtExpiry, setAccessToken } from "@/lib/api";
import { isMemberPortalPath } from "@/lib/utils";

export type AuthUser = {
  id: number;
  fullName: string;
  email: string;
  role: string;
  regionId: number | null;
  districtId: number | null;
};

type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// How long before the access token's real expiry to proactively refresh it, so an active
// session never gets caught by surprise mid-request. If the token's remaining lifetime is
// already shorter than this (shouldn't happen with the current 15-minute TTL, but safe either
// way), the delay clamps to a small positive number instead of firing immediately/negatively.
const REFRESH_BUFFER_MS = 2 * 60 * 1_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshStarted = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback((token: string) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const expiresAt = decodeJwtExpiry(token);
    if (!expiresAt) return;
    const delay = Math.max(expiresAt - Date.now() - REFRESH_BUFFER_MS, 5_000);
    refreshTimer.current = setTimeout(() => {
      (async () => {
        try {
          const res = await api.post("/auth/refresh");
          setAccessToken(res.data.accessToken);
          setUser(res.data.user);
          scheduleRefresh(res.data.accessToken);
        } catch {
          setAccessToken(null);
          setUser(null);
        }
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, delay);
  }, []);

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  useEffect(() => {
    if (refreshStarted.current) return;
    refreshStarted.current = true;

    if (isMemberPortalPath(window.location.pathname)) {
      setIsLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await api.post("/auth/refresh");
        setAccessToken(res.data.accessToken);
        setUser(res.data.user);
        scheduleRefresh(res.data.accessToken);
      } catch {
        setAccessToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [scheduleRefresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post("/auth/login", { email, password });
      setAccessToken(res.data.accessToken);
      setUser(res.data.user);
      scheduleRefresh(res.data.accessToken);
      return res.data.user as AuthUser;
    },
    [scheduleRefresh],
  );

  const logout = useCallback(async () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    try {
      await api.post("/auth/logout");
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
