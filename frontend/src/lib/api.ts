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

api.interceptors.request.use((config) => {
  const isMemberRequest =
    config.url?.startsWith("/member-auth") || config.url?.startsWith("/member-portal");
  const token = isMemberRequest ? memberAccessToken : staffAccessToken;
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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const code = error?.response?.data?.error?.code;
    const requestUrl = error?.config?.url ?? "";
    const isRefreshProbe = REFRESH_PROBE_PATHS.some((path) => requestUrl.endsWith(path));

    if (
      (code === "UNAUTHENTICATED" || error?.response?.status === 401) &&
      !isRefreshProbe &&
      !isPublicPath(window.location.pathname)
    ) {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    }

    return Promise.reject(error);
  },
);

export default api;
