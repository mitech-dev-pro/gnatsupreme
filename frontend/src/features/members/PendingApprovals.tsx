import Dialog from "@/components/ui/Dialog";
import ActionMenu from "@/components/ui/ActionMenu";
import ReviewDecisionDialog from "@/components/ui/ReviewDecisionDialog";
import ConfirmationPanel from "@/components/ui/ConfirmationPanel";
import Dropdown from "@/components/ui/Dropdown";
import { Alert, EmptyState } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "./PendingApprovals.css";

type Member = {
  id: number;
  controllerId: string;
  fullName: string;
  ghanaCardId: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  school: string;
  employmentCategory: "TEACHING" | "NON_TEACHING";
  report20Matched: boolean;
  createdAt: string;
  district: { id: number; name: string; region: { id: number; name: string } } | null;
  spouse: unknown | null;
  _count: { beneficiaries: number };
  createdBy: { id: number; fullName: string } | null;
};
type BulkResult = {
  requested: number;
  succeeded: number;
  failed: number;
  results: Array<{
    memberId: number;
    success: boolean;
    memberName?: string;
    status?: string;
    message?: string;
  }>;
};

function Signal({ good, yes, no }: { good: boolean; yes: string; no: string }) {
  return (
    <span className={`approval-signal ${good ? "good" : "warn"}`}>
      <i>{good ? "✓" : "!"}</i>
      {good ? yes : no}
    </span>
  );
}
// Non-teaching members are permanently excluded from Report 20 reconciliation (see
// report20.service.ts), so report20Matched stays false forever for them -- showing that as an
// "unmatched" warning here would be misleading. Render a neutral badge instead.
function Report20Signal({
  member,
  no,
}: {
  member: { employmentCategory: "TEACHING" | "NON_TEACHING"; report20Matched: boolean };
  no: string;
}) {
  if (member.employmentCategory === "NON_TEACHING")
    return (
      <span className="approval-signal">
        <i>–</i>Not applicable (non-teaching)
      </span>
    );
  return <Signal good={member.report20Matched} yes="Report 20 matched" no={no} />;
}

