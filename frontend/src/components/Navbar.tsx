import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { formatRole, initials } from "@/lib/roleLabel";
import NotificationBell from "@/components/NotificationBell";

type NavbarProps = {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
};

export default function Navbar({ isSidebarOpen, onToggleSidebar }: NavbarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const signOutButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    signOutButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        accountButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-5 border-b border-border-default bg-white px-7 py-3">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Open menu"
          aria-expanded={isSidebarOpen}
          aria-controls="app-sidebar"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-default bg-white md:hidden"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            className="h-4.5 w-4.5 text-text-strong"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        {/* <div className="hidden items-center gap-3 sm:flex">
          <div className="flex h-9 items-center rounded-lg border border-border-default bg-text-on-action px-2">
            <img
              src="/brand/gnat-logo.png?v=1"
              alt="GNAT"
              className="h-7 w-auto max-w-16 object-contain"
            />
          </div>
          <div className="h-6 w-px bg-border-default" />
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-semibold uppercase tracking-[0.08em] text-[#7a8190] lg:inline">
              Underwritten by
            </span>
            <div className="flex h-9 items-center rounded-lg border border-border-default bg-text-on-action px-2.5">
              <img
                src="/brand/milife-logo.png?v=1"
                alt="miLife Insurance"
                className="h-6 w-auto max-w-22 object-contain"
              />
            </div>
          </div>
        </div> */}
      </div>

      <div className="flex items-center gap-4.5">
        <NotificationBell />

        <div className="relative">
          <button
            ref={accountButtonRef}
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="account-menu"
            aria-haspopup="menu"
            aria-label={user ? `Account menu for ${user.fullName}` : "Account menu"}
            className="flex items-center gap-2.5"
          >
            <div className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full bg-action-primary text-sm font-bold text-white">
              {user ? initials(user.fullName) : ""}
            </div>
            <div className="hidden text-left leading-[1.2] sm:block">
              <div className="text-sm font-bold text-ink">{user?.fullName}</div>
              <div className="text-xs text-text-muted">{user ? formatRole(user.role) : ""}</div>
            </div>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-59" onClick={() => setMenuOpen(false)} />
              <div
                id="account-menu"
                role="menu"
                className="absolute right-0 top-[calc(100%+8px)] z-60 min-w-42.5 overflow-hidden rounded-xl border border-border-default bg-white shadow-popover"
              >
                <button
                  ref={signOutButtonRef}
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.25 px-3.5 py-2.5 text-left text-sm font-semibold text-danger transition-colors hover:bg-danger-soft"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    className="h-3.5 w-3.5 shrink-0"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <path d="M16 17l5-5-5-5M21 12H9" />
                  </svg>
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
