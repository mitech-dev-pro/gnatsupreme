import { useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useOrganizationSettings } from "@/lib/OrganizationSettingsContext";

type NavSubItem = {
  label: string;
  target: string;
  to?: string;
};

const membersGroupIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <circle cx="17.5" cy="9" r="2.6" />
    <path d="M15.5 20a4 4 0 0 1 6.6-3" />
  </svg>
);

const importsGroupIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 15V4M7.5 9 12 4l4.5 5" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </svg>
);

const membersItems: NavSubItem[] = [
  { label: "All Members", target: "all", to: "/members" },
  { label: "Add Member", target: "add", to: "/members/new" },
  { label: "Pending Approvals", target: "pending", to: "/approvals" },
  { label: "Change Requests", target: "changes", to: "/change-requests" },
  {
    label: "Removed Members",
    target: "removed",
    to: "/members?status=REMOVED",
  },
];

const baseImportsItems: NavSubItem[] = [
  { label: "Bulk Import", target: "bulk", to: "/members/upload" },
];

const report20Item: NavSubItem = {
  label: "Report 20 Reconciliation",
  target: "report20",
  to: "/imports/report20",
};

const mainNavItems: { label: string; to: string; icon: ReactNode }[] = [
  // {
  //   label: "Transfers",
  //   to: "/transfers",
  //   icon: (
  //     <svg
  //       viewBox="0 0 24 24"
  //       fill="none"
  //       stroke="currentColor"
  //       strokeWidth="2"
  //     >
  //       <path d="M7 7h11l-3-3M17 17H6l3 3" />
  //     </svg>
  //   ),
  // },
  {
    label: "Claims",
    to: "/claims",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M9 12.5 11 14.5 15.5 9" />
        <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
      </svg>
    ),
  },
  {
    label: "Reports",
    to: "/reports",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M3 12h4l2.5 6 4-14L16 12h5" />
      </svg>
    ),
  },
];

const settingsIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.5 4 5.5 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.5-4-9s1.5-6.5 4-9Z" />
  </svg>
);

const ALL_STAFF_ROLES = [
  "SUPER_ADMIN",
  "NATIONAL_ADMIN",
  "REGIONAL_ADMIN",
  "DISTRICT_ADMIN",
];

const adminItems: {
  label: string;
  to: string;
  lock: string;
  roles: string[];
  icon: ReactNode;
}[] = [
  {
    label: "Global Settings",
    to: "/settings",
    lock: "",
    roles: ALL_STAFF_ROLES,
    icon: settingsIcon,
  },
  {
    label: "Scheme Configuration",
    to: "/setup",
    lock: "Regional+",
    roles: ["SUPER_ADMIN", "NATIONAL_ADMIN", "REGIONAL_ADMIN"],
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M10.6 3.5h2.8l.5 2.4a7 7 0 0 1 1.8 1l2.3-.9 1.4 2.4-1.8 1.6a7 7 0 0 1 0 2.1l1.8 1.6-1.4 2.4-2.3-.9a7 7 0 0 1-1.8 1l-.5 2.4h-2.8l-.5-2.4a7 7 0 0 1-1.8-1l-2.3.9-1.4-2.4 1.8-1.6a7 7 0 0 1 0-2.1L4.6 8.4 6 6l2.3.9a7 7 0 0 1 1.8-1z" />
        <circle cx="12" cy="12" r="2.6" />
      </svg>
    ),
  },
  {
    label: "Staff & Audit",
    to: "/system",
    lock: "National",
    roles: ["SUPER_ADMIN", "NATIONAL_ADMIN"],
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="3" y="4.5" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16.5V20" />
      </svg>
    ),
  },
];

const navItemBase =
  "flex items-center gap-2.75 rounded-[9px] px-3 py-2.5 text-[13.5px] font-medium text-[#b7bedd] no-underline transition-colors hover:bg-white/6 hover:text-white";
const navItemActive =
  "bg-(--brand-accent) text-white hover:bg-(--brand-accent)";
const navSoonBadge =
  "ml-auto rounded-md bg-white/8 px-1.5 py-0.5 text-[9.5px] text-[#9aa2c4]";

