import api from "@/lib/api";
import { getApiError } from "@/lib/errorExtract";
import { useDistricts } from "@/lib/useDistricts";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { type ImportJob, type ImportRow } from "./ImportReview.model";
export function useImportReview() {
  const { id } = useParams();
  const { districts } = useDistricts();
  const [checkedAt, setCheckedAt] = useState(Date.now);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [rowStatus, setRowStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [committing, setCommitting] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [confirmingRerun, setConfirmingRerun] = useState(false);
  const [rerunMessage, setRerunMessage] = useState("");
  const [mappingRowId, setMappingRowId] = useState<number | null>(null);
  const [mappingDistrictId, setMappingDistrictId] = useState("");
  const [mappingBusy, setMappingBusy] = useState(false);
  const [mappingMessage, setMappingMessage] = useState("");
  const limit = 50;
  const loadJob = async () => {
    try {
      const res = await api.get(`/imports/members/${id}`);
      setJob(res.data.data);
      setCheckedAt(Date.now());
    } catch {
      setError("Unable to load this import.");
    }
  };
  const loadRows = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/imports/members/${id}/rows`, {
        params: { page, limit, status: rowStatus || undefined },
      });
      setRows(res.data.data);
      setTotalPages(res.data.pagination.totalPages);
    } catch {
      setError("Unable to load rows.");
    } finally {
      setLoading(false);
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
    if (!job || (job.status !== "PENDING" && job.status !== "PROCESSING")) return;
    const timer = setInterval(async () => {
      await loadJob();
      await loadRows();
    }, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);
  const rerun = async () => {
    setRerunning(true);
    setError("");
    setRerunMessage("");
    try {
      const res = await api.post(`/imports/members/${id}/rerun`);
      setJob(res.data.data);
      setCheckedAt(Date.now());
      setRerunMessage(
        "This import is running again in the background — this page will update automatically.",
      );
      setPage(1);
      setConfirmingRerun(false);
    } catch (err: unknown) {
      setError(getApiError(err)?.message || "Unable to retry this import.");
    } finally {
      setRerunning(false);
    }
  };
  const handleCommit = async () => {
    setCommitting(true);
    setError("");
    try {
      const res = await api.post(`/imports/members/${id}/commit`);
      setJob(res.data.data);
      setCheckedAt(Date.now());
    } catch (err: unknown) {
      setError(getApiError(err)?.message || "Unable to commit this import.");
    } finally {
      setCommitting(false);
    }
  };
  const submitDistrictMapping = async (row: ImportRow) => {
    if (!row.districtName || !mappingDistrictId) return;
    setMappingBusy(true);
    setMappingMessage("");
    try {
      await api.post("/districts/aliases", {
        alias: row.districtName,
        districtId: Number(mappingDistrictId),
      });
      setMappingMessage(`Mapped "${row.districtName}" — re-upload this file to pick up the fix.`);
      setMappingRowId(null);
      setMappingDistrictId("");
    } catch (err: unknown) {
      setMappingMessage(getApiError(err)?.message || "Unable to save this district mapping.");
    } finally {
      setMappingBusy(false);
    }
  };
  return {
    checkedAt,
    id,
    districts,
    job,
    rows,
    page,
    setPage,
    totalPages,
    rowStatus,
    setRowStatus,
    loading,
    error,
    committing,
    rerunning,
    confirmingRerun,
    setConfirmingRerun,
    rerunMessage,
    mappingRowId,
    setMappingRowId,
    mappingDistrictId,
    setMappingDistrictId,
    mappingBusy,
    mappingMessage,
    rerun,
    handleCommit,
    submitDistrictMapping,
  };
}
