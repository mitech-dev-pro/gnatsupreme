import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { useDistricts } from "@/lib/useDistricts";
import { useSchools } from "@/lib/useSchools";
import { Alert, EmptyState } from "@/components/ui/Feedback";
import Dropdown from "@/components/ui/Dropdown";
import PageHeader from "@/components/ui/PageHeader";
import Pagination from "@/components/ui/Pagination";
import StatusBadge from "@/components/ui/StatusBadge";
import "./MembersList.css";

type MemberRow = { id: number; controllerId: string; fullName: string; school: string; status: string; createdAt: string; missingFromReport20At: string | null; spouse: { fullName: string } | null; district: { id: number; name: string; region: { id: number; name: string } } | null };
type MemberStats = { totalMembers: number; newThisMonth: number; activeCoverage: number; activeCoveragePct: number; pendingApproval: number; report20Mismatch: number; removedThisMonth: number; removedBreakdownNote: string };
const STATUSES = ["ACTIVE", "PENDING", "FLAGGED", "RETURNED", "REMOVED", "INACTIVE"];
const PAGE_TITLES: Record<string, string> = { PENDING: "Pending approvals", REMOVED: "Removed members" };

function Icon({ children }: { children: React.ReactNode }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

const STAT_ICONS = {
  members: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  alert: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4M12 17h.01" /></>,
  userMinus: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8h6" /></>,
};

function StatCards({ stats, loading }: { stats: MemberStats | null; loading: boolean }) {
  const cards = stats
    ? [
        { key: "total", icon: STAT_ICONS.members, iconTone: "navy", value: stats.totalMembers, label: "Total Members", note: `+${stats.newThisMonth} this month`, noteTone: "green" },
        { key: "coverage", icon: STAT_ICONS.check, iconTone: "green", value: stats.activeCoverage, label: "Active Coverage", note: `${stats.activeCoveragePct}%`, noteTone: "green" },
        { key: "pending", icon: STAT_ICONS.clock, iconTone: "amber", value: stats.pendingApproval, label: "Pending Approval", note: "Awaiting regional review", noteTone: "amber" },
        { key: "mismatch", icon: STAT_ICONS.alert, iconTone: stats.report20Mismatch > 0 ? "red" : "green", value: stats.report20Mismatch, label: "Report 20 Mismatch", note: stats.report20Mismatch > 0 ? "Needs district review" : "All matched", noteTone: stats.report20Mismatch > 0 ? "red" : "green" },
        { key: "removed", icon: STAT_ICONS.userMinus, iconTone: "neutral", value: stats.removedThisMonth, label: "Removed This Month", note: stats.removedBreakdownNote, noteTone: "neutral" },
      ]
    : Array.from({ length: 5 }, (_, index) => ({ key: `skeleton-${index}`, icon: STAT_ICONS.members, iconTone: "navy", value: 0, label: "", note: "", noteTone: "neutral" }));

  return <section className="members-stats" aria-label="Member summary">
    {cards.map((card) => <article key={card.key} className={loading ? "members-stat members-stat--loading" : "members-stat"}>
      <span className={`members-stat__icon members-stat__icon--${card.iconTone}`}><Icon>{card.icon}</Icon></span>
      <strong>{loading ? "" : card.value.toLocaleString()}</strong>
      <span className="members-stat__label">{card.label}</span>
      <span className={`members-stat__note members-stat__note--${card.noteTone}`}>{card.note}</span>
    </article>)}
  </section>;
}

function Status({ value }: { value: string }) {
  const tone = value === "ACTIVE" ? "success" : value === "PENDING" || value === "RETURNED" ? "warning" : value === "FLAGGED" || value === "REMOVED" || value === "INACTIVE" ? "danger" : "neutral";
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
  const { user } = useAuth();
  const { districts } = useDistricts();
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState(params.get("search") ?? "");
  const [selected, setSelected] = useState<number[]>([]);
  const [stats, setStats] = useState<MemberStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const page = Math.max(1, Number(params.get("page")) || 1);
  const search = params.get("search") ?? "";
  const status = params.get("status") ?? "";
  const regionId = params.get("regionId") ?? "";
  const districtId = params.get("districtId") ?? "";
  const school = params.get("school") ?? "";
  const missingFromReport20 = params.get("missingFromReport20") === "1";
  const limit = [5, 10, 20].includes(Number(params.get("limit"))) ? Number(params.get("limit")) : 10;
  const filtered = Boolean(search || status || regionId || districtId || school || missingFromReport20);
  const pageTitle = PAGE_TITLES[status] ?? "Members";

  const isDistrictAdmin = user?.role === "DISTRICT_ADMIN";
  const canSeeRegion = user?.role === "SUPER_ADMIN" || user?.role === "NATIONAL_ADMIN";
  const canSeeDistrict = !isDistrictAdmin;
  const schoolsEnabled = isDistrictAdmin || Boolean(districtId);
  const { schools } = useSchools(districtId, schoolsEnabled);

  const regions = useMemo(() => Array.from(new Set(districts.map((item) => item.region.name))).sort(), [districts]);
  const regionOptions = useMemo(() => {
    const map = new Map<number, string>();
    districts.forEach((item) => map.set(item.region.id, item.region.name));
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [districts]);
  const districtsForRegion = regionId ? districts.filter((item) => String(item.region.id) === regionId) : districts;
  const selectedDistrict = districts.find((item) => String(item.id) === districtId);

  const updateParams = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    setParams(next);
  };

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await api.get("/members", { params: { page, limit, search: search || undefined, status: status || undefined, regionId: regionId || undefined, districtId: districtId || undefined, school: school || undefined, missingFromReport20: missingFromReport20 || undefined } });
      setRows(response.data.data); setTotal(response.data.pagination.total); setTotalPages(Math.max(1, response.data.pagination.totalPages));
    } catch { setError("Members could not be loaded. Check your connection and try again."); }
    finally { setLoading(false); }
  }, [districtId, limit, missingFromReport20, page, regionId, school, search, status]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    api.get("/members/stats")
      .then((response) => setStats(response.data.data))
      .catch((err) => { console.error("Failed to load member stats", err); setStats(null); })
      .finally(() => setStatsLoading(false));
  }, []);

  const submitSearch = (event: FormEvent) => { event.preventDefault(); updateParams({ search: searchInput.trim() || null, page: null }); };
  const onRegionChange = (value: string) => updateParams({ regionId: value || null, districtId: null, school: null, page: null });
  const onDistrictChange = (value: string) => updateParams({ districtId: value || null, school: null, page: null });
  const onSchoolChange = (value: string) => updateParams({ school: value || null, page: null });
  const clearFilters = () => { setSearchInput(""); setParams({}); };
  const allSelected = rows.length > 0 && rows.every((member) => selected.includes(member.id));
  const toggleAll = () => setSelected(allSelected ? selected.filter((id) => !rows.some((member) => member.id === id)) : Array.from(new Set([...selected, ...rows.map((member) => member.id)])));
  const toggleOne = (id: number) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const formatEnrolled = (value: string) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));

  return <div className="members-page">
    <PageHeader eyebrow="Member administration" title={pageTitle} description={loading ? "Loading records" : `${total.toLocaleString()} ${total === 1 ? "member" : "members"} in your access scope`} actions={<><Link className="members-button members-button--quiet" to="/members/upload">Import file</Link><Link className="members-button members-button--primary" to="/members/new"><b aria-hidden="true">+</b> Add member</Link></>} />

    <StatCards stats={stats} loading={statsLoading} />

    <section className="members-toolbar" aria-label="Member filters">
      <form onSubmit={submitSearch} className="members-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search name, ID, or school" aria-label="Search members"/><button type="submit">Search</button></form>
      <Dropdown
        className="w-[190px]"
        value={status}
        onChange={(value) => updateParams({ status: value || null, page: null })}
        aria-label="Filter by status"
        options={[{ value: "", label: "All statuses" }, ...STATUSES.map((item) => ({ value: item, label: item.charAt(0) + item.slice(1).toLowerCase() }))]}
      />
      {canSeeRegion && (
        <Dropdown
          className="w-[170px]"
          value={regionId}
          onChange={onRegionChange}
          aria-label="Filter by region"
          options={[{ value: "", label: "All regions" }, ...regionOptions.map((r) => ({ value: String(r.id), label: r.name }))]}
        />
      )}
      {canSeeDistrict && (
        <Dropdown
          className="w-[190px]"
          value={districtId}
          onChange={onDistrictChange}
          aria-label="Filter by district"
          options={regionId ? [{ value: "", label: "All districts" }, ...districtsForRegion.map((d) => ({ value: String(d.id), label: d.name }))] : [{ value: "", label: "All districts" }]}
          groups={regionId ? undefined : regions.map((region) => ({
            label: region,
            options: districts.filter((item) => item.region.name === region).map((item) => ({ value: String(item.id), label: item.name })),
          }))}
        />
      )}
      <Dropdown
        className="w-[190px]"
        value={school}
        onChange={onSchoolChange}
        aria-label="Filter by school"
        disabled={!schoolsEnabled}
        dropdownCategory="schools"
        placeholder={schoolsEnabled ? "All schools" : "Select a district first"}
        options={schoolsEnabled ? [{ value: "", label: "All schools" }, ...schools.map((s) => ({ value: s, label: s }))] : []}
      />
      <label className="members-page-size">
        <span>Show</span>
        <Dropdown
          className="w-[74px]"
          value={limit}
          onChange={(value) => updateParams({ limit: value, page: null })}
          aria-label="Rows per page"
          options={[5, 10, 20].map((size) => ({ value: size, label: String(size) }))}
        />
      </label>
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
        <div className="members-cards">{rows.map((member, index) => <article key={member.id} className={selected.includes(member.id) ? "is-selected" : ""}><input type="checkbox" checked={selected.includes(member.id)} onChange={() => toggleOne(member.id)} aria-label={`Select ${member.fullName}`} /><span className="members-avatar">{member.fullName.split(/\s+/).slice(0,2).map((part) => part[0]).join("")}</span><div><Link to={`/members/${member.id}`}><strong>{(page - 1) * limit + index + 1}. {member.fullName}</strong></Link><small>{member.controllerId} · Enrolled {formatEnrolled(member.createdAt)}</small><span>{member.district ? `${member.district.name}, ${member.district.region.name}` : "No district"}</span><span>{member.spouse?.fullName ? `Spouse: ${member.spouse.fullName}` : "Spouse not recorded"}</span></div><div className="members-status-cell" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}><Status value={member.status}/>{member.missingFromReport20At && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#7a5c00", background: "#fdf6e3", border: "1px solid #f0c96b", borderRadius: 6, padding: "1px 6px" }}>Missing R20</span>}</div></article>)}</div>
      </>}
    </section>

    {!loading && !error && total > 0 && <Pagination page={page} totalPages={totalPages} totalItems={total} itemLabel="members" onPageChange={(nextPage) => updateParams({ page: String(nextPage) })} />}
  </div>;
}