function NavGroup({
  id,
  label,
  icon,
  items,
  expanded,
  onToggle,
  location,
  onNavigate,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  items: NavSubItem[];
  expanded: boolean;
  onToggle: () => void;
  location: ReturnType<typeof useLocation>;
  onNavigate: () => void;
}) {
  return (
    <div className="mb-0.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={id}
        className={`w-full ${navItemBase}`}
      >
        <span className="h-4.5 w-4.5 shrink-0 [&>svg]:h-full [&>svg]:w-full">
          {icon}
        </span>
        {label}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          className={`ml-auto h-3.25 w-3.25 shrink-0 opacity-70 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div
        id={id}
        className={`overflow-hidden transition-[max-height] duration-200 ${
          expanded ? "max-h-70" : "max-h-0"
        }`}
      >
        {items.map((item) =>
          item.to ? (
            <NavLink
              key={item.target}
              to={item.to}
              onClick={onNavigate}
              className={() => {
                const isActive =
                  location.pathname + location.search === item.to;
                return `relative my-px flex items-center gap-2.25 rounded-lg py-2 pl-8.25 pr-3 text-[12.5px] font-medium no-underline transition-colors ${
                  isActive
                    ? "bg-white/8 font-semibold text-white"
                    : "text-[#9aa2c4] hover:bg-white/6 hover:text-white"
                }`;
              }}
            >
              <span className="absolute left-4.75 h-1 w-1 rounded-full bg-current opacity-80" />
              {item.label}
            </NavLink>
          ) : (
            <span
              key={item.target}
              className="relative my-px flex cursor-not-allowed items-center gap-2.25 rounded-lg py-2 pl-8.25 pr-3 text-[12.5px] font-medium text-[#9aa2c4] opacity-60"
            >
              <span className="absolute left-4.75 h-1 w-1 rounded-full bg-current opacity-80" />
              {item.label}
              <span className={navSoonBadge}>Soon</span>
            </span>
          ),
        )}
      </div>
    </div>
  );
}

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const { settings } = useOrganizationSettings();
  const canImportReport20 = user
    ? ["SUPER_ADMIN", "NATIONAL_ADMIN"].includes(user.role)
    : false;
  const importsItems = canImportReport20
    ? [...baseImportsItems, report20Item]
    : baseImportsItems;
  const [membersExpanded, setMembersExpanded] = useState(
    () =>
      (location.pathname.startsWith("/members") &&
        !location.pathname.startsWith("/members/upload")) ||
      location.pathname.startsWith("/change-requests") ||
      location.pathname.startsWith("/approvals"),
  );
  const [importsExpanded, setImportsExpanded] = useState(
    () =>
      location.pathname.startsWith("/members/upload") ||
      location.pathname.startsWith("/imports/report20"),
  );

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation menu"
        tabIndex={isOpen ? 0 : -1}
        onClick={onClose}
        className={`fixed inset-0 z-75 border-0 bg-[rgba(23,27,38,0.45)] p-0 transition-opacity md:hidden ${
          isOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        id="app-sidebar"
        style={{ backgroundColor: settings.primaryColor }}
        className={`fixed inset-y-0 left-0 z-80 flex w-59 shrink-0 flex-col bg-[#1e2761] pt-5 text-[#c9cee6] transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-4 flex items-center gap-2.5 border-b border-white/8 px-5 pb-5.5">
          {/* <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-white p-1 text-[13px] font-extrabold text-[#1e2761] shadow-[0_1px_3px_rgba(8,13,42,0.22)]">
            {settings.sidebarMark}
          </div> */}
          <div className="leading-[1.15]">
            {/* <div className="text-[14.5px] font-bold text-white">
              {settings.portalName}
            </div> */}
            <div className="text-[14.5px] font-bold text-white">
              GNAT Supreme Care
            </div>
            <div className="text-[12.5px] font-medium text-white mb-1">
              Group Insurance Scheme
            </div>
            <div className="text-[10.5px] tracking-[0.3px] text-[#9aa2c4]">
              Member Portal · v1.0
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2.5">
          <div className="px-3 pb-1.5 pt-2.5 text-[10px] font-semibold tracking-[1.2px] text-[#7a81a8]">
            MAIN
          </div>

          <NavLink
            to="/"
            end
            onClick={onClose}
            className={({ isActive }) =>
              `mb-0.5 ${navItemBase} ${isActive ? navItemActive : ""}`
            }
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4.5 w-4.5 shrink-0"
            >
              <path d="M3 11.5 12 4l9 7.5" />
              <path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
            </svg>
            Dashboard
          </NavLink>

          <NavGroup
            id="members-navigation"
            label="Members"
            icon={membersGroupIcon}
            items={membersItems}
            expanded={membersExpanded}
            onToggle={() => setMembersExpanded((v) => !v)}
            location={location}
            onNavigate={onClose}
          />

          <NavGroup
            id="imports-navigation"
            label="Imports"
            icon={importsGroupIcon}
            items={importsItems}
            expanded={importsExpanded}
            onToggle={() => setImportsExpanded((v) => !v)}
            location={location}
            onNavigate={onClose}
          />

          {mainNavItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `mb-0.5 ${navItemBase} ${isActive ? navItemActive : ""}`
              }
            >
              <span className="h-4.5 w-4.5 shrink-0 [&>svg]:h-full [&>svg]:w-full">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}

          <div className="px-3 pb-1.5 pt-2.5 text-[10px] font-semibold tracking-[1.2px] text-[#7a81a8]">
            ADMINISTRATION
          </div>

          {adminItems.map((item) =>
            user && item.roles.includes(user.role) ? (
              <NavLink
                key={item.label}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `mb-0.5 ${navItemBase} ${isActive ? navItemActive : ""}`
                }
              >
                <span className="h-4.5 w-4.5 shrink-0 [&>svg]:h-full [&>svg]:w-full">
                  {item.icon}
                </span>
                {item.label}
              </NavLink>
            ) : (
              <span
                key={item.label}
                className={`mb-0.5 cursor-not-allowed opacity-40 ${navItemBase}`}
              >
                <span className="h-4.5 w-4.5 shrink-0 [&>svg]:h-full [&>svg]:w-full">
                  {item.icon}
                </span>
                {item.label}
                <span className={navSoonBadge}>{item.lock}</span>
              </span>
            ),
          )}
        </nav>

        <div className="border-t border-white/8 px-5 pb-1 pt-3.5 text-[10.5px] text-[#7a81a8]">
          {settings.schemeSponsor} &copy; {new Date().getFullYear()}
          {/* <br />
          Underwritten by {settings.underwriter} */}
        </div>
      </aside>
    </>
  );
}
