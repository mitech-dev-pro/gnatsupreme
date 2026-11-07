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
  // Nullable -- a bulk-created GNAT account has no confirmed email yet and logs in by phone
  // instead. setupRequired is the server-enforced gate; pendingEmail lets the setup screen
  // prefill a re-run instead of asking the person to retype it. See the backend's
  // account-states table (middleware/authenticate.ts, modules/auth/auth.routes.ts).
  email: string | null;
  pendingEmail?: string | null;
  setupRequired: boolean;
  role: string;
  // A region/district can legitimately appear in more than one admin's array (e.g. a shared
  // jurisdiction) -- see backend schema.prisma's note on User.regionIds/districtIds.
  regionIds: number[];
  districtIds: number[];
};

export type LoginCredentials = { email: string; phone?: never } | { phone: string; email?: never };

// Mirrors the backend's own isPending() (modules/users/user.routes.ts): setupRequired alone
// misses S1 (setup already done, email still unconfirmed, setupRequired already false) -- any
// code deciding whether to route someone back to /staff-setup needs this, not just
// setupRequired on its own.
export function isAccountPending(user: Pick<AuthUser, "setupRequired" | "email">): boolean {
  return user.setupRequired || user.email === null;
}

type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (credentials: LoginCredentials, password: string) => Promise<AuthUser>;
  forgotPassword: (email: string) => Promise<{ message: string }>;
  resetPassword: (token: string, password: string) => Promise<{ message: string }>;
  completeSetup: (data: {
    currentPassword: string;
    newPassword?: string;
    email?: string;
  }) => Promise<AuthUser>;
  confirmEmail: (token: string) => Promise<{ message: string }>;
  resendVerificationEmail: () => Promise<AuthUser>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// How long before the access token's real expiry to proactively refresh it, so an active
// session never gets caught by surprise mid-request. If the token's remaining lifetime is
// already shorter than this (shouldn't happen with the current 15-minute TTL, but safe either
// way), the delay clamps to a small positive number instead of firing immediately/negatively.
const REFRESH_BUFFER_MS = 2 * 60 * 1_000;

// Tokens live only in a module-level JS variable per tab (api.ts), with no shared storage --
// logging out in one tab otherwise leaves every other open tab still rendering as authenticated
// (and able to submit requests) until its next API call 401s. This broadcasts the logout so
// every other tab clears its own state immediately, same-origin only by construction.
const LOGOUT_CHANNEL_NAME = "gnat-staff-logout";
const logoutChannel =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(LOGOUT_CHANNEL_NAME) : null;

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
    if (!logoutChannel) return;
    const onMessage = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      setAccessToken(null);
      setUser(null);
    };
    logoutChannel.addEventListener("message", onMessage);
    return () => logoutChannel.removeEventListener("message", onMessage);
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
    async (credentials: LoginCredentials, password: string) => {
      const res = await api.post("/auth/login", { ...credentials, password });
      setAccessToken(res.data.accessToken);
      setUser(res.data.user);
      scheduleRefresh(res.data.accessToken);
      return res.data.user as AuthUser;
    },
    [scheduleRefresh],
  );

  const forgotPassword = useCallback(async (email: string) => {
    const res = await api.post("/auth/forgot-password", { email });
    return res.data as { message: string };
  }, []);

  const resetPassword = useCallback(async (token: string, password: string) => {
    const res = await api.post("/auth/reset-password", { token, password });
    return res.data as { message: string };
  }, []);

  const completeSetup = useCallback(
    async (data: { currentPassword: string; newPassword?: string; email?: string }) => {
      const res = await api.post("/auth/complete-setup", data);
      setAccessToken(res.data.accessToken);
      setUser(res.data.user);
      scheduleRefresh(res.data.accessToken);
      return res.data.user as AuthUser;
    },
    [scheduleRefresh],
  );

  const confirmEmail = useCallback(async (token: string) => {
    const res = await api.post("/auth/confirm-email", { token });
    return res.data as { message: string };
  }, []);

  const resendVerificationEmail = useCallback(async () => {
    const res = await api.post("/auth/resend-verification-email");
    setAccessToken(res.data.accessToken);
    setUser(res.data.user);
    scheduleRefresh(res.data.accessToken);
    return res.data.user as AuthUser;
  }, [scheduleRefresh]);

  const logout = useCallback(async () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    try {
      await api.post("/auth/logout");
    } finally {
      setAccessToken(null);
      setUser(null);
      logoutChannel?.postMessage("logout");
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        forgotPassword,
        resetPassword,
        completeSetup,
        confirmEmail,
        resendVerificationEmail,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
