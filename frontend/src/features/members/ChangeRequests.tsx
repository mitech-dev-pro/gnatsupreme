import ActionMenu from "@/components/ui/ActionMenu";
import ReviewDecisionDialog from "@/components/ui/ReviewDecisionDialog";
import Dropdown from "@/components/ui/Dropdown";
import { Alert, EmptyState } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import StatusBadge from "@/components/ui/StatusBadge";
import api from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { getApiError } from "@/lib/errorExtract";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "./ChangeRequests.css";

type RequestItem = {
  updatedAt?: string;
  id: number;
  type: string;
  status: string;
  proposedData: Record<string, unknown> | null;
  targetBeneficiaryId: number | null;
  requestNote: string | null;
  reviewNote: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  member: { id: number; controllerId: string; fullName: string; status: string };
  requestedBy: { id: number; fullName: string } | null;
  reviewedBy: { id: number; fullName: string } | null;
};
type MemberData = {
  id: number;
  fullName: string;
  ghanaCardId: string | null;
  phone: string | null;
  school: string;
  spouse: Record<string, unknown> | null;
  beneficiaries: Array<Record<string, unknown> & { id: number; fullName: string }>;
};
type Decision = "APPROVE" | "RETURN" | "REJECT";

const TYPES = [
  "MEMBER_DETAILS",
  "SPOUSE",
  "BENEFICIARY_ADD",
  "BENEFICIARY_UPDATE",
  "BENEFICIARY_REMOVE",
];
const STATUSES = ["PENDING", "APPROVED", "RETURNED", "REJECTED", "CANCELLED"];
const REVIEW_ROLES = ["SUPER_ADMIN", "NATIONAL_ADMIN", "REGIONAL_ADMIN", "DISTRICT_ADMIN"];
const labels: Record<string, string> = {
  MEMBER_DETAILS: "Member details",
  SPOUSE: "Spouse details",
  BENEFICIARY_ADD: "Add beneficiary",
  BENEFICIARY_UPDATE: "Update beneficiary",
  BENEFICIARY_REMOVE: "Remove beneficiary",
  fullName: "Full name",
  dateOfBirth: "Date of birth",
  ghanaCardId: "Ghana Card ID",
  phone: "Phone",
  school: "School",
  relationship: "Relationship",
  trusteeName: "Trustee name",
  trusteeGhanaCardId: "Trustee Ghana Card ID",
};
const pretty = (value: unknown) =>
  value === null || value === undefined || value === ""
    ? "Not provided"
    : typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)
      ? new Date(value).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : String(value).replaceAll("_", " ");
const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const statusTone = (status: string): "neutral" | "success" | "warning" | "danger" =>
  status === "APPROVED"
    ? "success"
    : status === "PENDING" || status === "RETURNED"
      ? "warning"
      : status === "CANCELLED"
        ? "neutral"
        : "danger";

