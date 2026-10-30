// URLs carry the return destination across refreshes/new tabs. Scroll offsets are
// kept only in memory, scoped to the signed-in staff account, without storing profile payloads or credentials.
type Position = { memberId: number; y: number; top: number; x: number };
const positions = new Map<string, Position>();
const recent = new Map<string, number>();
const listKey = (userId: number, path: string) => `${userId}:${path}`;

export function safeMemberReturnTo(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 8192 ||
    [...value].some((character) => character.charCodeAt(0) < 32) ||
    value.includes("\\")
  )
    return null;
  if (!/^\/members(?:\?|#|$)/.test(value)) return null;
  const parsed = new URL(value, "https://member-navigation.invalid");
  if (parsed.pathname !== "/members" || (parsed.hash && !/^#member-[1-9]\d*$/.test(parsed.hash)))
    return null;
  return parsed.pathname + parsed.search + parsed.hash;
}

export function memberProfileLink(
  memberId: number,
  listPath: string,
  action: "profile" | "edit" | "workflow" = "profile",
) {
  const returnTo = safeMemberReturnTo(`${listPath.split("#")[0]}#member-${memberId}`) ?? "/members";
  const query = new URLSearchParams();
  if (action === "edit") query.set("edit", "member");
  query.set("returnTo", returnTo);
  return `/members/${memberId}?${query}${action === "workflow" ? "#workflow" : ""}`;
}

export function rememberMemberPosition(
  userId: number,
  path: string,
  memberId: number,
  y: number,
  top: number,
  x = 0,
) {
  const key = listKey(userId, path);
  positions.set(`${key}:${memberId}`, { memberId, y: Math.max(0, y), top, x });
  recent.set(key, memberId);
  while (positions.size > 30) positions.delete(positions.keys().next().value!);
  while (recent.size > 30) recent.delete(recent.keys().next().value!);
}

export function memberReturnPosition(userId: number, path: string, memberId?: number) {
  const key = listKey(userId, path);
  const id = memberId ?? recent.get(key);
  return id ? (positions.get(`${key}:${id}`) ?? null) : null;
}
