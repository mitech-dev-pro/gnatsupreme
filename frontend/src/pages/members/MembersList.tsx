import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { useDistricts } from "@/lib/useDistricts";
import { Alert, EmptyState } from "@/components/ui/Feedback";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import StatusBadge from "@/components/ui/StatusBadge";
import "./MembersList.css";

type MemberRow = { id: number; controllerId: string; fullName: string; school: string; status: string; createdAt: string; missingFromReport20At: string | null; spouse: { fullName: string } | null; district: { id: number; name: string; region: { id: number; name: string } } | null };
const STATUSES = ["ACTIVE", "PENDING", "FLAGGED", "RETURNED", "REMOVED"];
const PAGE_TITLES: Record<string, string> = { PENDING: "Pending approvals", REMOVED: "Removed members" };

function Status({ value }: { value: string }) {
  const tone = value === "ACTIVE" ? "success" : value === "PENDING" || value === "RETURNED" ? "warning" : value === "FLAGGED" || value === "REMOVED" ? "danger" : "neutral";
  return <StatusBadge tone={tone}>{value.charAt(0) + value.slice(1).toLowerCase()}</StatusBadge>;
}

function ActionMenu({ member }: { member: MemberRow }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const reposition = () => setOpen(false);
    document.addEventListener("click", close);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => { document.removeEventListener("click", close); window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
  }, [open]);

  const toggle = (event: React.MouseEvent) => {
    event.stopPropagation();
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const menuHeight = ["PENDING", "RETURNED", "FLAGGED"].includes(member.status) ? 124 : 88;
      setPosition({ top: rect.bottom + menuHeight > window.innerHeight ? rect.top - menuHeight - 5 : rect.bottom + 5, left: Math.max(8, rect.right - 154) });
    }
    setOpen((current) => !current);
  };

  return <><button ref={buttonRef} type="button" className="members-action-trigger" onClick={toggle} aria-expanded={open} aria-label={`Actions for ${member.fullName}`}>•••</button>{open && createPortal(<div className="members-action-popover" style={position} onClick={(event) => event.stopPropagation()} role="menu"><Link to={`/members/${member.id}`} role="menuitem">View profile</Link><Link to={`/members/${member.id}?edit=member`} role="menuitem">Edit member</Link>{["PENDING", "RETURNED", "FLAGGED"].includes(member.status) && <Link to={`/members/${member.id}#workflow`} role="menuitem">Review workflow</Link>}</div>, document.body)}</>;
}

