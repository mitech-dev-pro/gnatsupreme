import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import { useDistricts } from "@/lib/useDistricts";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { type ImportJob, type ImportRow } from "./ImportReview.model";
export function useImportReview() {
  const { id } = useParams();
  const { districts } = useDistricts();
  const [checkedAt, setCheckedAt] = useState(Date.now);
  const [record, setJob] = useState<ImportJob | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [rowStatus, setRowStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [jobError, setJobError] = useState("");
  const [rowsError, setRowsError] = useState("");
  const [actionError, setError] = useState("");
  const [committing, setCommitting] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmingRerun, setConfirmingRerun] = useState(false);
  const [confirmingCommit, setConfirmingCommit] = useState(false);
  const [rerunMessage, setRerunMessage] = useState("");
  const [mappingRowId, setMappingRowId] = useState<number | null>(null);
  const [mappingDistrictId, setMappingDistrictId] = useState("");
  const [mappingBusy, setMappingBusy] = useState(false);
  const [mappingMessage, setMappingMessage] = useState("");
  const jobAbort = useRef<AbortController | null>(null),
    rowsAbort = useRef<AbortController | null>(null);
  const activeId = useRef(id),
    actionLock = useRef(false);
  const key = `${id}:${page}:${rowStatus}`;
  const [rowsKey, setRowsKey] = useState("");
  const limit = 50;
  const job = record?.id === Number(id) ? record : null;
  const loadJob = useCallback(async () => {
    jobAbort.current?.abort();
    const controller = new AbortController();
    jobAbort.current = controller;
    try {
      const res = await api.get(`/imports/members/${id}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setJob(res.data.data);
      setCheckedAt(Date.now());
      if (!["PENDING", "PROCESSING"].includes(res.data.data.status)) setRerunMessage("");
      setJobError("");
    } catch {
      if (!controller.signal.aborted)
        setJobError("Unable to refresh this import. Showing the last loaded result, if available.");
    }
  }, [id]);
  const loadRows = useCallback(async () => {
    rowsAbort.current?.abort();
    const controller = new AbortController();
    rowsAbort.current = controller;
    setLoading(true);
    try {
      const res = await api.get(`/imports/members/${id}/rows`, {
        signal: controller.signal,
        params: { page, limit, status: rowStatus || undefined },
      });
      if (controller.signal.aborted) return;
      const pages = Math.max(1, res.data.pagination.totalPages);
      if (page > pages) {
        setPage(pages);
        return;
      }
      setRows(res.data.data);
      setRowsKey(key);
      setTotalPages(pages);
      setTotalRows(res.data.pagination.total ?? res.data.data.length);
      setRowsError("");
    } catch {
      if (!controller.signal.aborted) setRowsError("Unable to load rows.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [id, page, rowStatus, key]);
  const refresh = useCallback(async () => {
    await Promise.allSettled([loadJob(), loadRows()]);
  }, [loadJob, loadRows]);
  useEffect(() => {
    activeId.current = id;
    actionLock.current = false;
    setPage(1);
    setRowStatus("");
    setError("");
    setRerunMessage("");
    setConfirmingCommit(false);
    setConfirmingRerun(false);
    setMappingRowId(null);
    setMappingMessage("");
    setCommitting(false);
    setRerunning(false);
    setExporting(false);
    void loadJob();
    return () => {
      activeId.current = undefined;
      jobAbort.current?.abort();
    };
  }, [id, loadJob]);
  useEffect(() => {
    void loadRows();
    return () => rowsAbort.current?.abort();
  }, [loadRows]);
  const polling = Boolean(job && ["PENDING", "PROCESSING"].includes(job.status));
  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh();
      if (!cancelled) timer = setTimeout(poll, 3000);
    };
    timer = setTimeout(poll, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [polling, refresh]);
  const action = async (kind: "commit" | "rerun") => {
    if (actionLock.current) return;
    actionLock.current = true;
    const requestId = id;
    if (kind === "commit") setCommitting(true);
    else setRerunning(true);
    setError("");
    try {
      jobAbort.current?.abort();
      rowsAbort.current?.abort();
      const res = await api.post(`/imports/members/${id}/${kind}`);
      if (activeId.current !== requestId) return;
      setJob(res.data.data);
      setCheckedAt(Date.now());
      setPage(1);
      setConfirmingCommit(false);
      setConfirmingRerun(false);
      setRerunMessage(
        kind === "commit"
          ? "Enrollment has started. Only ready rows will be enrolled."
          : "Unfinished work is resuming. Enrolled rows remain saved.",
      );
      await refresh();
    } catch (err) {
      if (activeId.current === requestId) {
        setError(
          getApiError(err)?.message ||
            "Unable to start this import. Refresh its status before trying again.",
        );
        await refresh();
      }
    } finally {
      if (activeId.current === requestId) {
        actionLock.current = false;
        setCommitting(false);
        setRerunning(false);
      }
    }
  };
  const downloadCorrections = async () => {
    if (exporting) return;
    setExporting(true);
    setError("");
    const requestId = id;
    try {
      const res = await api.get(`/imports/members/${id}/recovery-file`, { responseType: "blob" });
      if (activeId.current !== requestId) return;
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `member-import-${id}-corrections.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      if (activeId.current === requestId)
        setError("The correction file could not be downloaded. Try again.");
    } finally {
      if (activeId.current === requestId) setExporting(false);
    }
  };
  const submitDistrictMapping = async (row: ImportRow) => {
    if (!row.districtName || !mappingDistrictId || mappingBusy) return;
    const requestId = id;
    setMappingBusy(true);
    setMappingMessage("");
    try {
      await api.post("/districts/aliases", {
        alias: row.districtName,
        districtId: Number(mappingDistrictId),
      });
      if (activeId.current !== requestId) return;
      setMappingMessage(
        `Saved the district mapping for "${row.districtName}". Download corrections and upload them to validate using this mapping.`,
      );
      setMappingRowId(null);
      setMappingDistrictId("");
    } catch (err) {
      if (activeId.current === requestId)
        setMappingMessage(getApiError(err)?.message || "Unable to save this district mapping.");
    } finally {
      if (activeId.current === requestId) setMappingBusy(false);
    }
  };
  return {
    checkedAt,
    id,
    districts,
    job,
    rows: rowsKey === key ? rows : [],
    page,
    setPage,
    totalPages: rowsKey === key ? totalPages : 1,
    totalRows,
    rowStatus,
    setRowStatus,
    loading,
    rowsError,
    error: actionError || jobError || rowsError,
    committing,
    rerunning,
    exporting,
    confirmingCommit,
    setConfirmingCommit,
    confirmingRerun,
    setConfirmingRerun,
    rerunMessage,
    mappingRowId,
    setMappingRowId,
    mappingDistrictId,
    setMappingDistrictId,
    mappingBusy,
    mappingMessage,
    rerun: () => action("rerun"),
    handleCommit: () => action("commit"),
    submitDistrictMapping,
    refresh,
    downloadCorrections,
  };
}
