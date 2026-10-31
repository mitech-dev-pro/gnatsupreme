import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import { Alert } from "@/components/ui/Feedback";
import type { useClaimDraft } from "./useClaimDraft";
import type { ClaimDraftPayload } from "./claimDrafts.model";
import { draftTasks } from "./claimDrafts.model";
import type { UploadedClaimDocument } from "@/components/claims/ClaimDocumentChecklist";

export default function ClaimDraftControls({
  draft,
  payload,
  documents,
  busy,
}: {
  draft: ReturnType<typeof useClaimDraft>;
  payload: ClaimDraftPayload;
  documents: UploadedClaimDocument[];
  busy: boolean;
}) {
  const save = async () => {
    try {
      await draft.persist();
    } catch {
      /* Error remains visible beside the save action. */
    }
  };
  const tasks = draftTasks(payload, documents);
  return (
    <>
      {draft.enabled && (
        <section
          aria-label="Claim draft"
          className="mb-5 space-y-3 rounded-xl border border-border-default bg-(--surface-raised) p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-text-strong">
                {draft.record
                  ? `DRAFT-${String(draft.record.id).padStart(6, "0")}`
                  : "Save your progress"}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {draft.record
                  ? `${draft.dirty ? "Unsaved changes. " : "Saved. "}Last saved ${new Date(draft.record.updatedAt).toLocaleString()}`
                  : "Save incomplete details and attachments, then continue later. Saving does not submit a claim."}
              </p>
            </div>
            <Button
              variant="secondary"
              disabled={!draft.canSave || busy}
              loading={draft.saving}
              loadingLabel="Saving draft…"
              onClick={() => void save()}
            >
              Save draft
            </Button>
          </div>
          {draft.error && draft.blocker.state !== "blocked" && (
            <Alert tone="error">{draft.error}</Alert>
          )}
          {draft.record && (
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-ink">
                Still to complete ({tasks.length})
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-text-muted">
                {tasks.map((task) => (
                  <li key={task}>{task}</li>
                ))}
              </ul>
            </details>
          )}
          {Boolean(draft.record?.missingDocumentCount) && (
            <Alert tone="warning">
              Some saved attachments are unavailable. Attach them again before submitting.
            </Alert>
          )}
        </section>
      )}
      {draft.blocker.state === "blocked" && (
        <Dialog
          title="Leave this claim?"
          busy={draft.saving || busy}
          onClose={draft.keepEditing}
          description="You have unsaved changes. Save a draft to continue later, or discard changes made since your last save."
        >
          {draft.error && (
            <div className="mb-4">
              <Alert tone="error">{draft.error}</Alert>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={draft.saving || busy} onClick={draft.keepEditing}>
              Keep editing
            </Button>
            <Button
              variant="danger"
              disabled={draft.saving || busy}
              onClick={() => draft.blocker.state === "blocked" && draft.blocker.proceed()}
            >
              Discard changes
            </Button>
            {draft.canSave && (
              <Button
                loading={draft.saving}
                disabled={busy}
                loadingLabel="Saving…"
                onClick={() => {
                  void draft
                    .persist()
                    .then(() => {
                      if (draft.blocker.state === "blocked") draft.blocker.proceed();
                    })
                    .catch(() => undefined);
                }}
              >
                Save draft and leave
              </Button>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
