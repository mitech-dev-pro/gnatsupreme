import { useEffect, useState } from "react";
import ModalPortal from "@/components/ui/ModalPortal";
import StatusBadge from "@/components/ui/StatusBadge";
import { Alert } from "@/components/ui/Feedback";
import { useClaimDocument } from "@/features/claims/useClaimDocument";
import api from "@/lib/api";
import { claimStatusLabel, claimStatusTone } from "@/lib/claimStatus";
import {
  CLAIM_DOCUMENT_MANIFEST,
  claimDetailFields,
  deliveryLabel,
  type ClaimType,
} from "@/lib/claimDocuments";
import { formatCurrency } from "@/lib/currency";
import { getApiError } from "@/lib/errorExtract";

type ClaimDocument = {
  id: number;
  slotKey: string | null;
  originalName: string;
  storedName: string;
};

type ClaimDetail = {
  id: number;
  externalClaimId: string | null;
  provider: string;
  status: string;
  externalStatus: string | null;
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

type MankradoAssessment = {
  claimNumber: string;
  name: string | null;
  claimDate: string | null;
  amountPayable: string | null;
  status: string;
  rejectReason: string | null;
};

type HistoryRow = {
  claimNumber: string;
  name: string | null;
  claimDate: string | null;
  amountPayable: string | null;
  status: string;
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
    <div className="grid grid-cols-[minmax(0,11rem)_1fr] border-b border-border-default text-sm last:border-0">
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
}: {
  submissionId: number;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ClaimDetail | null>(null);
  const [assessment, setAssessment] = useState<MankradoAssessment | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [assessmentError, setAssessmentError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { open: openDocument, error: docError } = useClaimDocument();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setDetail(null);
    setAssessment(null);
    setHistory(null);
    setHistoryError("");
    setAssessmentError("");

    api
      .get(`/claims/submissions/${submissionId}`, { signal: controller.signal })
      .then((response) => {
        const data = response.data.data as ClaimDetail;
        setDetail(data);

        // History and the live assessment are Mankrado-only endpoints; historical
        // simulations have no counterpart there.
        if (data.provider !== "MANKRADO") {
          setHistory([]);
          return;
        }

        void api
          .get(`/claims/history/${encodeURIComponent(data.member.controllerId)}`, {
            signal: controller.signal,
          })
          .then((res) => setHistory(res.data.data))
          .catch(() => {
            if (!controller.signal.aborted)
              setHistoryError("Mankrado history is unavailable right now.");
          });

        if (data.externalClaimId) {
          void api
            .get(`/claims/claimdetails/${encodeURIComponent(data.externalClaimId)}`, {
              signal: controller.signal,
            })
            .then((res) => setAssessment(res.data.data))
            .catch(() => {
              if (!controller.signal.aborted)
                setAssessmentError("Live Mankrado assessment is unavailable right now.");
            });
        }
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(getApiError(caught)?.message || "This claim could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [submissionId]);

  const claimNumber = detail?.externalClaimId ?? assessment?.claimNumber ?? null;
  const claimStatus = assessment?.status ?? detail?.externalStatus ?? detail?.status ?? null;
  // The Mankrado date carries no timezone; keep its wall-clock value.
  const netPayableDate = assessment?.claimDate ? assessment.claimDate.replace(/\.\d+$/, "") : null;
  const netPayable = assessmentError
    ? assessmentError
    : !assessment
      ? detail?.externalClaimId
        ? "Loading…"
        : "—"
      : assessment.amountPayable === null
        ? "—"
        : `${formatCurrency(assessment.amountPayable)}${netPayableDate ? ` · ${netPayableDate}` : ""}`;

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
            {loading ? (
              <p className="text-sm text-text-muted">Loading claim details…</p>
            ) : error || !detail ? (
              <Alert tone="error">{error || "Claim not found."}</Alert>
            ) : (
              <>
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

                <Section title="Claim history">
                  {historyError ? (
                    <div className="p-3">
                      <Alert tone="warning">{historyError}</Alert>
                    </div>
                  ) : !history ? (
                    <p className="p-3 text-sm text-text-muted">Loading history…</p>
                  ) : history.length === 0 ? (
                    <p className="p-3 text-sm text-text-muted">
                      No claims returned by Mankrado for this member.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-surface-subtle text-text-muted">
                            <th className="px-3 py-2 font-semibold">Claim date</th>
                            <th className="px-3 py-2 font-semibold">Claim number</th>
                            <th className="px-3 py-2 font-semibold">Claimant</th>
                            <th className="px-3 py-2 text-right font-semibold">Claim amount</th>
                            <th className="px-3 py-2 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((row, index) => (
                            <tr
                              key={`${row.claimNumber}:${index}`}
                              className="border-t border-border-default"
                            >
                              <td className="whitespace-nowrap px-3 py-2">
                                {row.claimDate ?? "—"}
                              </td>
                              <td className="px-3 py-2 font-mono">{row.claimNumber}</td>
                              <td className="px-3 py-2">{row.name || "—"}</td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {row.amountPayable === null
                                  ? "—"
                                  : formatCurrency(row.amountPayable)}
                              </td>
                              <td className="px-3 py-2">
                                <StatusBadge tone={claimStatusTone(row.status)}>
                                  {claimStatusLabel(row.status)}
                                </StatusBadge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>

                <Section title="Claims details">
                  <Row label="Application date" value={formatDate(detail.createdAt)} />
                  <Row label="Claim number" value={claimNumber} />
                  <Row label="Policy holder" value={detail.member.fullName} />
                  <Row label="Staff ID" value={detail.member.controllerId} />
                  <Row label="Claim type" value={labelize(detail.claimType)} />
                  <Row
                    label="Claim status"
                    value={
                      <StatusBadge tone={claimStatusTone(claimStatus)}>
                        {claimStatusLabel(claimStatus)}
                      </StatusBadge>
                    }
                  />
                  <Row
                    label="Claim amount"
                    value={detail.estimatedAmount ? formatCurrency(detail.estimatedAmount) : "—"}
                  />
                  <Row label="Net claim payable" value={netPayable} />
                  {assessment?.rejectReason?.trim() && (
                    <Row label="Rejection reason" value={assessment.rejectReason} />
                  )}
                </Section>

                <Section title="Filing & delivery">
                  <Row label="Filed by" value={filedBy} />
                  <Row label="Filed via" value={filedVia} />
                  <Row label="Branch" value={detail.member.district?.name ?? "—"} />
                  <Row label="Provider" value={detail.provider} />
                  <Row label="Delivery" value={deliveryText} />
                  <Row label="Submitted to Mankrado" value={formatDate(detail.submittedAt)} />
                  {detail.lastSyncedAt && (
                    <Row label="Last synced" value={formatDate(detail.lastSyncedAt)} />
                  )}
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
                                className="rounded-full bg-info-soft px-2.5 py-0.5 text-xs font-semibold text-text-strong hover:underline"
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
              </>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
