type Method = "get" | "post" | "patch" | "put" | "delete";
type Security = "public" | "staff" | "member";

type Endpoint = {
  method: Method;
  path: string;
  summary: string;
  tag: string;
  security?: Security;
};

const endpoints: Endpoint[] = [
  { method: "get", path: "/api/health", summary: "Application and database health", tag: "System", security: "public" },
  { method: "get", path: "/api/public/settings/branding", summary: "Public portal branding", tag: "Settings", security: "public" },
  { method: "post", path: "/api/auth/login", summary: "Staff login", tag: "Staff authentication", security: "public" },
  { method: "post", path: "/api/auth/refresh", summary: "Rotate staff refresh session", tag: "Staff authentication", security: "public" },
  { method: "post", path: "/api/auth/logout", summary: "Staff logout", tag: "Staff authentication", security: "public" },
  { method: "get", path: "/api/auth/me", summary: "Current staff account", tag: "Staff authentication" },
  { method: "post", path: "/api/member-auth/request-otp", summary: "Request member SMS OTP", tag: "Member authentication", security: "public" },
  { method: "post", path: "/api/member-auth/verify-otp", summary: "Verify member SMS OTP", tag: "Member authentication", security: "public" },
  { method: "post", path: "/api/member-auth/refresh", summary: "Rotate member refresh session", tag: "Member authentication", security: "public" },
  { method: "post", path: "/api/member-auth/logout", summary: "Member logout", tag: "Member authentication", security: "public" },
  { method: "get", path: "/api/member-auth/me", summary: "Current member identity", tag: "Member authentication", security: "member" },
  { method: "get", path: "/api/dashboard", summary: "Role-scoped dashboard metrics", tag: "Dashboard" },
  { method: "get", path: "/api/members", summary: "List scoped members", tag: "Members" },
  { method: "post", path: "/api/members", summary: "Enroll a member", tag: "Members" },
  { method: "get", path: "/api/members/{id}", summary: "Get member details", tag: "Members" },
  { method: "patch", path: "/api/members/{id}", summary: "Update member details", tag: "Members" },
  { method: "post", path: "/api/members/{id}/approve", summary: "Approve member enrollment", tag: "Member workflow" },
  { method: "post", path: "/api/members/{id}/return", summary: "Return member for correction", tag: "Member workflow" },
  { method: "post", path: "/api/members/{id}/remove", summary: "Remove member", tag: "Member workflow" },
  { method: "post", path: "/api/members/{id}/verify-phone", summary: "Mark member phone as verified", tag: "Member workflow" },
  { method: "get", path: "/api/members/{id}/workflow", summary: "Member workflow history", tag: "Member workflow" },
  { method: "put", path: "/api/members/{id}/spouse", summary: "Add or replace spouse", tag: "Dependants" },
  { method: "delete", path: "/api/members/{id}/spouse", summary: "Remove spouse", tag: "Dependants" },
  { method: "post", path: "/api/members/{id}/beneficiaries", summary: "Add beneficiary", tag: "Dependants" },
  { method: "patch", path: "/api/members/{id}/beneficiaries/{beneficiaryId}", summary: "Update beneficiary", tag: "Dependants" },
  { method: "delete", path: "/api/members/{id}/beneficiaries/{beneficiaryId}", summary: "Remove beneficiary", tag: "Dependants" },
  { method: "get", path: "/api/members/{id}/files", summary: "List member files", tag: "Files" },
  { method: "post", path: "/api/members/{id}/files", summary: "Upload member file", tag: "Files" },
  { method: "get", path: "/api/files/{storedName}", summary: "Download protected file", tag: "Files" },
  { method: "delete", path: "/api/files/{id}", summary: "Delete member file", tag: "Files" },
  { method: "get", path: "/api/regions", summary: "List regions", tag: "Geography" },
  { method: "post", path: "/api/regions", summary: "Create region", tag: "Geography" },
  { method: "get", path: "/api/districts", summary: "List districts", tag: "Geography" },
  { method: "post", path: "/api/districts", summary: "Create district", tag: "Geography" },
  { method: "get", path: "/api/users", summary: "List staff users", tag: "Staff" },
  { method: "post", path: "/api/users", summary: "Create staff user", tag: "Staff" },
  { method: "get", path: "/api/transfers", summary: "List member transfers", tag: "Transfers" },
  { method: "post", path: "/api/transfers", summary: "Request member transfer", tag: "Transfers" },
  { method: "patch", path: "/api/transfers/{id}/review", summary: "Approve or reject transfer", tag: "Transfers" },
  { method: "patch", path: "/api/transfers/{id}/cancel", summary: "Cancel transfer", tag: "Transfers" },
  { method: "post", path: "/api/imports/report-20", summary: "Upload and reconcile Report 20", tag: "Imports" },
  { method: "post", path: "/api/imports/members", summary: "Stage bulk member import", tag: "Imports" },
  { method: "get", path: "/api/imports/members/{id}/rows", summary: "Review staged member rows", tag: "Imports" },
  { method: "post", path: "/api/imports/members/{id}/commit", summary: "Commit valid member rows", tag: "Imports" },
  { method: "get", path: "/api/change-requests", summary: "List member change requests", tag: "Change requests" },
  { method: "post", path: "/api/change-requests/members/{id}", summary: "Create staff-assisted change request", tag: "Change requests" },
  { method: "patch", path: "/api/change-requests/{id}/review", summary: "Review member change request", tag: "Change requests" },
  { method: "get", path: "/api/benefits/current", summary: "Current benefit plan", tag: "Benefits" },
  { method: "get", path: "/api/benefits/history", summary: "Benefit plan history", tag: "Benefits" },
  { method: "post", path: "/api/benefits", summary: "Publish benefit plan", tag: "Benefits" },
  { method: "get", path: "/api/settings/organization", summary: "Organization settings", tag: "Settings" },
  { method: "patch", path: "/api/settings/organization", summary: "Update organization settings", tag: "Settings" },
  { method: "get", path: "/api/settings/organization/history", summary: "Organization settings history", tag: "Settings" },
  { method: "get", path: "/api/notifications", summary: "Staff notifications", tag: "Notifications" },
  { method: "patch", path: "/api/notifications/{id}/read", summary: "Mark staff notification read", tag: "Notifications" },
  { method: "get", path: "/api/audit-logs", summary: "Scoped audit log", tag: "Audit" },
  { method: "get", path: "/api/reports/membership.csv", summary: "Download membership CSV", tag: "Reports" },
  { method: "get", path: "/api/reports/reconciliation.csv", summary: "Download reconciliation CSV", tag: "Reports" },
  { method: "get", path: "/api/reports/transfers.csv", summary: "Download transfers CSV", tag: "Reports" },
  { method: "get", path: "/api/reports/removals.csv", summary: "Download removals CSV", tag: "Reports" },
  { method: "get", path: "/api/reports/claims.csv", summary: "Download claims CSV", tag: "Reports" },
  { method: "get", path: "/api/member-portal/profile", summary: "Member profile and benefits", tag: "Member portal", security: "member" },
  { method: "get", path: "/api/member-portal/claims", summary: "Member claims", tag: "Member portal", security: "member" },
  { method: "get", path: "/api/member-portal/notifications", summary: "Member notifications", tag: "Member portal", security: "member" },
  { method: "post", path: "/api/member-portal/change-requests", summary: "Submit member change request", tag: "Member portal", security: "member" },
];

