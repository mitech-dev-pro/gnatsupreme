import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Alert } from "@/components/ui/Feedback";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import TableFrame from "@/components/ui/TableFrame";
import Pagination from "@/components/ui/Pagination";
import ActionMenu from "@/components/ui/ActionMenu";
import { getApiError } from "@/lib/errorExtract";
import { CLAIM_TYPES } from "@/lib/claimDocuments";
import { draftTasks, type ClaimDraft } from "./claimDrafts.model";

type DraftSummary = Omit<ClaimDraft, "submissionKey">;

export default function ClaimDraftList({ audience }: { audience: "staff" | "member" }) {
  const endpoint = audience === "member" ? "/member-portal/claims/drafts" : "/claims/drafts";
  const form = audience === "member" ? "/member/claims/new" : "/claims/new";
  const [drafts, setDrafts] = useState<DraftSummary[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [pages, setPages] = useState(1);
  const [deleting, setDeleting] = useState<DraftSummary | null>(null),
    [busy, setBusy] = useState(false),
    [deleteError, setDeleteError] = useState("");
  const request = useRef<AbortController | null>(null),
    lock = useRef(false);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await api.get(endpoint, {
        params: { page, limit: 10 },
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const nextPages = Math.max(1, response.data.pagination.totalPages);
      if (page > nextPages) {
        setPage(nextPages);
        return;
      }
      setDrafts(response.data.data);
      setTotal(response.data.pagination.total);
      setPages(nextPages);
    } catch {
      if (!controller.signal.aborted)
        setError(
          "Saved drafts could not be loaded. Any previously displayed drafts may be outdated.",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [endpoint, page]);
  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);
  const remove = async () => {
    if (!deleting || lock.current) return;
    lock.current = true;
    setBusy(true);
    setDeleteError("");
    try {
      await api.delete(`${endpoint}/${deleting.id}`, { params: { revision: deleting.revision } });
      setDeleting(null);
      await load();
    } catch (caught) {
      setDeleteError(
        getApiError(caught)?.message || "The draft could not be deleted. It remains saved.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby={`drafts-${audience}-title`} className="mb-6 min-w-0 space-y-3">
      <div>
        <h2 id={`drafts-${audience}-title`} className="text-lg font-bold text-text-strong">
          Your drafts
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Unfinished claims saved by you. Drafts are private and enter the review process only when
          submitted.
        </p>
      </div>
      {error && (
        <Alert tone="warning">
          {error}{" "}
          <button type="button" className="underline" onClick={() => void load()}>
            Retry drafts
          </button>
        </Alert>
      )}
      {loading && (
        <p role="status" className="text-sm text-text-muted">
          Loading saved drafts…
        </p>
      )}
      {!loading && !error && drafts.length === 0 && (
        <p className="text-sm text-text-muted">
          No saved drafts. Use Save draft while filing a claim to continue later.
        </p>
      )}
      {drafts.length > 0 && (
        <>
          <TableFrame label="Saved claim drafts" className="min-w-180">
            <caption className="sr-only">Saved claim drafts</caption>
            <thead className="bg-surface-subtle text-xs text-text-muted">
              <tr>
                {[
                  "No.",
                  "Draft Reference",
                  ...(audience === "staff" ? ["Member"] : []),
                  "Claim Type",
                  "Last Saved",
                  "Still to Complete",
                  "Actions",
                ].map((label) => (
                  <th key={label} scope="col" className="px-4 py-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {drafts.map((draft, index) => (
                <tr key={draft.id} className="align-top">
                  <td className="px-4 py-4">{(page - 1) * 10 + index + 1}</td>
                  <th scope="row" className="px-4 py-4 text-xs font-semibold text-text-strong">
                    DRAFT-{String(draft.id).padStart(6, "0")}
                  </th>
                  {audience === "staff" && (
                    <td className="px-4 py-4">
                      {draft.member.fullName}
                      <p className="text-xs text-text-muted">{draft.member.controllerId}</p>
                    </td>
                  )}
                  <td className="px-4 py-4">
                    {CLAIM_TYPES.find((item) => item.value === draft.payload.claimType)?.label ??
                      "Not selected"}
                    <p className="text-xs text-text-muted">
                      {draft.payload.claimantType === "SPOUSE" ? "Spouse" : "Member"}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-xs">
                    {new Date(draft.updatedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-4">
                    <details>
                      <summary className="cursor-pointer text-xs text-ink">
                        View remaining checks
                      </summary>
                      <ul className="mt-2 max-w-72 list-disc space-y-1 pl-4 text-xs text-text-muted">
                        {draftTasks(draft.payload, draft.documents).map((task) => (
                          <li key={task}>{task}</li>
                        ))}
                      </ul>
                    </details>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`${form}?draft=${draft.id}`}
                        className="min-h-10 content-center text-sm font-semibold text-ink underline underline-offset-4"
                      >
                        Resume
                      </Link>
                      <ActionMenu
                        label={`Actions for draft ${draft.id}`}
                        items={[
                          {
                            label: "Delete draft",
                            onSelect: () => {
                              setDeleteError("");
                              setDeleting(draft);
                            },
                          },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
          <Pagination
            page={page}
            totalPages={pages}
            totalItems={total}
            itemLabel="drafts"
            onPageChange={setPage}
          />
        </>
      )}
      {deleting && (
        <Dialog
          title="Delete draft?"
          busy={busy}
          onClose={() => setDeleting(null)}
          description={`DRAFT-${String(deleting.id).padStart(6, "0")} · ${deleting.member.fullName}`}
        >
          <p className="mb-4 text-sm text-text-muted">
            This deletes the saved unfinished form. Stored attachments remain with the member.
          </p>
          {deleteError && (
            <div className="mb-4">
              <Alert tone="error">{deleteError}</Alert>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              loadingLabel="Deleting…"
              onClick={() => void remove()}
            >
              Delete draft
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
