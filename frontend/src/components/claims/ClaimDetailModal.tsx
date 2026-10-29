import { useEffect, useRef, useState } from "react";
import ModalPortal from "@/components/ui/ModalPortal";
import ClaimDeliveryControls from "./ClaimDeliveryControls";
import ClaimStageSummary from "./ClaimStageSummary";
import MankradoDetails from "./MankradoDetails";
import MankradoHistory from "./MankradoHistory";
import type { MankradoAssessment } from "@/features/claims/assessment.types";
import { Alert } from "@/components/ui/Feedback";
import { useClaimDocument } from "@/features/claims/useClaimDocument";
import api from "@/lib/api";
import {
  CLAIM_DOCUMENT_MANIFEST,
  claimDetailFields,
  deliveryLabel,
  type ClaimType,
} from "@/lib/claimDocuments";
import { formatCurrency } from "@/lib/currency";
import { getApiError } from "@/lib/errorExtract";
import { Link } from "react-router-dom";

type ClaimDocument = {
  id: number;
  slotKey: string | null;
  originalName: string;
  storedName?: string;
};

type ClaimDetail = {
  id: number;
  externalClaimId: string | null;
  provider: string;
  status: string;
  externalStatus: string | null;
  externalAssessment: MankradoAssessment | null;
  deliveryState: string;
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
  notes: string | null;
  documents: ClaimDocument[];
  member: {
    id: number;
    controllerId: string;
    fullName: string;
    district?: { name: string | null } | null;
  };
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
    : "—";

// camelCase JSON key -> spaced Title Case, e.g. "residentialAddress" -> "Residential Address".
const humanizeKey = (key: string) =>
  key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());

const formatDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-action-primary">
        {title}
      </h3>
      <div className="overflow-hidden rounded-lg border border-border-default">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,11rem)_1fr] border-b border-border-default text-sm last:border-0">
      <div className="bg-surface-subtle px-3 py-2 font-semibold text-text-muted">{label}</div>
      <div className="px-3 py-2 font-semibold text-ink wrap-break-word">
        {value || <span className="font-normal text-text-muted">—</span>}
      </div>
    </div>
  );
}