export default function PendingApprovals() {
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get("page"));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = [5, 10, 20].includes(Number(params.get("limit")))
    ? Number(params.get("limit"))
    : 10;
  const search = params.get("search") ?? "";
  const [searchInput, setSearchInput] = useState(search);
  const [rows, setRows] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [preview, setPreview] = useState<Member | null>(null);
  const [returning, setReturning] = useState(false);
  const [returnNote, setReturnNote] = useState("");
  const [result, setResult] = useState<BulkResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const actionLock = useRef(false);
  const [actionError, setActionError] = useState("");
  const [approvalIds, setApprovalIds] = useState<number[]>([]);

  const updateParams = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    setParams(next);
  };
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/members", {
        signal: controller.signal,
        params: { status: "PENDING", page, limit, search: search || undefined },
      });
      if (controller.signal.aborted) return;
      const pages = Math.max(1, response.data.pagination.totalPages);
      if (page > pages) {
        setParams(
          (previous) => {
            const next = new URLSearchParams(previous);
            next.set("page", String(pages));
            return next;
          },
          { replace: true },
        );
        return;
      }
      setRows(response.data.data);
      setTotal(response.data.pagination.total);
      setTotalPages(Math.max(1, response.data.pagination.totalPages));
      setSelected((current) =>
        current.filter((id) => response.data.data.some((item: Member) => item.id === id)),
      );
      setPreview(
        (current) => response.data.data.find((item: Member) => item.id === current?.id) ?? null,
      );
    } catch {
      if (!controller.signal.aborted) {
        setRows([]);
        setError("Pending members could not be loaded.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [limit, page, search, setParams]);

  useEffect(() => {
    setApprovalIds([]);
    setReturning(false);
    setReturnNote("");
    void load();
    return () => request.current?.abort();
  }, [load]);
  useEffect(() => {
    setActionError("");
  }, [approvalIds, returning]);
  const allSelected = rows.length > 0 && rows.every((item) => selected.includes(item.id));
  const toggleAll = () => setSelected(allSelected ? [] : rows.map((item) => item.id));
  const toggle = (id: number) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    updateParams({ search: searchInput.trim() || null, page: null });
  };

  const bulkApprove = async (memberIds = selected) => {
    if (!memberIds.length || actionLock.current) return;
    if (
      approvalIds.length !== memberIds.length ||
      memberIds.some((memberId) => !approvalIds.includes(memberId))
    ) {
      setApprovalIds(memberIds);
      return;
    }
    actionLock.current = true;
    setBusy(true);
    setActionError("");
    setResult(null);
    try {
      const response = await api.post("/members/bulk/approve", { memberIds });
      setResult(response.data.data);
      setSelected([]);
      setPreview(null);
      setApprovalIds([]);
      await load();
    } catch (requestError: unknown) {
      setActionError(
        getApiError(requestError)?.message || "The selected members could not be approved.",
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };

  const bulkReturn = async () => {
    if (!selected.length || returnNote.trim().length < 2 || actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setActionError("");
    setResult(null);
    try {
      const response = await api.post("/members/bulk/return", {
        memberIds: selected,
        note: returnNote.trim(),
      });
      setResult(response.data.data);
      setSelected([]);
      setReturning(false);
      setReturnNote("");
      await load();
    } catch (requestError: unknown) {
      setActionError(
        getApiError(requestError)?.message || "The selected members could not be returned.",
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };

  return (
    <main className="approvals-page">
      <PageHeader
        eyebrow="Member administration"
        title="Pending approvals"
        description={`${total.toLocaleString()} member${total === 1 ? "" : "s"} waiting for review`}
        actions={
          <div className="approvals-key">
            <Signal good yes="Ready" no="Needs attention" />
            <Signal good={false} yes="" no="Review required" />
          </div>
        }
      />
      <div className="approvals-toolbar">
        <form onSubmit={submitSearch}>
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search pending members"
          />
          <button>Search</button>
        </form>
        <label>
          Show{" "}
          <Dropdown
            className="w-18.5"
            value={limit}
            onChange={(value) => updateParams({ limit: value, page: null })}
            options={[5, 10, 20].map((size) => ({ value: size, label: String(size) }))}
          />
        </label>
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
      {result && (
        <div className="mb-3">
          <Alert tone={result.failed ? "warning" : "success"}>
            <strong>
              {result.succeeded} of {result.requested} completed.
            </strong>{" "}
            {result.failed
              ? `${result.failed} member${result.failed === 1 ? "" : "s"} could not be processed.`
              : "All selected members were processed successfully."}
            {result.failed > 0 && (
              <ul className="mt-2 list-disc pl-5">
                {result.results
                  .filter((item) => !item.success)
                  .map((item) => (
                    <li key={item.memberId}>
                      {item.memberName || `Member ${item.memberId}`}: {item.message}
                    </li>
                  ))}
              </ul>
            )}
            <button className="ml-2 underline" onClick={() => setResult(null)}>
              Dismiss
            </button>
          </Alert>
        </div>
      )}

      {selected.length > 0 && (
        <section className="approvals-selection">
          <div>
            <strong>{selected.length}</strong>
            <span>selected</span>
          </div>
          <button
            disabled={busy || loading}
            className="approve"
            onClick={() => setApprovalIds(selected)}
          >
            Approve selected
          </button>
          <button disabled={busy || loading} className="return" onClick={() => setReturning(true)}>
            Return for correction
          </button>
          <button className="clear" onClick={() => setSelected([])}>
            Clear
          </button>
        </section>
      )}
      {approvalIds.length > 0 && (
        <Dialog
          title={`Approve ${approvalIds.length} member${approvalIds.length === 1 ? "" : "s"}`}
          busy={busy}
          onClose={() => setApprovalIds([])}
          description={
            <ul className="max-h-32 overflow-y-auto">
              {approvalIds.map((id) => (
                <li key={id}>
                  {rows.find((member) => member.id === id)?.fullName || `Member ${id}`}
                </li>
              ))}
            </ul>
          }
        >
          {actionError && (
            <div className="mb-4">
              <Alert tone="error">{actionError}</Alert>
            </div>
          )}
          <ConfirmationPanel
            title="Confirm approval"
            description="Members matched in Report 20 will become Active. Unmatched members will become Flagged for follow-up."
            confirmLabel="Approve members"
            busyLabel="Approving…"
            tone="warning"
            confirmVariant="primary"
            busy={busy}
            onConfirm={() => void bulkApprove(approvalIds)}
            onCancel={() => setApprovalIds([])}
          />
        </Dialog>
      )}
      {returning && (
        <ReviewDecisionDialog
          title={`Return ${selected.length} member${selected.length === 1 ? "" : "s"} for correction`}
          description={
            <ul className="max-h-32 overflow-y-auto">
              {selected.map((id) => (
                <li key={id}>
                  {rows.find((member) => member.id === id)?.fullName || `Member ${id}`}
                </li>
              ))}
            </ul>
          }
          help="The same correction note will be sent to every selected member."
          decision="RETURN"
          note={returnNote}
          onNote={setReturnNote}
          busy={busy}
          error={actionError}
          minNoteLength={2}
          onClose={() => {
            setReturning(false);
            setReturnNote("");
          }}
          onConfirm={() => void bulkReturn()}
        />
      )}

      <div className={`approvals-layout ${preview ? "has-preview" : ""}`}>
        <section className="approvals-table-shell">
          {loading ? (
            <div className="approvals-skeleton" role="status" aria-label="Loading pending members">
              {Array.from({ length: limit }).map((_, index) => (
                <span key={index} />
              ))}
            </div>
          ) : error ? null : rows.length === 0 ? (
            <EmptyState
              title="No pending approvals"
              description="New enrollments awaiting review will appear here."
              action={<Link to="/members">View all members</Link>}
            />
          ) : (
            <div className="approvals-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label="Select all on this page"
                      />
                    </th>
                    <th scope="col">No.</th>
                    <th>Member</th>
                    <th>Location</th>
                    <th>Eligibility signals</th>
                    <th>Covered lives</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((member, index) => {
                    const identityComplete = Boolean(member.ghanaCardId);
                    return (
                      <tr
                        key={member.id}
                        className={selected.includes(member.id) ? "selected" : ""}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.includes(member.id)}
                            onChange={() => toggle(member.id)}
                            aria-label={`Select ${member.fullName}`}
                          />
                        </td>
                        <td>{(page - 1) * limit + index + 1}</td>
                        <td>
                          <Link to={`/members/${member.id}`}>
                            <strong>{member.fullName}</strong>
                            <span>
                              {member.controllerId} · {member.school}
                            </span>
                          </Link>
                        </td>
                        <td>
                          {member.district ? (
                            <>
                              <strong>{member.district.name}</strong>
                              <span>{member.district.region.name}</span>
                            </>
                          ) : (
                            <strong style={{ color: "#b9791a" }}>No district</strong>
                          )}
                        </td>
                        <td>
                          <div className="approval-signals">
                            <Report20Signal member={member} no="Report 20 unmatched" />
                            <Signal
                              good={Boolean(member.phoneVerifiedAt)}
                              yes="Phone verified"
                              no="Phone unverified"
                            />
                            <Signal
                              good={identityComplete}
                              yes="Identity complete"
                              no="Identity incomplete"
                            />
                          </div>
                        </td>
                        <td>
                          <strong>
                            {member._count.beneficiaries} beneficiar
                            {member._count.beneficiaries === 1 ? "y" : "ies"}
                          </strong>
                          <span>{member.spouse ? "Spouse recorded" : "No spouse"}</span>
                        </td>
                        <td>
                          <ActionMenu
                            label={`Actions for ${member.fullName}`}
                            items={[
                              { label: "View profile", to: `/members/${member.id}` },
                              { label: "Review", onSelect: () => setPreview(member) },
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {preview && (
          <aside className="approval-preview">
            <header>
              <div>
                <span>Quick review</span>
                <h2>{preview.fullName}</h2>
                <p>{preview.controllerId}</p>
              </div>
              <button aria-label="Close member preview" onClick={() => setPreview(null)}>
                ×
              </button>
            </header>
            <dl>
              <div>
                <dt>School</dt>
                <dd>{preview.school}</dd>
              </div>
              <div>
                <dt>District</dt>
                <dd>
                  {preview.district ? (
                    <>
                      {preview.district.name}
                      <small>{preview.district.region.name}</small>
                    </>
                  ) : (
                    "Not assigned"
                  )}
                </dd>
              </div>
              <div>
                <dt>Ghana Card</dt>
                <dd>{preview.ghanaCardId || "Not provided"}</dd>
              </div>
              <div>
                <dt>Enrolled by</dt>
                <dd>{preview.createdBy?.fullName || "System"}</dd>
              </div>
            </dl>
            <div className="approval-preview__signals">
              <Report20Signal member={preview} no="Will become Flagged" />
              <Signal
                good={Boolean(preview.phoneVerifiedAt)}
                yes="Phone verified"
                no="Phone unverified"
              />
            </div>
            <footer>
              <Link to={`/members/${preview.id}`}>Open full profile</Link>
              <button disabled={busy || loading} onClick={() => void bulkApprove([preview.id])}>
                Approve member
              </button>
              <button
                onClick={() => {
                  setSelected([preview.id]);
                  setReturning(true);
                }}
              >
                Return
              </button>
            </footer>
          </aside>
        )}
      </div>
      {!loading && total > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={total}
          itemLabel="pending members"
          onPageChange={(nextPage) => updateParams({ page: String(nextPage) })}
        />
      )}
    </main>
  );
}
