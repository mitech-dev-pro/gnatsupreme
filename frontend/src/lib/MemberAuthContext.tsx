import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import api, { setMemberAccessToken } from "@/lib/api";
import { isMemberPortalPath } from "@/lib/utils";

export type MemberUser = {
  id: number;
  controllerId: string;
  fullName: string;
  status: string;
};

type MemberAuthContextType = {
  member: MemberUser | null;
  isLoading: boolean;
  // null while unknown/loading. Drives the profile-completion gate in MemberProtectedRoute.
  profileComplete: boolean | null;
  markProfileComplete: () => void;
  login: (controllerId: string, password: string) => Promise<MemberUser>;
  setupAccount: (input: {
    controllerId: string;
    fullName: string;
    districtId?: number;
    email: string;
    password: string;
  }) => Promise<MemberUser>;
  forgotPassword: (controllerId: string) => Promise<{ message: string }>;
  resetPassword: (token: string, password: string) => Promise<{ message: string }>;
  logout: () => Promise<void>;
};

const MemberAuthContext = createContext<MemberAuthContextType | undefined>(
  undefined,
);

export function MemberAuthProvider({ children }: { children: ReactNode }) {
  const [member, setMember] = useState<MemberUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const refreshStarted = useRef(false);

  // Runs once per new member session (login, setup, or a page-load refresh) — not on every
  // render — so a stale re-check can't undo the optimistic markProfileComplete() below.
  useEffect(() => {
    if (!member) {
      setProfileComplete(null);
      return;
    }
    api
      .get("/member-portal/profile")
      .then((res) => setProfileComplete(Boolean(res.data.data.profileCompletion?.complete)))
      .catch(() => setProfileComplete(null));
  }, [member?.id]);

  const markProfileComplete = useCallback(() => setProfileComplete(true), []);

  useEffect(() => {
    if (refreshStarted.current) return;
    refreshStarted.current = true;

    if (window.location.pathname !== "/login" && !isMemberPortalPath(window.location.pathname)) {
      setIsLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await api.post("/member-auth/refresh");
        setMemberAccessToken(res.data.accessToken);
        setMember(res.data.member);
      } catch {
        setMemberAccessToken(null);
        setMember(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (controllerId: string, password: string) => {
    const res = await api.post("/member-auth/login", { controllerId, password });
    setMemberAccessToken(res.data.accessToken);
    setMember(res.data.member);
    return res.data.member as MemberUser;
  }, []);

  const setupAccount = useCallback(
    async (input: {
      controllerId: string;
      fullName: string;
      districtId?: number;
      email: string;
      password: string;
    }) => {
      const res = await api.post("/member-auth/setup-account", input);
      setMemberAccessToken(res.data.accessToken);
      setMember(res.data.member);
      return res.data.member as MemberUser;
    },
    [],
  );

  const forgotPassword = useCallback(async (controllerId: string) => {
    const res = await api.post("/member-auth/forgot-password", { controllerId });
    return res.data as { message: string };
  }, []);

  const resetPassword = useCallback(async (token: string, password: string) => {
    const res = await api.post("/member-auth/reset-password", { token, password });
    return res.data as { message: string };
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/member-auth/logout");
    } finally {
      setMemberAccessToken(null);
      setMember(null);
    }
  }, []);

  return (
    <MemberAuthContext.Provider
      value={{
        member,
        isLoading,
        profileComplete,
        markProfileComplete,
        login,
        setupAccount,
        forgotPassword,
        resetPassword,
        logout,
      }}
    >
      {children}
    </MemberAuthContext.Provider>
  );
}

export function useMemberAuth() {
  const ctx = useContext(MemberAuthContext);
  if (!ctx)
    throw new Error("useMemberAuth must be used within a MemberAuthProvider");
  return ctx;
}