function parameters(path: string) {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    name: match[1], in: "path", required: true, schema: match[1]?.toLowerCase().includes("name") ? { type: "string" } : { type: "integer", minimum: 1 },
  }));
}

const paths: Record<string, Record<string, unknown>> = {};
for (const endpoint of endpoints) {
  paths[endpoint.path] ??= {};
  paths[endpoint.path]![endpoint.method] = {
    tags: [endpoint.tag],
    summary: endpoint.summary,
    operationId: `${endpoint.method}_${endpoint.path.replace(/[^a-zA-Z0-9]+/g, "_")}`,
    security: endpoint.security === "public" ? [] : [{ [endpoint.security === "member" ? "memberBearer" : "staffBearer"]: [] }],
    ...(parameters(endpoint.path).length ? { parameters: parameters(endpoint.path) } : {}),
    ...(["post", "patch", "put"].includes(endpoint.method)
      ? { requestBody: { required: false, content: { "application/json": { schema: { type: "object", additionalProperties: true } }, "multipart/form-data": { schema: { type: "object", additionalProperties: true } } } } }
      : {}),
    responses: {
      "200": { description: "Successful response" },
      "201": { description: "Resource created" },
      "400": { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      "401": { description: "Authentication required" },
      "403": { description: "Insufficient permission" },
      "409": { description: "Request conflict" },
    },
  };
}

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "GNAT Supreme Care API",
    version: "1.0.0",
    description: "Single-tenant membership, reconciliation, benefits, claims-routing, and administration API for miLife.",
  },
  servers: [{ url: "/", description: "Current server" }],
  paths,
  components: {
    securitySchemes: {
      staffBearer: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Staff access token" },
      memberBearer: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Member access token" },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["success", "code", "message", "requestId"],
        properties: {
          success: { type: "boolean", const: false },
          code: { type: "string" },
          message: { type: "string" },
          requestId: { type: "string" },
        },
      },
    },
  },
};
