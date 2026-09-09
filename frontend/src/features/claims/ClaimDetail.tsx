import { ClaimReviewControls, type ClaimDecision } from "@/features/claims/ClaimReviewControls";
import MankradoDetails from "@/components/claims/MankradoDetails";
import MankradoHistory from "@/components/claims/MankradoHistory";
import Button from "@/components/ui/Button";
import { Alert, TableSkeleton } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import { claimStatusLabel, claimStatusTone } from "@/lib/claimStatus";
import api from "@/lib/api";
import { reviewClaim } from "./claims.api";
import { useClaimDocument } from "./useClaimDocument";
import {
  CLAIM_DOCUMENT_MANIFEST,
  claimDetailFields,
  deliveryLabel,
  type ClaimType,
} from "@/lib/claimDocuments";
import { formatCurrency } from "@/lib/currency";
import { getApiError } from "@/lib/errorExtract";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

type Decision = ClaimDecision;

type ClaimDocument = {
  id: number;
  slotKey: string | null;
  originalName: string;
  storedName: string;
};

type ClaimSubmissionDetail = {
  id: number;
  externalClaimId: string | null;
  provider: string;
  deliveryState: string;
  externalStatus: string | null;
  status: string;
  source: "STAFF" | "MEMBER_PORTAL";
  claimType: ClaimType | null;
  claimantName: string | null;
  claimantType: "MEMBER" | "SPOUSE" | null;
  claimantIdType: string | null;
  claimantIdNumber: string | null;
  claimantContact: Record<string, string> | null;
  estimatedAmount: string | null;
  errorMessage: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  incidentDate: string | null;
  claimDetails: Record<string, unknown> | null;
  paymentMethod: string | null;
  paymentDetails: Record<string, string> | null;
  documentIds: number[];
  documents: ClaimDocument[];
  notes: string | null;
  member: { id: number; controllerId: string; fullName: string };
  submittedBy: { id: number; fullName: string } | null;
  submittedByMember: { id: number; controllerId: string; fullName: string } | null;
  reviewedBy: { id: number; fullName: string } | null;
};

const labelize = (value: string | null | undefined) =>
  value
    ? value
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toUpperCase())
    : "Not recorded";

const formatDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Not recorded";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border-default bg-(--surface-raised) p-5">
      <h2 className="mb-3 text-lg font-extrabold text-text-strong">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-ink">
        {value || <span className="font-normal text-text-muted">Not provided</span>}
      </dd>
    </div>
  );
}

