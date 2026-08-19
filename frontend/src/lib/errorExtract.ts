// src/lib/extractError.ts
export function extractError(error: any): string | null {
  const e = error?.response?.data?.error;
  if (!e) return null;
  if (Array.isArray(e) && e.length > 0) return e[0].message;
  if (typeof e === "string") return e;
  if (e?.message) return e.message;
  return null;
}
