import ClaimDraftList from "@/features/claims/ClaimDraftList";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import ClaimDetailModal from "@/components/claims/ClaimDetailModal";
import { Alert } from "@/components/ui/Feedback";
import Pagination from "@/components/ui/Pagination";
import StatusBadge from "@/components/ui/StatusBadge";
import TableFrame from "@/components/ui/TableFrame";
import DateField from "@/components/ui/DateField";
import { SelectField } from "@/components/ui/FormField";
import api from "@/lib/api";
import { claimStage } from "@/lib/claimStatus";
import { CLAIM_TYPE_LABELS, type ClaimItem, formatDate } from "./MemberHome.shared";
import { filedDate, inDateRange } from "./claimFilters";

const PAGE_SIZE = 10;
export const portalReference = (id: number) => `CLM-${String(id).padStart(6, "0")}`;

export default function MemberClaims() {
  const location = useLocation();
  const [claims, setClaims] = useState<ClaimItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [claimType, setClaimType] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [from, setFrom] = useState("");
  const [through, setThrough] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);
  const request = useRef<AbortController | null>(null);
  const handledNavigation = useRef<string | null>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/member-portal/claims", { signal: controller.signal });
      if (!controller.signal.aborted) setClaims(response.data.data);
    } catch {
      if (!controller.signal.aborted) setError("Could not load your claims. Please try again.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);

  const sorted = useMemo(
    () =>
      [...claims].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id),
    [claims],
  );
  const filtered = useMemo(
    () =>
      sorted.filter(
        (claim) =>
          (!claimType || claim.claimType === claimType) &&
          (!stageFilter || claimStage(claim).label === stageFilter) &&
          inDateRange(filedDate(claim.createdAt), from, through),
      ),
    [sorted, claimType, stageFilter, from, through],
  );
  const stages = [
    ...new Set([
      ...sorted.map((claim) => claimStage(claim).label),
      ...(stageFilter ? [stageFilter] : []),
    ]),
  ].sort();
  const types = [
    ...new Set([
      ...Object.keys(CLAIM_TYPE_LABELS),
      ...sorted.flatMap((claim) => (claim.claimType ? [claim.claimType] : [])),
    ]),
  ];
  const clearFilters = () => {
    setClaimType("");
    setStageFilter("");
    setFrom("");
    setThrough("");
    setPage(1);
  };
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * PAGE_SIZE;

  useEffect(() => {
    const navigation = `${location.key}:${location.hash}`;
    if (loading || error || handledNavigation.current === navigation) return;
    handledNavigation.current = navigation;
    const match = /^#claim-([1-9]\d*)$/.exec(location.hash);
    if (!match) return;
    const id = Number(match[1]);
    const index = sorted.findIndex((claim) => claim.id === id);
    if (index >= 0) {
      setClaimType("");
      setStageFilter("");
      setFrom("");
      setThrough("");
      setPage(Math.floor(index / PAGE_SIZE) + 1);
      setFocusId(id);
    }
  }, [location.key, location.hash, sorted, loading, error]);
  useEffect(() => {
    if (focusId === null) return;
    const row = document.getElementById(`claim-${focusId}`);
    if (row) {
      row.scrollIntoView({ block: "center", inline: "nearest" });
      row.focus({ preventScroll: true });
      setFocusId(null);
    }
  }, [focusId, currentPage]);

  return (
    <section className="min-w-0 space-y-5" aria-labelledby="member-claims-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="member-claims-heading" className="text-xl font-bold text-text-strong">
            My Claims
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Claims submitted by you or staff on your behalf.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/member/claims/history"
            className="min-h-11 content-center text-sm font-semibold text-ink underline underline-offset-4"
          >
            Claim History
          </Link>
          <Link
            to="/member/claims/new"
            className="inline-flex min-h-11 items-center rounded-lg bg-action-primary px-4 text-sm font-bold text-text-on-action no-underline hover:bg-(--action-primary-hover)"
          >
            File a claim
          </Link>
        </div>
      </div>
      <ClaimDraftList audience="member" />
      <h2 className="text-lg font-bold text-text-strong">Submitted claims</h2>
      {sorted.length > 0 && (
        <div
          className="space-y-3 rounded-xl border border-border-default bg-(--surface-raised) p-4"
          role="group"
          aria-label="Filter submitted claims"
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SelectField
              label="Claim type"
              value={claimType}
              onChange={(event) => {
                setClaimType(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All claim types</option>
              {types.map((type) => (
                <option key={type} value={type}>
                  {CLAIM_TYPE_LABELS[type] ?? type}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Stage"
              value={stageFilter}
              onChange={(event) => {
                setStageFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All stages</option>
              {stages.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </SelectField>
            <DateField
              label="Filed from"
              value={from}
              max={through || undefined}
              onChange={(value) => {
                setFrom(value);
                setPage(1);
              }}
            />
            <DateField
              label="Filed through"
              value={through}
              min={from || undefined}
              onChange={(value) => {
                setThrough(value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-xs text-text-muted">
              {filtered.length} of {sorted.length} claims
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="min-h-10 text-xs font-semibold text-ink underline underline-offset-4"
            >
              Clear filters
            </button>
          </div>
        </div>
      )}
      {error && (
        <Alert tone="error">
          {error}{" "}
          <button
            type="button"
            onClick={() => void load()}
            className="underline underline-offset-4"
          >
            Try again
          </button>
        </Alert>
      )}
      {loading && claims.length === 0 ? (
        <p role="status" className="text-sm text-text-muted">
          Loading your claims…
        </p>
      ) : sorted.length === 0 && !error ? (
        <p className="rounded-xl border border-border-default bg-(--surface-raised) p-6 text-sm text-text-muted">
          You haven't submitted any claims yet.
        </p>
      ) : sorted.length > 0 && filtered.length === 0 ? (
        <p className="text-sm text-text-muted">No claims match your filters.</p>
      ) : filtered.length > 0 ? (
        <div>
          <TableFrame
            label="My claims table, scroll horizontally to see all columns"
            className="min-w-260"
          >
            <caption className="sr-only">My claims</caption>
            <thead className="bg-surface-subtle text-xs text-text-muted">
              <tr>
                {[
                  "No.",
                  "Portal Reference",
                  "Claim Type",
                  "Covered Person",
                  "Filed On",
                  "Filed By",
                  "Stage",
                  "Actions",
                ].map((title) => (
                  <th scope="col" key={title} className="px-4 py-3 font-semibold">
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {filtered.slice(offset, offset + PAGE_SIZE).map((claim, index) => {
                const stage = claimStage(claim);
                return (
                  <tr
                    key={claim.id}
                    id={`claim-${claim.id}`}
                    tabIndex={-1}
                    aria-label={`Claim ${claim.id}`}
                    className="align-top focus:outline-2 focus:-outline-offset-2 focus:outline-focus-ring"
                  >
                    <td className="px-4 py-4 text-text-muted">{offset + index + 1}</td>
                    <th
                      scope="row"
                      className="px-4 py-4 font-mono text-xs font-semibold text-text-strong"
                    >
                      {portalReference(claim.id)}
                    </th>
                    <td className="px-4 py-4 text-text-strong">
                      {claim.claimType
                        ? (CLAIM_TYPE_LABELS[claim.claimType] ?? claim.claimType)
                        : "Claim"}
                    </td>
                    <td className="px-4 py-4">
                      {claim.claimantType === "MEMBER"
                        ? "Member"
                        : claim.claimantType === "SPOUSE"
                          ? "Spouse"
                          : "Not recorded"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">{formatDate(claim.createdAt)}</td>
                    <td className="px-4 py-4">
                      {claim.source === "STAFF" ? "Staff on your behalf" : "Member"}
                    </td>
                    <td className="min-w-56 px-4 py-4">
                      <StatusBadge tone={stage.tone}>{stage.label}</StatusBadge>
                      <p className="mt-1 max-w-64 text-xs leading-relaxed text-text-muted">
                        {stage.next}
                      </p>
                      {claim.externalStatus && (
                        <p className="mt-1 text-xs text-text-muted">
                          Claims Portal: {claim.externalStatus}
                        </p>
                      )}
                      {claim.lastSyncedAt && (
                        <p className="mt-1 text-xs text-text-muted">
                          Last checked: {new Date(claim.lastSyncedAt).toLocaleString()}
                        </p>
                      )}
                      {claim.reviewNote && (
                        <p className="mt-1 max-w-64 text-xs text-text-strong">
                          Review note: {claim.reviewNote}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col items-start gap-3">
                        <button
                          type="button"
                          aria-label={`View details for claim ${claim.id}`}
                          onClick={() => setDetailId(claim.id)}
                          className="min-h-11 text-sm font-semibold text-ink underline underline-offset-4"
                        >
                          View details
                        </button>
                        {claim.status === "RETURNED" && (
                          <Link
                            to={`/member/claims/${claim.id}/resubmit`}
                            className="min-h-11 content-center text-sm font-semibold text-ink underline underline-offset-4"
                          >
                            Edit &amp; resubmit
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableFrame>
          <Pagination
            page={currentPage}
            totalPages={totalPages}
            totalItems={filtered.length}
            itemLabel="claims"
            onPageChange={setPage}
          />
        </div>
      ) : null}
      {detailId !== null && (
        <ClaimDetailModal
          key={`member:${detailId}`}
          submissionId={detailId}
          audience="member"
          onClose={() => setDetailId(null)}
          onChanged={load}
        />
      )}
    </section>
  );
}