export default function ClaimDetail() {
  const { id } = useParams();
  const [claim, setClaim] = useState<ClaimSubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [decision, setDecision] = useState<Decision | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get(`/claims/submissions/${id}`);
      setClaim(response.data.data);
    } catch (caught: unknown) {
      setError(getApiError(caught)?.message || "This claim could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const { open: openDocument, error: documentError } = useClaimDocument();

  const submitReview = async () => {
    if (!claim || !decision) return;
    if (decision !== "APPROVE" && !reviewNote.trim()) {
      setReviewError("A review note is required when returning or rejecting a claim.");
      return;
    }
    setReviewBusy(true);
    setReviewError("");
    try {
      await reviewClaim(claim.id, decision, reviewNote);
      setDecision(null);
      setReviewNote("");
      await load();
    } catch (caught: unknown) {
      setReviewError(getApiError(caught)?.message || "The review could not be completed.");
    } finally {
      setReviewBusy(false);
    }
  };

  const manifest = claim?.claimType ? (CLAIM_DOCUMENT_MANIFEST[claim.claimType] ?? []) : [];
  const documentsBySlot = (slotKey: string) =>
    claim?.documents.filter((doc) => doc.slotKey === slotKey) ?? [];
  const unmatchedDocuments = claim?.documents.filter(
    (doc) => !doc.slotKey || !manifest.some((slot) => slot.key === doc.slotKey),
  );

  return (
    <div>
      <Link
        to="/claims"
        className="mb-4 inline-block text-xs font-semibold text-text-muted hover:text-text-strong"
      >
        &larr; All claims
      </Link>

      {loading ? (
        <div className="rounded-xl border border-border-default bg-(--surface-raised) p-5">
          <table className="w-full">
            <tbody>
              <TableSkeleton columns={2} rows={6} />
            </tbody>
          </table>
        </div>
      ) : error || !claim ? (
        <Alert tone="error">{error || "Claim not found."}</Alert>
      ) : (
        <>
          <PageHeader
            eyebrow={claim.member.fullName}
            title={`${labelize(claim.claimType)} claim`}
            description={`Filed ${formatDate(claim.createdAt)}${claim.source === "MEMBER_PORTAL" ? " · Filed by member" : ""}`}
            actions={
              <StatusBadge tone={claimStatusTone(claim.externalStatus ?? claim.status)}>
                {claimStatusLabel(claim.externalStatus ?? claim.status)}
              </StatusBadge>
            }
          />

          {claim.provider === "MANKRADO" &&
            claim.deliveryState === "NOT_SENT" &&
            claim.status === "PENDING" &&
            (claim.source === "STAFF" || claim.reviewedAt) && (
              <div className="mb-4">
                <Button
                  loading={reviewBusy}
                  onClick={async () => {
                    setReviewBusy(true);
                    setReviewError("");
                    try {
                      await api.post(`/claims/submissions/${claim.id}/send`);
                      await load();
                    } catch (caught: unknown) {
                      setReviewError(
                        getApiError(caught)?.message || "Delivery could not be started.",
                      );
                    } finally {
                      setReviewBusy(false);
                    }
                  }}
                >
                  Send saved claim
                </Button>
                {reviewError && <Alert tone="error">{reviewError}</Alert>}
              </div>
            )}
          {claim.errorMessage && (
            <div className="mb-4">
              <Alert tone="error">{claim.errorMessage}</Alert>
            </div>
          )}
          {claim.status === "RETURNED" && claim.reviewNote && (
            <div className="mb-4">
              <Alert tone="warning">{claim.reviewNote}</Alert>
            </div>
          )}

          {claim.provider === "MANKRADO" && <MankradoDetails externalId={claim.externalClaimId} />}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Overview">
              <dl className="grid grid-cols-2 gap-4">
                <Field
                  label="Member"
                  value={
                    <Link to={`/members/${claim.member.id}`} className="hover:underline">
                      {claim.member.fullName}
                    </Link>
                  }
                />
                <Field label="Controller ID" value={claim.member.controllerId} />
                <Field
                  label="Claimant"
                  value={claim.claimantName ?? labelize(claim.claimantType)}
                />
                <Field
                  label="Estimated amount"
                  value={claim.estimatedAmount ? formatCurrency(claim.estimatedAmount) : ""}
                />
                <Field label="Reference" value={claim.externalClaimId} />
                <Field label="Provider" value={claim.provider} />
                <Field
                  label="Delivery"
                  value={
                    claim.provider === "SIMULATION"
                      ? "Historical simulation"
                      : deliveryLabel(claim.deliveryState)
                  }
                />
                <Field label="Mankrado status" value={claim.externalStatus} />
                <Field label="Submitted" value={formatDate(claim.submittedAt)} />
                <Field
                  label="Filed by"
                  value={
                    claim.submittedByMember
                      ? `${claim.submittedByMember.fullName} (member)`
                      : claim.submittedBy?.fullName
                  }
                />
                {claim.reviewedBy && (
                  <>
                    <Field label="Reviewed by" value={claim.reviewedBy.fullName} />
                    <Field label="Reviewed" value={formatDate(claim.reviewedAt)} />
                  </>
                )}
              </dl>
            </Card>

            <Card title="Claim details">
              <dl className="grid grid-cols-2 gap-4">
                {claimDetailFields(claim.claimType, claim.claimDetails).map(([label, value]) => (
                  <Field key={label} label={label} value={value} />
                ))}
              </dl>
            </Card>

            <Card title="Claimant contact">
              <dl className="grid grid-cols-2 gap-4">
                <Field label="ID type" value={labelize(claim.claimantIdType)} />
                <Field label="ID number" value={claim.claimantIdNumber} />
                {claim.claimantContact &&
                  Object.entries(claim.claimantContact)
                    .filter(([, value]) => value)
                    .map(([field, value]) => (
                      <Field
                        key={field}
                        label={field
                          .replace(/([A-Z])/g, " $1")
                          .replace(/^./, (l) => l.toUpperCase())}
                        value={value}
                      />
                    ))}
              </dl>
            </Card>

            <Card title="Payment">
              <dl className="grid grid-cols-2 gap-4">
                <Field label="Mode of payment" value={labelize(claim.paymentMethod)} />
                {claim.paymentDetails &&
                  Object.entries(claim.paymentDetails)
                    .filter(([, value]) => value)
                    .map(([field, value]) => (
                      <Field
                        key={field}
                        label={field
                          .replace(/([A-Z])/g, " $1")
                          .replace(/^./, (l) => l.toUpperCase())}
                        value={value}
                      />
                    ))}
              </dl>
            </Card>

            <Card title="Documents">
              {documentError && (
                <div className="mb-3">
                  <Alert tone="error">{documentError}</Alert>
                </div>
              )}
              {manifest.length === 0 ? (
                <p className="text-xs text-text-muted">
                  No document checklist for this claim type.
                </p>
              ) : (
                <ul className="divide-y divide-(--border-default)">
                  {manifest.map((slot) => {
                    const uploaded = documentsBySlot(slot.key);
                    return (
                      <li key={slot.key} className="flex flex-wrap items-center gap-2 py-2 text-xs">
                        <span className="min-w-0 flex-1 font-semibold text-ink">{slot.label}</span>
                        {uploaded.length > 0 ? (
                          uploaded.map((doc) => (
                            <button
                              key={doc.id}
                              type="button"
                              onClick={() => void openDocument(doc)}
                              className="rounded-full bg-info-soft px-2.5 py-0.5 text-xs font-semibold text-text-strong hover:underline"
                            >
                              {doc.originalName}
                            </button>
                          ))
                        ) : (
                          <span className="text-xs font-semibold text-text-muted">
                            {slot.tag === "OPTIONAL" ? "Not provided" : "Missing"}
                          </span>
                        )}
                      </li>
                    );
                  })}
                  {unmatchedDocuments && unmatchedDocuments.length > 0 && (
                    <li className="flex flex-wrap items-center gap-2 py-2 text-xs">
                      <span className="min-w-0 flex-1 font-semibold text-ink">Other documents</span>
                      {unmatchedDocuments.map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => void openDocument(doc)}
                          className="rounded-full bg-info-soft px-2.5 py-0.5 text-xs font-semibold text-text-strong hover:underline"
                        >
                          {doc.originalName}
                        </button>
                      ))}
                    </li>
                  )}
                </ul>
              )}
            </Card>

            {claim.notes && (
              <Card title="Comment">
                <p className="text-sm leading-relaxed text-ink">{claim.notes}</p>
              </Card>
            )}
          </div>

          {claim.provider === "MANKRADO" && (
            <MankradoHistory
              staffId={claim.member.controllerId}
              externalId={claim.externalClaimId}
            />
          )}
          {claim.status === "PENDING" &&
            claim.source === "MEMBER_PORTAL" &&
            !claim.reviewedAt &&
            claim.deliveryState === "NOT_SENT" && (
              <div className="mt-4 rounded-xl border border-border-default bg-surface-subtle p-5">
                <p className="mb-2 text-sm font-bold text-text-strong">
                  Review this member-submitted claim
                </p>
                {reviewError && (
                  <div className="mb-3">
                    <Alert tone="error">{reviewError}</Alert>
                  </div>
                )}
                <ClaimReviewControls
                  decision={decision}
                  note={reviewNote}
                  busy={reviewBusy}
                  onDecision={setDecision}
                  onNote={setReviewNote}
                  onCancel={() => setDecision(null)}
                  onConfirm={() => void submitReview()}
                />
              </div>
            )}
        </>
      )}
    </div>
  );
}
