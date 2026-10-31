import ClaimDraftList from "@/features/claims/ClaimDraftList";
import ClaimsPortalStatus from "@/components/claims/ClaimsPortalStatus";
import ClaimsTable from "@/components/claims/ClaimsTable";
import Button from "@/components/ui/Button";
import Dropdown from "@/components/ui/Dropdown";
import { Alert, EmptyState } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import { useClaimSubmissionsList } from "./useClaimSubmissionsList";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

const STATUSES = ["PENDING", "REDIRECT_READY", "SUBMITTED", "RETURNED", "FAILED", "SYNCHRONIZED"];
const DELIVERY_STATES = ["NOT_SENT", "SENDING", "ACCEPTED", "FAILED", "UNKNOWN"];
const labelize = (value: string | null) =>
  value
    ? value
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toUpperCase())
    : "Not recorded";

export default function Claims() {
  const navigate = useNavigate();
  const location = useLocation();
  const [success] = useState((location.state as { success?: string } | null)?.success ?? "");
  const [searchParams] = useSearchParams();
  const status = searchParams.get("status") ?? "";
  const deliveryState = searchParams.get("deliveryState") ?? "";
  const { page, limit, rows, total, totalPages, loading, error, setError, load, updateParams } =
    useClaimSubmissionsList({
      status: status || undefined,
      deliveryState: deliveryState || undefined,
    });

  useEffect(() => {
    if (success) {
      navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: null,
      });
    }
  }, [location.pathname, location.search, navigate, success]);

  return (
    <div>
      <PageHeader
        title="Claims"
        description="Create and track member claim submissions."
        actions={
          <>
            <ClaimsPortalStatus />
            <Button onClick={() => navigate("/claims/new")}>File a claim</Button>
          </>
        }
      />
      <ClaimDraftList audience="staff" />
      <h2 className="mb-4 text-lg font-bold text-text-strong">Submitted claims</h2>
      {success && (
        <div className="mb-5">
          <Alert tone="success">{success}</Alert>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alert tone="error">
            {error}{" "}
            <button type="button" className="underline" onClick={() => void load()}>
              Try again
            </button>
          </Alert>
        </div>
      )}
      <div className="mb-4 flex flex-wrap gap-4">
        <div className="max-w-52">
          <label className="mb-1.5 block text-xs font-bold text-text-strong">
            Submission status
          </label>
          <Dropdown
            aria-label="Submission status"
            value={status}
            onChange={(value) => updateParams({ status: value || null, page: null })}
            options={[
              { value: "", label: "All statuses" },
              ...STATUSES.map((item) => ({ value: item, label: labelize(item) })),
            ]}
          />
        </div>
        <div className="max-w-52">
          <label className="mb-1.5 block text-xs font-bold text-text-strong">
            Delivery to insurer
          </label>
          <Dropdown
            aria-label="Delivery to insurer"
            value={deliveryState}
            onChange={(value) => updateParams({ deliveryState: value || null, page: null })}
            options={[
              { value: "", label: "All delivery states" },
              ...DELIVERY_STATES.map((item) => ({ value: item, label: labelize(item) })),
            ]}
          />
        </div>
      </div>
      <ClaimsTable
        rowOffset={(page - 1) * limit}
        rows={rows}
        loading={loading}
        onReviewed={load}
        onError={setError}
        emptyState={
          error ? null : (
            <EmptyState
              title="No claim submissions yet"
              description="File the first claim to begin tracking its details and processing status."
              action={<Button onClick={() => navigate("/claims/new")}>File a claim</Button>}
            />
          )
        }
      />
      <Pagination
        page={page}
        totalPages={totalPages}
        totalItems={total}
        itemLabel="submissions"
        onPageChange={(nextPage) => updateParams({ page: String(nextPage) })}
      />
    </div>
  );
}
