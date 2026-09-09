import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import { useDistricts } from "@/lib/useDistricts";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { type ImportJob, type ReportRow } from "./Report20Review.model";
export function useReport20Review() {
  const { id } = useParams();
  const [checkedAt, setCheckedAt] = useState(Date.now);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [rowStatus, setRowStatus] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [rerunning, setRerunning] = useState(false);
  const [confirmingRerun, setConfirmingRerun] = useState(false);
  const [rerunMessage, setRerunMessage] = useState("");
  const limit = 50;
  const { districts } = useDistricts();
  const [actionRowId, setActionRowId] = useState<number | null>(null);
  const [actionMode, setActionMode] = useState<"resolve" | "alias" | null>(null);
  const [actionDistrictId, setActionDistrictId] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const openAction = (rowId: number, mode: "resolve" | "alias") => {
    setActionRowId((current) => (current === rowId && actionMode === mode ? null : rowId));
    setActionMode(mode);
    setActionDistrictId("");
    setActionError("");
  };
  const submitResolve = async (row: ReportRow) => {
    if (!actionDistrictId) return;
    setActionBusy(true);
    setActionError("");
    try {
      await api.post(`/imports/${id}/rows/${row.id}/resolve`, {
        districtId: Number(actionDistrictId),
      });
      setActionMessage(`Row ${row.rowNumber} was enrolled and marked resolved.`);
      setActionRowId(null);
      await Promise.all([loadJob(), loadRows(true)]);
    } catch (err: unknown) {
      setActionError(getApiError(err)?.message || "Unable to resolve this row.");
    } finally {
      setActionBusy(false);
    }
  };
  const submitAlias = async (row: ReportRow) => {
    if (!actionDistrictId || !row.districtName) return;
    setActionBusy(true);
    setActionError("");
    try {
      await api.post("/districts/aliases", {
        alias: row.districtName,
        districtId: Number(actionDistrictId),
      });
      setActionMessage(
        `Mapped "${row.districtName}" — re-run reconciliation to apply it to every matching row.`,
      );
      setActionRowId(null);
    } catch (err: unknown) {
      setActionError(getApiError(err)?.message || "Unable to save this alias.");
    } finally {
      setActionBusy(false);
    }
  };
  const loadJob = async () => {
    try {
      const res = await api.get(`/imports/${id}`);
      setJob(res.data.data);
      setCheckedAt(Date.now());
    } catch {
      setError("Unable to load this import.");
    }
  };
  const loadRows = async (isBackgroundRefresh = false) => {
    if (isBackgroundRefresh) {
      setRefreshing(true);
    } else {
      setInitialLoading(true);
    }
    try {
      const res = await api.get(`/imports/${id}/issues`, {
        params: { page, limit, status: rowStatus || undefined },
      });
      setRows(res.data.data);
      setTotalPages(res.data.pagination.totalPages);
    } catch {
      setError("Unable to load rows.");
    } finally {
      if (isBackgroundRefresh) {
        setRefreshing(false);
      } else {
        setInitialLoading(false);
      }
    }
  };
  useEffect(() => {
    loadJob();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, page, rowStatus]);
  useEffect(() => {
    if (!job || (job.status !== "PENDING" && job.status !== "PROCESSING")) {
      setRerunMessage("");
      return;
    }
    const jobTimer = setInterval(loadJob, 1500);
    const rowsTimer = setInterval(() => loadRows(true), 5000);
    return () => {
      clearInterval(jobTimer);
      clearInterval(rowsTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);
  const rerun = async () => {
    setRerunning(true);
    setError("");
    setRerunMessage("");
    try {
      const res = await api.post(`/imports/${id}/rerun`);
      setJob(res.data.data);
      setCheckedAt(Date.now());
      setRerunMessage(
        "Reconciliation is running in the background — this page will update automatically.",
      );
      setPage(1);
      setConfirmingRerun(false);
    } catch (err: unknown) {
      setError(getApiError(err)?.message || "Unable to re-run reconciliation.");
    } finally {
      setRerunning(false);
    }
  };
  return {
    checkedAt,
    id,
    job,
    rows,
    page,
    setPage,
    totalPages,
    rowStatus,
    setRowStatus,
    initialLoading,
    refreshing,
    error,
    rerunning,
    confirmingRerun,
    setConfirmingRerun,
    rerunMessage,
    districts,
    actionRowId,
    setActionRowId,
    actionMode,
    actionDistrictId,
    setActionDistrictId,
    actionBusy,
    actionError,
    actionMessage,
    openAction,
    submitResolve,
    submitAlias,
    rerun,
  };
}
