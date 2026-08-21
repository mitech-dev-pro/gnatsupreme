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

export type MemberUser = {
  id: number;
  controllerId: string;
  fullName: string;
  status: string;
};

type MemberAuthContextType = {
  member: MemberUser | null;
  isLoading: boolean;
  requestOtp: (
    controllerId: string,
  ) => Promise<{ challengeToken: string; message: string }>;
  verifyOtp: (challengeToken: string, otp: string) => Promise<MemberUser>;
  logout: () => Promise<void>;
};

const MemberAuthContext = createContext<MemberAuthContextType | undefined>(
  undefined,
);

export function MemberAuthProvider({ children }: { children: ReactNode }) {
  const [member, setMember] = useState<MemberUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshStarted = useRef(false);

  useEffect(() => {
    if (refreshStarted.current) return;
    refreshStarted.current = true;

    if (window.location.pathname !== "/login" && !window.location.pathname.startsWith("/member")) {
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

  const requestOtp = useCallback(async (controllerId: string) => {
    const res = await api.post("/member-auth/request-otp", { controllerId });
    return res.data as { challengeToken: string; message: string };
  }, []);

  const verifyOtp = useCallback(async (challengeToken: string, otp: string) => {
    const res = await api.post("/member-auth/verify-otp", {
      challengeToken,
      otp,
    });
    setMemberAccessToken(res.data.accessToken);
    setMember(res.data.member);
    return res.data.member as MemberUser;
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
      value={{ member, isLoading, requestOtp, verifyOtp, logout }}
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