export default function MembersList() {
  const [params, setParams] = useSearchParams();
  const { districts } = useDistricts();
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState(params.get("search") ?? "");
  const [selected, setSelected] = useState<number[]>([]);

  const page = Math.max(1, Number(params.get("page")) || 1);
  const search = params.get("search") ?? "";
  const status = params.get("status") ?? "";
  const districtId = params.get("districtId") ?? "";
  const missingFromReport20 = params.get("missingFromReport20") === "1";
  const limit = [5, 10, 20].includes(Number(params.get("limit"))) ? Number(params.get("limit")) : 10;
  const filtered = Boolean(search || status || districtId || missingFromReport20);
  const pageTitle = PAGE_TITLES[status] ?? "Members";

  const regions = useMemo(() => Array.from(new Set(districts.map((item) => item.region.name))).sort(), [districts]);
  const selectedDistrict = districts.find((item) => String(item.id) === districtId);

  const updateParams = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    setParams(next);
  };

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await api.get("/members", { params: { page, limit, search: search || undefined, status: status || undefined, districtId: districtId || undefined, missingFromReport20: missingFromReport20 || undefined } });
      setRows(response.data.data); setTotal(response.data.pagination.total); setTotalPages(Math.max(1, response.data.pagination.totalPages));
    } catch { setError("Members could not be loaded. Check your connection and try again."); }
    finally { setLoading(false); }
  }, [districtId, limit, missingFromReport20, page, search, status]);

  useEffect(() => { void load(); }, [load]);

  const submitSearch = (event: FormEvent) => { event.preventDefault(); updateParams({ search: searchInput.trim() || null, page: null }); };
  const clearFilters = () => { setSearchInput(""); setParams({}); };
  const allSelected = rows.length > 0 && rows.every((member) => selected.includes(member.id));
  const toggleAll = () => setSelected(allSelected ? selected.filter((id) => !rows.some((member) => member.id === id)) : Array.from(new Set([...selected, ...rows.map((member) => member.id)])));
  const toggleOne = (id: number) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const formatEnrolled = (value: string) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));

  return <div className="members-page">
    <PageHeader eyebrow="Member administration" title={pageTitle} description={loading ? "Loading records" : `${total.toLocaleString()} ${total === 1 ? "member" : "members"} in your access scope`} actions={<><Link className="members-button members-button--quiet" to="/members/upload">Import file</Link><Link className="members-button members-button--primary" to="/members/new"><b aria-hidden="true">+</b> Add member</Link></>} />

    <section className="members-toolbar" aria-label="Member filters">
      <form onSubmit={submitSearch} className="members-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search name, Controller ID, Ghana Card or school" aria-label="Search members"/><button type="submit">Search</button></form>
      <select value={status} onChange={(event) => updateParams({ status: event.target.value || null, page: null })} aria-label="Filter by status"><option value="">All statuses</option>{STATUSES.map((item) => <option key={item} value={item}>{item.charAt(0) + item.slice(1).toLowerCase()}</option>)}</select>
      <select value={districtId} onChange={(event) => updateParams({ districtId: event.target.value || null, page: null })} aria-label="Filter by district"><option value="">All districts</option>{regions.map((region) => <optgroup key={region} label={region}>{districts.filter((item) => item.region.name === region).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}</select>
      <label className="members-page-size"><span>Show</span><select value={limit} onChange={(event) => updateParams({ limit: event.target.value, page: null })} aria-label="Rows per page">{[5, 10, 20].map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#5b6472", whiteSpace: "nowrap" }}>
        <input type="checkbox" checked={missingFromReport20} onChange={(event) => updateParams({ missingFromReport20: event.target.checked ? "1" : null, page: null })} />
        Missing from Report 20
      </label>
      {filtered && <button className="members-clear" type="button" onClick={clearFilters}>Clear filters</button>}
    </section>

    {selectedDistrict && <div className="members-filter-note">Showing members in <strong>{selectedDistrict.name}</strong>, {selectedDistrict.region.name}</div>}

    {error && <div className="mb-3"><Alert tone="error">{error} <button className="ml-2 underline" onClick={() => void load()}>Try again</button></Alert></div>}
    <section className="members-table-shell" aria-label="Member register">
      {loading ? <div className="members-loading" aria-label="Loading members">{Array.from({ length: 7 }).map((_, index) => <span key={index}/>)}</div> : error ? null : rows.length === 0 ? <EmptyState title={filtered ? "No members match these filters" : "Your member register is empty"} description={filtered ? "Try a different search, status, or district." : "Add a member manually or import an enrollment file to begin."} action={filtered ? <button onClick={clearFilters}>Clear filters</button> : <div><Link to="/members/new">Add member</Link><Link to="/members/upload">Import file</Link></div>} /> : <>
        {selected.length > 0 && <div className="members-selection"><strong>{selected.length}</strong> selected <button type="button" onClick={() => setSelected([])}>Clear selection</button></div>}
        <div className="members-table-wrap"><table className="members-table"><thead><tr><th className="members-check"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all members on this page" /></th><th className="members-number">#</th><th>Member</th><th>Controller ID</th><th>School</th><th>District and region</th><th>Spouse</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rows.map((member, index) => <tr key={member.id} className={selected.includes(member.id) ? "is-selected" : ""}><td className="members-check"><input type="checkbox" checked={selected.includes(member.id)} onChange={() => toggleOne(member.id)} aria-label={`Select ${member.fullName}`} /></td><td className="members-number">{(page - 1) * limit + index + 1}</td><td><Link to={`/members/${member.id}`}><span className="members-avatar">{member.fullName.split(/\s+/).slice(0,2).map((part) => part[0]).join("")}</span><span><strong>{member.fullName}</strong><small>Enrolled {formatEnrolled(member.createdAt)}</small></span></Link></td><td><code>{member.controllerId}</code></td><td title={member.school}>{member.school}</td><td>{member.district ? <><strong className="members-location">{member.district.name}</strong><small className="members-region">{member.district.region.name}</small></> : <strong className="members-location" style={{ color: "#b9791a" }}>No district</strong>}</td><td>{member.spouse ? <span className="members-spouse"><strong>{member.spouse.fullName}</strong><small>Recorded</small></span> : <span className="members-none">Not recorded</span>}</td><td><Status value={member.status}/>{member.missingFromReport20At && <span title="Not found in the most recent Report 20 file" style={{ display: "inline-block", marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: "#7a5c00", background: "#fdf6e3", border: "1px solid #f0c96b", borderRadius: 6, padding: "1px 6px" }}>Missing R20</span>}</td><td><ActionMenu member={member}/></td></tr>)}</tbody></table></div>
        <div className="members-cards">{rows.map((member, index) => <article key={member.id} className={selected.includes(member.id) ? "is-selected" : ""}><input type="checkbox" checked={selected.includes(member.id)} onChange={() => toggleOne(member.id)} aria-label={`Select ${member.fullName}`} /><span className="members-avatar">{member.fullName.split(/\s+/).slice(0,2).map((part) => part[0]).join("")}</span><div><Link to={`/members/${member.id}`}><strong>{(page - 1) * limit + index + 1}. {member.fullName}</strong></Link><small>{member.controllerId} · Enrolled {formatEnrolled(member.createdAt)}</small><span>{member.district ? `${member.district.name}, ${member.district.region.name}` : "No district"}</span><span>{member.spouse?.fullName ? `Spouse: ${member.spouse.fullName}` : "Spouse not recorded"}</span></div><div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}><Status value={member.status}/>{member.missingFromReport20At && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#7a5c00", background: "#fdf6e3", border: "1px solid #f0c96b", borderRadius: 6, padding: "1px 6px" }}>Missing R20</span>}</div></article>)}</div>
      </>}
    </section>

    {!loading && !error && total > 0 && <Pagination page={page} totalPages={totalPages} totalItems={total} itemLabel="members" onPageChange={(nextPage) => updateParams({ page: String(nextPage) })} />}
  </div>;
}
