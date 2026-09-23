import axios from "axios";

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const apiOrigin = (configuredApiUrl || "http://localhost:4000").replace(/\/+$/, "");
const apiBaseUrl = apiOrigin.endsWith("/api") ? apiOrigin : `${apiOrigin}/api`;

const PUBLIC_PATHS = ["/login", "/reset-password", "/change-password"];

const isPublicPath = (pathname: string) =>
  PUBLIC_PATHS.includes(pathname) ||
  pathname.startsWith("/reset-password/") ||
  pathname.startsWith("/setup-account/");

const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
});

let staffAccessToken: string | null = null;
let memberAccessToken: string | null = null;

export function setAccessToken(token: string | null) {
  staffAccessToken = token;
}

export function setMemberAccessToken(token: string | null) {
  memberAccessToken = token;
}

// Reads a JWT's `exp` claim without verifying the token -- verification happens server-side.
// Used only to schedule a proactive client-side refresh before the token actually expires.
export function decodeJwtExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isMemberRequestUrl(url?: string) {
  return url?.startsWith("/member-auth") || url?.startsWith("/member-portal");
}

api.interceptors.request.use((config) => {
  const token = isMemberRequestUrl(config.url) ? memberAccessToken : staffAccessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// AuthContext and MemberAuthContext both probe their own /refresh endpoint on every page load,
// regardless of which portal is active, so it's normal for exactly one of them to 401 (e.g. a
// staff user has no member session, so /member-auth/refresh always fails for them). Both contexts
// already catch that failure themselves — redirecting here on top of that would bounce a
// perfectly-logged-in user back to /login just because the *other* role's probe failed.
const REFRESH_PROBE_PATHS = ["/auth/refresh", "/member-auth/refresh"];

// Access tokens are short-lived (15 minutes for staff, 10 for members) and only ever refreshed
// once at page load otherwise -- without this, anyone still on a page past that mark gets an
// abrupt 401 and a hard redirect to /login on their very next request, mid-work. These dedupe
// concurrent refresh attempts (several requests can 401 around the same moment) so only one
// /refresh call goes out per token family, and every 401'd request waits on the same result.
let staffRefreshPromise: Promise<string | null> | null = null;
let memberRefreshPromise: Promise<string | null> | null = null;

async function refreshStaffToken(): Promise<string | null> {
  if (!staffRefreshPromise) {
    staffRefreshPromise = api
      .post("/auth/refresh")
      .then((res) => {
        setAccessToken(res.data.accessToken);
        return res.data.accessToken as string;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        staffRefreshPromise = null;
      });
  }
  return staffRefreshPromise;
}

async function refreshMemberToken(): Promise<string | null> {
  if (!memberRefreshPromise) {
    memberRefreshPromise = api
      .post("/member-auth/refresh")
      .then((res) => {
        setMemberAccessToken(res.data.accessToken);
        return res.data.accessToken as string;
      })
      .catch(() => {
        setMemberAccessToken(null);
        return null;
      })
      .finally(() => {
        memberRefreshPromise = null;
      });
  }
  return memberRefreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error?.config;
    const code = error?.response?.data?.error?.code;
    const requestUrl = config?.url ?? "";
    const isRefreshProbe = REFRESH_PROBE_PATHS.some((path) => requestUrl.endsWith(path));
    const isAuthFailure = code === "UNAUTHENTICATED" || error?.response?.status === 401;

    // One retry per request: refresh the relevant token family and replay the original call
    // with it before giving up. config._retried guards against looping if the retried request
    // 401s again (e.g. the refresh session itself is genuinely dead).
    if (
      isAuthFailure &&
      !isRefreshProbe &&
      config &&
      !config._retried &&
      !isPublicPath(window.location.pathname)
    ) {
      config._retried = true;
      const newToken = isMemberRequestUrl(config.url)
        ? await refreshMemberToken()
        : await refreshStaffToken();
      if (newToken) {
        config.headers = { ...config.headers, Authorization: `Bearer ${newToken}` };
        return api.request(config);
      }
    }

    if (isAuthFailure && !isRefreshProbe && !isPublicPath(window.location.pathname)) {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    }

    return Promise.reject(error);
  },
);

export default api;
