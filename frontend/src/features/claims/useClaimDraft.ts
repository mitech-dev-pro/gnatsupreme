import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import { draftSignature, type ClaimDraft, type ClaimDraftPayload } from "./claimDrafts.model";

export function useClaimDraft({
  audience,
  memberId,
  payload,
  documentIds,
  ready,
  enabled = true,
  getSubmissionKey,
  setSubmissionKey,
  apply,
  pending = false,
}: {
  audience: "staff" | "member";
  memberId: number | undefined;
  payload: ClaimDraftPayload;
  documentIds: number[];
  ready: boolean;
  enabled?: boolean;
  getSubmissionKey: () => string;
  setSubmissionKey: (value: string) => void;
  apply: (draft: ClaimDraft, signal: AbortSignal) => void | Promise<void>;
  pending?: boolean;
}) {
  const [params, setParams] = useSearchParams(),
    navigate = useNavigate();
  const requestedId = enabled ? params.get("draft") : null;
  const endpoint = audience === "member" ? "/member-portal/claims/drafts" : "/claims/drafts";
  const [record, setRecord] = useState<ClaimDraft | null>(null);
  const recordRef = useRef<ClaimDraft | null>(null),
    completed = useRef(false),
    savingRef = useRef(false);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [saving, setSaving] = useState(false),
    [loading, setLoading] = useState(Boolean(requestedId)),
    [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const keyCallbacks = useRef({ get: getSubmissionKey, set: setSubmissionKey });
  const blockedRef = useRef(false);
  useEffect(() => {
    keyCallbacks.current = { get: getSubmissionKey, set: setSubmissionKey };
  }, [getSubmissionKey, setSubmissionKey]);
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  }, [apply]);
  const signature = draftSignature(payload, documentIds),
    dirty = baseline !== null && signature !== baseline;
  useEffect(() => {
    if (ready && !requestedId && baseline === null) setBaseline(signature);
  }, [ready, requestedId, baseline, signature]);
  useEffect(() => {
    if (!ready || !requestedId || String(recordRef.current?.id) === requestedId) return;
    const controller = new AbortController();
    setBaseline(null);
    setRecord(null);
    recordRef.current = null;
    setLoading(true);
    setLoadError("");
    (async () => {
      try {
        const response = await api.get(`${endpoint}/${requestedId}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        const draft = response.data.data as ClaimDraft;
        await applyRef.current(draft, controller.signal);
        if (controller.signal.aborted) return;
        recordRef.current = draft;
        setRecord(draft);
        keyCallbacks.current.set(draft.submissionKey);
        setBaseline(
          draftSignature(
            draft.payload,
            draft.documents.map((file) => file.id),
          ),
        );
      } catch (caught) {
        if (controller.signal.aborted) return;
        const data = (caught as { response?: { data?: { submissionId?: number } } }).response?.data;
        if (data?.submissionId) {
          completed.current = true;
          navigate(
            audience === "member"
              ? `/member/claims#claim-${data.submissionId}`
              : `/claims/${data.submissionId}`,
            { replace: true },
          );
        } else
          setLoadError(
            getApiError(caught)?.message ||
              "The draft could not be loaded. Return to your drafts and try again.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [ready, requestedId, endpoint, audience, navigate]);
  const persist = async (): Promise<ClaimDraft> => {
    if (!enabled || !memberId || savingRef.current)
      throw new Error("Select a member and wait for the current save to finish.");
    if (record && !dirty) return record;
    savingRef.current = true;
    setSaving(true);
    setError("");
    const capturedSignature = signature;
    try {
      const body = {
        memberId,
        payload,
        documentIds,
        submissionKey: keyCallbacks.current.get(),
        ...(recordRef.current ? { revision: recordRef.current.revision } : {}),
      };
      const response = recordRef.current
        ? await api.put(`${endpoint}/${recordRef.current.id}`, body)
        : await api.post(endpoint, body);
      const next = response.data.data as ClaimDraft;
      if (!next?.id || !next.submissionKey) throw Error("The draft save could not be confirmed.");
      recordRef.current = next;
      setRecord(next);
      setBaseline(capturedSignature);
      keyCallbacks.current.set(next.submissionKey);
      if (!blockedRef.current)
        setParams(
          (previous) => {
            const nextParams = new URLSearchParams(previous);
            nextParams.set("draft", String(next.id));
            return nextParams;
          },
          { replace: true },
        );
      return next;
    } catch (caught) {
      setError(
        getApiError(caught)?.message ||
          (caught instanceof Error
            ? caught.message
            : "The draft could not be saved. Your changes remain on this page."),
      );
      throw caught;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) => {
        if (completed.current || (!dirty && !pending && !saving)) return false;
        if (
          currentLocation.pathname === nextLocation.pathname &&
          new URLSearchParams(nextLocation.search).get("draft") === String(recordRef.current?.id)
        )
          return false;
        return true;
      },
      [dirty, pending, saving],
    ),
  );
  useEffect(() => {
    if (!dirty && !pending && !saving) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!completed.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending, saving]);
  useEffect(() => {
    blockedRef.current = blocker.state === "blocked";
  }, [blocker.state]);
  const keepEditing = () => {
    if (blocker.state === "blocked") blocker.reset();
    if (recordRef.current && requestedId !== String(recordRef.current.id))
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set("draft", String(recordRef.current!.id));
          return next;
        },
        { replace: true },
      );
  };
  return {
    keepEditing,
    record,
    dirty,
    saving,
    error,
    loading: Boolean(requestedId) && (!ready || loading),
    loadError,
    persist,
    enabled,
    canSave: enabled && Boolean(memberId),
    markSubmitted: () => {
      completed.current = true;
    },
    blocker,
  };
}
