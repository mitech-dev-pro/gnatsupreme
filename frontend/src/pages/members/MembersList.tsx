import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";

type MemberRow = {
  id: number;
  controllerId: string;
  fullName: string;
  school: string;
  status: string;
  district: { id: number; name: string; region: { id: number; name: string } };
};

const STATUSES = ["ACTIVE", "PENDING", "FLAGGED", "RETURNED", "REMOVED"];

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-[#dff7ee] text-[#17805f]",
  PENDING: "bg-[#fbf0dd] text-[#b9791a]",
  FLAGGED: "bg-[#fbe9e9] text-[#c23b3b]",
  RETURNED: "bg-[#eeebfb] text-[#6e5ad6]",
  REMOVED: "bg-[#eef0fa] text-[#5b6472]",
};

export default function MembersList() {
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const limit = 20;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await api.get("/members", {
          params: { page, limit, search: search || undefined, status: status || undefined },
        });
        if (!cancelled) {
          setRows(res.data.data);
          setTotal(res.data.pagination.total);
          setTotalPages(res.data.pagination.totalPages);
        }
      } catch {
        if (!cancelled) setError("Unable to load members.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, search, status]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[25px] font-extrabold text-[#1e2761]">
            All Members
          </h1>
          <div className="mt-1 text-[12.5px] text-[#5b6472]">
            {total} member{total === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <form onSubmit={handleSearchSubmit} className="flex flex-1 min-w-52 gap-2">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, controller ID, Ghana Card, school…"
            className="w-full rounded-[9px] border border-[#e5e9f0] bg-[#fbfcfe] px-3 py-2 text-[12.5px] focus:border-[#1f9c7c] focus:shadow-[0_0_0_3px_#dff7ee] focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-[9px] bg-[#1f9c7c] px-4 py-2 text-[12.5px] font-bold text-white transition hover:bg-[#17805f]"
          >
            Search
          </button>
        </form>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-[9px] border border-[#e5e9f0] bg-white px-3 py-2 text-[12.5px] text-[#171b26]"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-[12px] border border-[#e5e9f0] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-[#e5e9f0] bg-[#fafbfd] text-[11px] font-semibold uppercase tracking-wide text-[#5b6472]">
                <th className="px-4 py-2.5">Controller ID</th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">School</th>
                <th className="px-4 py-2.5">District / Region</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[#5b6472]">
                    Loading…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[#c23b3b]">
                    {error}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[#5b6472]">
                    No members found.
                  </td>
                </tr>
              ) : (
                rows.map((m) => (
                  <tr key={m.id} className="border-b border-[#e5e9f0] last:border-0 hover:bg-[#fafbfd]">
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/members/${m.id}`}
                        className="font-semibold text-[#1e2761] hover:underline"
                      >
                        {m.controllerId}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-[#171b26]">{m.fullName}</td>
                    <td className="px-4 py-2.5 text-[#5b6472]">{m.school}</td>
                    <td className="px-4 py-2.5 text-[#5b6472]">
                      {m.district.name} · {m.district.region.name}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[m.status] ?? ""}`}
                      >
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-[12.5px]">
          <span className="text-[#5b6472]">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-[9px] border border-[#e5e9f0] bg-white px-3 py-1.5 font-semibold text-[#1e2761] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-[9px] border border-[#e5e9f0] bg-white px-3 py-1.5 font-semibold text-[#1e2761] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