export default function ClaimDetailModal({
  submissionId,
  onClose,
  onChanged,
  audience = "staff",
}: {
  submissionId: number;
  audience?: "staff" | "member";
  onClose: () => void;
  // Notifies the caller (e.g. the table row this modal was opened from) that the claim's status
  // may have changed -- e.g. after a retried delivery -- so it can refresh its own data too.
  onChanged?: () => void | Promise<void>;
}) {
  const [detail, setDetail] = useState<ClaimDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { open: openDocument, error: docError } = useClaimDocument(
    audience === "member" ? submissionId : undefined,
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab") return;
      const controls = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (
        !dialogRef.current?.contains(document.activeElement) ||
        (!event.shiftKey && document.activeElement === last)
      ) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  const requestRef = useRef<AbortController | null>(null);
  const load = () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const signal = controller.signal;
    setLoading(true);
    setError("");
    setDetail(null);

    return api
      .get(
        audience === "member"
          ? `/member-portal/claims/${submissionId}`
          : `/claims/submissions/${submissionId}`,
        { signal },
      )
      .then((response) => {
        const data = response.data.data as ClaimDetail;
        if (!signal?.aborted) {
          setDetail(data);
          if (audience === "member") void onChanged?.();
        }
      })
      .catch((caught: unknown) => {
        if (!signal?.aborted)
          setError(getApiError(caught)?.message || "This claim could not be loaded.");
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
  };

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId, audience]);

  const particulars = detail
    ? claimDetailFields(detail.claimType, detail.claimDetails).filter(([, value]) => value)
    : [];
  const contactEntries = Object.entries(detail?.claimantContact ?? {}).filter(([, value]) => value);
  const paymentEntries = Object.entries(detail?.paymentDetails ?? {}).filter(([, value]) => value);

  const slotLabel = (slotKey: string | null) => {
    if (!slotKey) return "Other document";
    const manifest = detail?.claimType ? (CLAIM_DOCUMENT_MANIFEST[detail.claimType] ?? []) : [];
    return manifest.find((slot) => slot.key === slotKey)?.label ?? humanizeKey(slotKey);
  };
  const documentGroups: [string, ClaimDocument[]][] = [];
  for (const doc of detail?.documents ?? []) {
    const label = slotLabel(doc.slotKey);
    const group = documentGroups.find(([name]) => name === label);
    if (group) group[1].push(doc);
    else documentGroups.push([label, [doc]]);
  }

  const filedBy = detail?.submittedByMember?.fullName ?? detail?.submittedBy?.fullName ?? "";
  const filedVia = detail?.submittedByMember
    ? `Member portal · Staff ID ${detail.submittedByMember.controllerId}`
    : "Staff portal";
  const deliveryText =
    detail?.provider === "SIMULATION"
      ? "Historical simulation"
      : deliveryLabel(detail?.deliveryState);

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-1000 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
        role="dialog"
        ref={dialogRef}
        aria-modal="true"
        aria-label="Claim details"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div className="w-full max-w-3xl rounded-xl border border-border-default bg-(--surface-raised) shadow-dropdown">
          <div className="sticky top-0 flex items-center justify-between rounded-t-xl border-b border-border-default bg-(--surface-raised) px-5 py-3">
            <h2 className="text-lg font-extrabold text-text-strong">Claim details</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex size-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-subtle hover:text-text-strong"
            >
              <span aria-hidden="true" className="text-xl leading-none">
                &times;
              </span>
            </button>
          </div>

          <div className="max-h-[calc(90vh-3.25rem)] overflow-y-auto p-5">
            {loading || (detail && detail.id !== submissionId) ? (
              <p className="text-sm text-text-muted">Loading claim details…</p>
            ) : error || !detail ? (
              <Alert tone="error">{error || "Claim not found."}</Alert>
            ) : (
              <>
                <ClaimStageSummary claim={detail} />
                {audience === "staff" && (
                  <ClaimDeliveryControls
                    key={`delivery:${detail.id}`}
                    claim={detail}
                    staffId={detail.member.controllerId}
                    onSent={async () => {
                      await load();
                      await onChanged?.();
                    }}
                  />
                )}
                {audience === "member" &&
                  detail.status === "RETURNED" &&
                  detail.deliveryState === "NOT_SENT" && (
                    <Link
                      to={`/member/claims/${detail.id}/resubmit`}
                      onClick={onClose}
                      className="mb-4 inline-block rounded-lg border border-action-primary px-3 py-2 text-sm font-bold text-action-primary hover:bg-info-soft"
                    >
                      Edit and resubmit
                    </Link>
                  )}
                {detail.errorMessage && (
                  <div className="mb-4">
                    <Alert tone="error">{detail.errorMessage}</Alert>
                  </div>
                )}
                {detail.status === "RETURNED" && detail.reviewNote && (
                  <div className="mb-4">
                    <Alert tone="warning">{detail.reviewNote}</Alert>
                  </div>
                )}

                <Section title="Submitted information">
                  <Row label="Filed on" value={formatDate(detail.createdAt)} />
                  <Row
                    label="External lookup reference"
                    value={detail.externalClaimId ?? "Available after Mankrado confirms receipt"}
                  />
                  <Row label="Policy holder" value={detail.member.fullName} />
                  <Row label="Staff ID" value={detail.member.controllerId} />
                  <Row label="Claim type" value={labelize(detail.claimType)} />
                  <Row
                    label="Estimated benefit — subject to insurer assessment"
                    value={detail.estimatedAmount ? formatCurrency(detail.estimatedAmount) : "—"}
                  />
                </Section>

                <Section title="Filing & delivery">
                  <Row label="Filed by" value={filedBy} />
                  <Row label="Filed via" value={filedVia} />
                  <Row label="Branch" value={detail.member.district?.name ?? "—"} />
                  <Row label="Provider" value={detail.provider} />
                  <Row label="Delivery" value={deliveryText} />
                  <Row
                    label="Sent to Mankrado on"
                    value={
                      detail.submittedAt ? formatDate(detail.submittedAt) : "Not yet confirmed"
                    }
                  />
                </Section>

                {particulars.length > 0 && (
                  <Section title="Claim particulars">
                    {particulars.map(([label, value]) => (
                      <Row key={label} label={label} value={value} />
                    ))}
                  </Section>
                )}

                <Section title="Claimant information">
                  <Row label="Claimant type" value={labelize(detail.claimantType)} />
                  <Row label="Full name" value={detail.claimantName} />
                  {contactEntries.map(([key, value]) => (
                    <Row key={key} label={humanizeKey(key)} value={value} />
                  ))}
                </Section>

                <Section title="Mode of identification">
                  <Row label="Type of card" value={labelize(detail.claimantIdType)} />
                  <Row label="ID card number" value={detail.claimantIdNumber} />
                </Section>

                <Section title="Selected payment mode">
                  <Row label="Payment mode" value={labelize(detail.paymentMethod)} />
                  {paymentEntries.map(([key, value]) => (
                    <Row key={key} label={humanizeKey(key)} value={value} />
                  ))}
                </Section>

                <Section title="Documents">
                  {audience === "member" && documentGroups.length > 0 && (
                    <p className="px-3 pt-3 text-xs text-text-muted">
                      Select a document below to download it.
                    </p>
                  )}
                  {docError && (
                    <div className="border-b border-border-default p-3">
                      <Alert tone="error">{docError}</Alert>
                    </div>
                  )}
                  {documentGroups.length === 0 ? (
                    <p className="p-3 text-sm text-text-muted">No documents attached.</p>
                  ) : (
                    <ul className="divide-y divide-border-default">
                      {documentGroups.map(([label, docs]) => (
                        <li key={label} className="px-3 py-2">
                          <p className="mb-1 text-xs font-semibold text-text-muted">{label}</p>
                          <span className="flex flex-wrap gap-1.5">
                            {docs.map((doc) => (
                              <button
                                key={doc.id}
                                type="button"
                                onClick={() => void openDocument(doc)}
                                className="max-w-full wrap-break-word rounded-full bg-info-soft px-2.5 py-0.5 text-left text-xs font-semibold text-text-strong hover:underline"
                              >
                                {doc.originalName}
                              </button>
                            ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                {detail.reviewedBy && (
                  <Section title="Review">
                    <Row label="Reviewed by" value={detail.reviewedBy.fullName} />
                    <Row label="Reviewed on" value={formatDate(detail.reviewedAt)} />
                    <Row label="Review note" value={detail.reviewNote} />
                  </Section>
                )}

                {detail.notes && (
                  <Section title="Comment">
                    <p className="p-3 text-sm leading-relaxed text-ink">{detail.notes}</p>
                  </Section>
                )}
                {detail.provider === "Claims System" && (
                  <>
                    <MankradoDetails
                      key={`assessment:${detail.id}`}
                      externalId={detail.externalClaimId}
                      endpoint={
                        audience === "member"
                          ? `/member-portal/claims/${detail.id}/assessment`
                          : undefined
                      }
                      savedAssessment={detail.externalAssessment}
                      lastSyncedAt={detail.lastSyncedAt}
                      onUpdated={(result) => {
                        setDetail((previous) =>
                          previous?.id === detail.id
                            ? {
                                ...previous,
                                externalAssessment: result,
                                externalStatus: result.status,
                                lastSyncedAt: result.lastSyncedAt,
                              }
                            : previous,
                        );
                        void onChanged?.();
                      }}
                    />
                    {audience === "staff" && detail.deliveryState !== "UNKNOWN" && (
                      <MankradoHistory
                        key={`history:${detail.id}`}
                        staffId={detail.member.controllerId}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
