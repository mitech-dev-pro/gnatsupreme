export type ApiIssue = { message?: string; field?: string };
export type ApiErrorBody = { message?: string; code?: string; errors?: ApiIssue[] };

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
function body(error: unknown) {
  return record(record(record(error).response).data);
}

/** Read the existing API envelope without trusting network or caught values. */
export function getApiError(error: unknown): ApiErrorBody {
  const data = body(error);
  return {
    message: text(data.message),
    code: text(data.code),
    errors: Array.isArray(data.errors)
      ? data.errors.map((issue: unknown) => ({
          message: text(record(issue).message),
          field: text(record(issue).field),
        }))
      : undefined,
  };
}
export function getApiErrorStatus(error: unknown): number | undefined {
  const status = record(record(error).response).status;
  return typeof status === "number" ? status : undefined;
}
export function getNestedApiErrorCode(error: unknown): string | undefined {
  return text(record(body(error).error).code);
}
export function extractError(error: unknown): string | null {
  const value = body(error).error;
  if (typeof value === "string") return value || null;
  if (Array.isArray(value)) return text(record(value[0]).message) ?? null;
  return text(record(value).message) ?? null;
}
