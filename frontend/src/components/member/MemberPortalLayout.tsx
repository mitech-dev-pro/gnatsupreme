import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useMemberAuth } from "@/lib/MemberAuthContext";
import { useOrganizationSettings } from "@/lib/OrganizationSettingsContext";

type NavItem = { label: string; to: string; icon: ReactNode; end?: boolean };

const icon = (path: ReactNode) => <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-[18px] shrink-0">{path}</svg>;
const NAV_ITEMS: NavItem[] = [
  { label: "Overview", to: "/member", end: true, icon: icon(<><path d="M4 11.5 12 5l8 6.5V20H4Z"/><path d="M9 20v-5h6v5"/></>) },
  { label: "My profile", to: "/member/profile", icon: icon(<><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3.1-7 7-7s7 3 7 7"/></>) },
  { label: "Covered lives", to: "/member/household", icon: icon(<><circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.5M16 14c2.8 0 5 2.2 5 5"/></>) },
  { label: "Coverage", to: "/member/coverage", icon: icon(<><path d="M12 3 5 6v5c0 4.7 2.8 8.2 7 10 4.2-1.8 7-5.3 7-10V6Z"/><path d="m9 12 2 2 4-4"/></>) },
  { label: "Requests", to: "/member/requests", icon: icon(<><path d="M7 3h10v4H7zM5 5H4v16h16V5h-1"/><path d="M8 12h8M8 16h5"/></>) },
  { label: "Claims", to: "/member/claims", icon: icon(<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/></>) },
  { label: "Notifications", to: "/member/notifications", icon: icon(<><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8M10 21h4"/></>) },
  { label: "Help", to: "/member/help", icon: icon(<><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 1 1 3.5 2.1c-.8.4-1.2.9-1.2 1.9M12 17h.01"/></>) },
];

const PAGE_TITLES: Record<string, string> = {
  "/member": "Overview", "/member/profile": "My profile", "/member/household": "Covered lives",
  "/member/coverage": "Coverage", "/member/requests": "My requests", "/member/claims": "Claims",
  "/member/notifications": "Notifications", "/member/help": "Help and support",
};

export default function MemberPortalLayout() {
  const { settings } = useOrganizationSettings();
  const { member, logout } = useMemberAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    api.get("/member-portal/notifications").then((response) => setUnreadCount(response.data.unreadCount ?? 0)).catch(() => undefined);
  }, [location.pathname]);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMoreOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [moreOpen]);

  const signOut = async () => { await logout(); navigate("/login", { replace: true }); };
  const title = PAGE_TITLES[location.pathname] ?? "Member portal";
  const desktopLink = ({ isActive }: { isActive: boolean }) => `flex min-h-10 items-center gap-3 rounded-[9px] px-3 py-2 text-[12.5px] font-semibold no-underline transition ${isActive ? "bg-white/12 text-white" : "text-white/68 hover:bg-white/7 hover:text-white"}`;

  return (
    <div className="flex h-dvh overflow-hidden bg-(--app-bg)">
      <aside className="hidden w-60 shrink-0 flex-col text-white lg:flex" style={{ backgroundColor: settings.primaryColor }}>
        <div className="flex min-h-18 items-center gap-3 border-b border-white/10 px-5">
          <span className="grid size-10 place-items-center rounded-[9px] bg-white text-[12px] font-extrabold" style={{ color: settings.primaryColor }}>{settings.sidebarMark}</span>
          <span className="min-w-0"><strong className="block truncate text-[13.5px]">{settings.portalName}</strong><small className="text-[10.5px] text-white/58">Member portal</small></span>
        </div>
        <div className="border-b border-white/10 px-5 py-4"><p className="truncate text-[12.5px] font-semibold">{member?.fullName}</p><p className="mt-0.5 truncate text-[10.5px] text-white/58">{settings.memberIdLabel} {member?.controllerId}</p></div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label="Member portal">
          {NAV_ITEMS.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={desktopLink}>{item.icon}<span>{item.label}</span>{item.label === "Notifications" && unreadCount > 0 && <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[9px] font-bold" style={{ color: settings.primaryColor }}>{unreadCount}</span>}</NavLink>)}
        </nav>
        <button type="button" onClick={() => void signOut()} className="m-3 min-h-10 rounded-[9px] border border-white/14 px-3 text-left text-[12px] font-semibold text-white/72 hover:bg-white/7 hover:text-white">Sign out</button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 shrink-0 items-center justify-between border-b border-(--border-default) bg-(--surface-raised) px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-[8px] text-[11px] font-extrabold text-white lg:hidden" style={{ backgroundColor: settings.primaryColor }}>{settings.sidebarMark}</span><div className="min-w-0"><h1 className="truncate text-[17px] font-extrabold text-(--text-strong)">{title}</h1><p className="hidden truncate text-[11px] text-(--text-muted) sm:block">Welcome back, {member?.fullName?.split(/\s+/)[0]}</p></div></div>
          <div className="flex items-center gap-2">
            <NavLink to="/member/notifications" aria-label={`${unreadCount} unread notifications`} className="relative grid size-10 place-items-center rounded-[9px] border border-(--border-default) text-(--text-muted) no-underline hover:bg-(--surface-subtle)">{NAV_ITEMS[6].icon}{unreadCount > 0 && <span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-(--danger) px-1 text-center text-[8px] font-bold leading-4 text-white">{Math.min(unreadCount, 99)}</span>}</NavLink>
            <button type="button" onClick={() => setMoreOpen(true)} className="grid size-10 place-items-center rounded-[9px] border border-(--border-default) text-(--text-strong) lg:hidden" aria-label="Open member menu">{icon(<path d="M5 7h14M5 12h14M5 17h14"/>)}</button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-5 sm:px-6 lg:pb-8 lg:pt-6"><div className="mx-auto w-full max-w-7xl"><Outlet /></div></main>

        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-(--border-default) bg-(--surface-raised) px-2 pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5 lg:hidden" aria-label="Primary member navigation">
          {NAV_ITEMS.slice(0, 1).concat(NAV_ITEMS.slice(3, 5)).map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[8px] text-[10px] font-semibold no-underline ${isActive ? "text-(--action-primary)" : "text-(--text-muted)"}`}>{item.icon}<span>{item.label === "Overview" ? "Home" : item.label}</span></NavLink>)}
          <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)} className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[8px] text-[10px] font-semibold text-(--text-muted)">{icon(<><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>)}<span>More</span></button>
        </nav>
      </div>

      {moreOpen && <><button type="button" aria-label="Close member menu" onClick={() => setMoreOpen(false)} className="fixed inset-0 z-50 bg-[rgba(23,27,38,0.45)] lg:hidden"/><aside aria-label="More member navigation" className="fixed inset-x-0 bottom-0 z-60 max-h-[82dvh] overflow-y-auto rounded-t-[16px] bg-(--surface-raised) px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_35px_rgba(23,27,38,0.18)] lg:hidden"><div className="mx-auto mb-4 h-1 w-10 rounded-full bg-(--border-strong)"/><div className="mb-3 px-2"><strong className="block text-[14px] text-(--text-strong)">{member?.fullName}</strong><span className="text-[11px] text-(--text-muted)">{settings.memberIdLabel} {member?.controllerId}</span></div><nav className="grid grid-cols-2 gap-2">{NAV_ITEMS.slice(1).map((item) => <NavLink key={item.to} to={item.to} className="flex min-h-12 items-center gap-3 rounded-[9px] border border-(--border-default) px-3 text-[12px] font-semibold text-(--text-strong) no-underline">{item.icon}{item.label}</NavLink>)}</nav><button type="button" onClick={() => void signOut()} className="mt-3 min-h-11 w-full rounded-[9px] border border-(--danger-border) text-[12px] font-bold text-(--danger)">Sign out</button></aside></>}
    </div>
  );
}