export default function ChangeRequests() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const requestId = /^[1-9]\d*$/.test(params.get("request") ?? "")
    ? Number(params.get("request"))
    : undefined;
  const status =
    params.get("status") === "ALL" || requestId ? "" : (params.get("status") ?? "PENDING");
  const type = params.get("type") ?? "";
  const rawPage = Number(params.get("page"));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = 10;
  const request = useRef<AbortController | null>(null);
  const selectedRef = useRef<number | null>(null);
  const actionLock = useRef(false);
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  const [memberError, setMemberError] = useState("");
  const [detailRetry, setDetailRetry] = useState(0);
  const [items, setItems] = useState<RequestItem[]>([]);
  const [selected, setSelected] = useState<RequestItem | null>(null);
  const [member, setMember] = useState<MemberData | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDecision, setBulkDecision] = useState<Decision | null>(null);
  const [bulkNote, setBulkNote] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    requested: number;
    succeeded: number;
    failed: number;
    results: Array<{ id: number; success: boolean; message?: string }>;
  } | null>(null);
  const canReview = Boolean(user && REVIEW_ROLES.includes(user.role));

  const updateParams = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    if ("status" in values || "type" in values) next.delete("request");
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    setParams(next);
  };
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const previousId = selectedRef.current;
    setSelected(null);
    setDecision(null);
    setLoading(true);
    setError("");
    setSelectedIds(new Set());
    setBulkDecision(null);
    setBulkNote("");
    try {
      const response = await api.get("/change-requests", {
        signal: controller.signal,
        params: { requestId, page, limit, status: status || undefined, type: type || undefined },
      });
      if (controller.signal.aborted) return;
      const pages = Math.max(1, response.data.pagination.totalPages);
      if (page > pages) {
        setParams(
          (previous) => {
            const nextParams = new URLSearchParams(previous);
            nextParams.set("page", String(pages));
            return nextParams;
          },
          { replace: true },
        );
        return;
      }
      const next = response.data.data as RequestItem[];
      setItems(next);
      setTotal(response.data.pagination.total);
      setTotalPages(Math.max(1, response.data.pagination.totalPages));
      setSelected(() => next.find((item) => item.id === previousId) ?? next[0] ?? null);
    } catch {
      if (!controller.signal.aborted) {
        setItems([]);
        setError("Change requests could not be loaded.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [page, status, type, requestId, setParams]);

  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);
  useEffect(() => {
    setBulkResult(null);
    setSuccess("");
  }, [status, type]);
  useEffect(() => {
    if (!selected) {
      setMember(null);
      return;
    }
    let cancelled = false;
    setMember(null);
    setMemberError("");
    setDetailLoading(true);
    api
      .get(`/members/${selected.member.id}`)
      .then((response) => {
        if (!cancelled) setMember(response.data.data);
      })
      .catch(() => {
        if (!cancelled) {
          setMember(null);
          setMemberError(
            "The current member details could not be loaded. Please try again before reviewing this request.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, detailRetry]);

  useEffect(() => {
    selectedRef.current = selected?.id ?? null;
  }, [selected]);

  const currentSource = () => {
    if (!member || !selected) return {};
    if (selected.type === "MEMBER_DETAILS") return member as unknown as Record<string, unknown>;
    if (selected.type === "SPOUSE") return member.spouse ?? {};
    if (selected.type.includes("BENEFICIARY") && selected.targetBeneficiaryId)
      return member.beneficiaries.find((item) => item.id === selected.targetBeneficiaryId) ?? {};
    return {};
  };
  const source = currentSource();
  const proposed = selected?.proposedData ?? {};
  const compareKeys = (
    selected?.type === "BENEFICIARY_REMOVE" ? Object.keys(source) : Object.keys(proposed)
  ).filter((key) => !["id", "memberId", "createdAt", "updatedAt"].includes(key));

  const review = async () => {
    if (!selected || !decision || memberError || detailLoading || actionLock.current) return;
    if (decision !== "APPROVE" && !reviewNote.trim()) {
      setActionError("A review note is required when returning or rejecting a request.");
      return;
    }
    actionLock.current = true;
    setBusy(true);
    setActionError("");
    try {
      await api.patch(`/change-requests/${selected.id}/review`, {
        ...(selected.updatedAt ? { expectedUpdatedAt: selected.updatedAt } : {}),
        action: decision,
        note: reviewNote.trim() || null,
      });
      setDecision(null);
      setReviewNote("");
      setSuccess(`Request for ${selected.member.fullName} reviewed successfully.`);
      await load();
    } catch (requestError: unknown) {
      setActionError(getApiError(requestError)?.message || "The review could not be completed.");
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };

  const pendingVisibleIds = items
    .filter((item) => item.status === "PENDING")
    .map((item) => item.id);
  const allVisiblePendingSelected =
    pendingVisibleIds.length > 0 && pendingVisibleIds.every((id) => selectedIds.has(id));
  const toggleSelectAll = () =>
    setSelectedIds(allVisiblePendingSelected ? new Set() : new Set(pendingVisibleIds));
  const toggleOne = (id: number) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulkReview = async () => {
    if (!bulkDecision || selectedIds.size === 0 || actionLock.current) return;
    if (bulkDecision !== "APPROVE" && !bulkNote.trim()) {
      setActionError("A review note is required when returning or rejecting requests.");
      return;
    }
    actionLock.current = true;
    setBulkBusy(true);
    setActionError("");
    setBulkResult(null);
    try {
      const response = await api.post("/change-requests/bulk/review", {
        changeRequestIds: [...selectedIds],
        ...(items.some((item) => selectedIds.has(item.id) && item.updatedAt)
          ? {
              versions: Object.fromEntries(
                items
                  .filter((item) => selectedIds.has(item.id) && item.updatedAt)
                  .map((item) => [String(item.id), item.updatedAt]),
              ),
            }
          : {}),
        action: bulkDecision,
        note: bulkNote.trim() || null,
      });
      setBulkResult(response.data.data);
      setBulkDecision(null);
      setBulkNote("");
      setSelectedIds(new Set());
      await load();
    } catch (requestError: unknown) {
      setActionError(
        getApiError(requestError)?.message || "The bulk review could not be completed.",
      );
    } finally {
      actionLock.current = false;
      setBulkBusy(false);
    }
  };

  return (
    <main className="change-page">
      <PageHeader
        eyebrow="Member administration"
        title="Change requests"
        description={`${total.toLocaleString()} ${status ? status.toLowerCase() : "matching"} request${total === 1 ? "" : "s"} in your access scope`}
      />
      {success && (
        <div className="mb-3">
          <Alert tone="success">{success}</Alert>
        </div>
      )}
      {decision && selected && (
        <ReviewDecisionDialog
          title={
            decision === "APPROVE"
              ? "Approve change request"
              : decision === "RETURN"
                ? "Return change request for correction"
                : "Reject change request"
          }
          description={`${selected.member.fullName} · ${selected.member.controllerId} · Request #${selected.id}`}
          help="Approval updates the member record immediately. Return and rejection notes are visible to the member."
          decision={decision}
          note={reviewNote}
          onNote={setReviewNote}
          busy={busy}
          error={actionError}
          onClose={() => {
            setDecision(null);
            setReviewNote("");
          }}
          onConfirm={() => void review()}
        />
      )}
      {bulkDecision && (
        <ReviewDecisionDialog
          title={`Review ${selectedIds.size} selected requests`}
          description={
            <ul className="max-h-32 overflow-y-auto">
              {items
                .filter((item) => selectedIds.has(item.id))
                .map((item) => (
                  <li key={item.id}>
                    {item.member.fullName} · Request #{item.id}
                  </li>
                ))}
            </ul>
          }
          help={`${bulkDecision === "APPROVE" ? "Approval updates the selected member records immediately." : "The same review note will be sent for each selected request."} Each request is checked individually and any failures will be reported.`}
          decision={bulkDecision}
          note={bulkNote}
          onNote={setBulkNote}
          busy={bulkBusy}
          error={actionError}
          onClose={() => {
            setBulkDecision(null);
            setBulkNote("");
          }}
          onConfirm={() => void bulkReview()}
        />
      )}
      {requestId && (
        <Link
          to="/change-requests?status=ALL"
          className="mb-3 inline-block text-sm text-action-primary"
        >
          Show all requests
        </Link>
      )}
      <div className="change-filters" aria-label="Change request filters">
        <Dropdown
          aria-label="Filter by status"
          className="w-48"
          value={status}
          onChange={(value) => updateParams({ status: value || "ALL", page: null })}
          options={[
            { value: "", label: "All statuses" },
            ...STATUSES.map((item) => ({
              value: item,
              label: item.charAt(0) + item.slice(1).toLowerCase(),
            })),
          ]}
        />
        <Dropdown
          aria-label="Filter by request type"
          className="w-56"
          value={type}
          onChange={(value) => updateParams({ type: value || null, page: null })}
          options={[
            { value: "", label: "All request types" },
            ...TYPES.map((item) => ({ value: item, label: labels[item] })),
          ]}
        />
      </div>
      {error && (
        <div className="mb-3">
          <Alert tone="error">
            {error}{" "}
            <button type="button" className="underline" onClick={() => void load()}>
              Try again
            </button>
          </Alert>
        </div>
      )}
      <div className="change-workspace">
        <section className="change-queue" aria-labelledby="request-queue-heading">
          <div className="change-queue__title">
            <h2 id="request-queue-heading">Requests</h2>
            <span aria-label={`${total} requests`}>{total}</span>
          </div>
          {canReview && pendingVisibleIds.length > 0 && (
            <label className="change-select-all">
              <input
                type="checkbox"
                checked={allVisiblePendingSelected}
                onChange={toggleSelectAll}
              />
              Select all pending on this page ({pendingVisibleIds.length})
            </label>
          )}
          {selectedIds.size > 0 && (
            <div className="change-bulkbar">
              <strong>{selectedIds.size} selected</strong>
              <ActionMenu
                label="Actions for selected requests"
                items={(["APPROVE", "RETURN", "REJECT"] as const).map((value) => ({
                  label:
                    value === "APPROVE"
                      ? "Approve"
                      : value === "RETURN"
                        ? "Return for correction"
                        : "Reject",
                  onSelect: () => {
                    setDecision(null);
                    setActionError("");
                    setBulkNote("");
                    setBulkDecision(value);
                  },
                }))}
              />
            </div>
          )}
          {bulkResult && (
            <div className="change-bulk-result">
              <strong>
                {bulkResult.succeeded} of {bulkResult.requested} applied.
              </strong>
              {bulkResult.failed > 0 && (
                <ul>
                  {bulkResult.results
                    .filter((item) => !item.success)
                    .map((item) => (
                      <li key={item.id}>
                        Request #{item.id}: {item.message}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
          {loading ? (
            <div className="change-skeleton" role="status" aria-label="Loading requests">
              {Array.from({ length: 5 }).map((_, index) => (
                <span key={index} />
              ))}
            </div>
          ) : error ? null : items.length === 0 ? (
            <EmptyState
              title="No requests found"
              description="Requests matching these filters will appear here."
            />
          ) : (
            <ul>
              {items.map((item, index) => (
                <li key={item.id} className={selectedIds.has(item.id) ? "is-selected" : ""}>
                  {canReview && item.status === "PENDING" && (
                    <input
                      type="checkbox"
                      className="change-check"
                      aria-label={`Select ${item.member.fullName}'s request`}
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleOne(item.id)}
                    />
                  )}
                  <button
                    type="button"
                    aria-pressed={selected?.id === item.id}
                    className={selected?.id === item.id ? "active" : ""}
                    onClick={() => {
                      setSelected(item);
                      setDecision(null);
                      setReviewNote("");
                    }}
                  >
                    <span className="change-type">
                      No. {(page - 1) * limit + index + 1} · {labels[item.type]}
                    </span>
                    <strong>{item.member.fullName}</strong>
                    <small>
                      {item.member.controllerId} · Requested {date(item.requestedAt)}
                    </small>
                    <StatusBadge tone={statusTone(item.status)}>
                      {item.status.charAt(0) + item.status.slice(1).toLowerCase()}
                    </StatusBadge>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {totalPages > 1 && (
            <div className="px-3 pb-3">
              <Pagination
                page={page}
                totalPages={totalPages}
                totalItems={total}
                itemLabel="requests"
                onPageChange={(nextPage) => updateParams({ page: String(nextPage) })}
              />
            </div>
          )}
        </section>

        <section className="change-detail" aria-live="polite">
          {!selected ? (
            <div className="change-empty">
              <strong>Select a request</strong>
              <p>Choose a request to inspect its proposed changes.</p>
            </div>
          ) : memberError ? (
            <Alert tone="error">
              {memberError}{" "}
              <button
                type="button"
                className="underline"
                onClick={() => setDetailRetry((value) => value + 1)}
              >
                Try again
              </button>
            </Alert>
          ) : detailLoading ? (
            <div className="change-detail-skeleton" aria-label="Loading request details">
              <span />
              <span />
              <span />
            </div>
          ) : (
            <>
              <header>
                <div>
                  <span>{labels[selected.type]}</span>
                  <h2>{selected.member.fullName}</h2>
                  <p>
                    {selected.requestedBy
                      ? `Requested by ${selected.requestedBy.fullName}`
                      : "Requested through member access"}{" "}
                    on {date(selected.requestedAt)}
                  </p>
                </div>
                <Link to={`/members/${selected.member.id}`}>View member profile</Link>
              </header>
              {selected.status === "PENDING" && selected.reviewNote && (
                <div className="change-request-note">
                  <span>Previous review note</span>
                  <p>{selected.reviewNote}</p>
                </div>
              )}
              {selected.requestNote && (
                <div className="change-request-note">
                  <span>Request note</span>
                  <p>{selected.requestNote}</p>
                </div>
              )}
              <div className="change-comparison">
                <div className="change-comparison__heading">
                  <h3>
                    {selected.type === "BENEFICIARY_REMOVE"
                      ? "Record to remove"
                      : "Proposed changes"}
                  </h3>
                  <span>Current value</span>
                  <span>Requested value</span>
                </div>
                {compareKeys.length === 0 ? (
                  <p className="change-no-data">No field data accompanies this request.</p>
                ) : (
                  compareKeys.map((key) => {
                    const before = source[key];
                    const after = selected.type === "BENEFICIARY_REMOVE" ? null : proposed[key];
                    const changed = pretty(before) !== pretty(after);
                    return (
                      <div className={`change-row ${changed ? "is-changed" : ""}`} key={key}>
                        <strong>{labels[key] ?? key.replaceAll("_", " ")}</strong>
                        <span data-label="Current value">{pretty(before)}</span>
                        <span data-label="Requested value">
                          {selected.type === "BENEFICIARY_REMOVE"
                            ? "Will be removed"
                            : pretty(after)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
              {selected.status === "PENDING" && canReview ? (
                <div className="change-review">
                  <h3>Review request</h3>
                  <p className="change-review__help">
                    Review the proposed changes above, then choose an action.
                  </p>
                  <ActionMenu
                    label={`Actions for request ${selected.id}`}
                    items={(["APPROVE", "RETURN", "REJECT"] as const).map((value) => ({
                      label:
                        value === "APPROVE"
                          ? "Approve"
                          : value === "RETURN"
                            ? "Return for correction"
                            : "Reject",
                      onSelect: () => {
                        setBulkDecision(null);
                        setReviewNote("");
                        setActionError("");
                        setDecision(value);
                      },
                    }))}
                  />
                </div>
              ) : selected.status !== "PENDING" ? (
                <div className="change-reviewed">
                  <strong>
                    {selected.status.charAt(0) + selected.status.slice(1).toLowerCase()}
                  </strong>
                  <p>{selected.reviewNote || "No review note was recorded."}</p>
                  <span>
                    {selected.reviewedBy
                      ? `Reviewed by ${selected.reviewedBy.fullName}`
                      : "Review completed"}
                    {selected.reviewedAt ? ` on ${date(selected.reviewedAt)}` : ""}
                  </span>
                </div>
              ) : (
                <div className="change-reviewed">
                  <strong>Review access required</strong>
                  <p>Your role can view this request but cannot decide it.</p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
