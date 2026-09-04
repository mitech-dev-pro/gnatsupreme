import { CLAIM_DOCUMENT_MANIFEST, type ClaimType } from "@/lib/claimDocuments";
import FileUploadField from "@/components/ui/FileUploadField";
import StatusBadge from "@/components/ui/StatusBadge";

export type UploadedClaimDocument = { id: number; slotKey: string | null; originalName: string };

type ClaimDocumentChecklistProps = {
  claimType: ClaimType;
  documents: UploadedClaimDocument[];
  uploadingSlot: string | null;
  error?: string;
  onUpload: (slotKey: string, file: File) => void;
  onRemove: (doc: UploadedClaimDocument) => void;
};

export default function ClaimDocumentChecklist({ claimType, documents, uploadingSlot, error, onUpload, onRemove }: ClaimDocumentChecklistProps) {
  const manifest = CLAIM_DOCUMENT_MANIFEST[claimType] ?? [];
  const requiredSlots = manifest.filter((d) => d.tag === "REQUIRED");
  const anyOneSlots = manifest.filter((d) => d.tag === "ANY_ONE_REQUIRED");
  const docsBySlot = (slotKey: string) => documents.filter((doc) => doc.slotKey === slotKey);
  const satisfiedRequired = requiredSlots.filter((slot) => docsBySlot(slot.key).length > 0).length;
  const anyOneSatisfied = anyOneSlots.some((slot) => docsBySlot(slot.key).length > 0);
  const denominator = requiredSlots.length + (anyOneSlots.length > 0 ? 1 : 0);
  const numerator = satisfiedRequired + (anyOneSlots.length > 0 && anyOneSatisfied ? 1 : 0);

  return (
    <div>
      {claimType === "DEATH" && (
        <p className="mb-2 text-[11.5px] italic text-(--text-muted)">Provide any ONE of the death-proof documents below.</p>
      )}
      <div className="rounded-[9px] border border-(--border-default)">
        {manifest.map((slot, index) => {
          const uploaded = docsBySlot(slot.key);
          const tone = slot.tag === "ANY_ONE_REQUIRED" ? "warning" : slot.tag === "REQUIRED" ? "danger" : "neutral";
          const tagLabel = slot.tag === "ANY_ONE_REQUIRED" ? "Any one required" : slot.tag === "REQUIRED" ? "Required" : "Optional";
          return (
            <div key={slot.key} className={`flex flex-wrap items-center gap-2 px-3 py-2.5 text-[12px] ${index !== manifest.length - 1 ? "border-b border-(--border-default)" : ""}`}>
              <span className="min-w-0 flex-1 font-semibold text-(--ink)">{slot.label}</span>
              <StatusBadge tone={tone}>{tagLabel}</StatusBadge>
              {uploaded.length > 0 ? (
                uploaded.map((doc) => (
                  <span key={doc.id} className="inline-flex items-center gap-1.5 rounded-full bg-(--info-soft) px-2.5 py-0.5 text-[11px] font-semibold text-(--text-strong)">
                    {doc.originalName}
                    <button type="button" onClick={() => onRemove(doc)} className="font-extrabold text-(--danger)" aria-label={`Remove ${doc.originalName}`}>×</button>
                  </span>
                ))
              ) : (
                <FileUploadField label="Upload" busy={uploadingSlot === slot.key} onSelect={(file) => onUpload(slot.key, file)} />
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="mt-1.5 text-[11.5px] font-semibold text-(--danger)">{error}</p>}
      <div className="mt-2 flex justify-between rounded-[8px] bg-(--surface-subtle) px-3 py-2 text-[11.5px] font-bold text-(--text-strong)">
        <span>Documents attached</span>
        <span>{numerator} of {denominator} required</span>
      </div>
    </div>
  );
}
