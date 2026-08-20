import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { formatRole, initials } from "@/lib/roleLabel";

type NavbarProps = {
  onToggleSidebar: () => void;
};

export default function Navbar({ onToggleSidebar }: NavbarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-5 border-b border-[#e5e9f0] bg-white px-7 py-3">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Open menu"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e5e9f0] bg-white md:hidden"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            className="h-4.5 w-4.5 text-[#1e2761]"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        <div className="hidden items-center gap-3 sm:flex">
          <div className="flex h-9 items-center rounded-[9px] border border-[#e5e9f0] bg-[#fbfcfe] px-2">
            <img
              src="/brand/gnat-logo.png?v=1"
              alt="GNAT"
              className="h-7 w-auto max-w-16 object-contain"
            />
          </div>
          <div className="h-6 w-px bg-[#e5e9f0]" />
          <div className="flex items-center gap-2">
            <span className="hidden text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7a8190] lg:inline">
              Underwritten by
            </span>
            <div className="flex h-9 items-center rounded-[9px] border border-[#e5e9f0] bg-[#fbfcfe] px-2.5">
              <img
                src="/brand/milife-logo.png?v=1"
                alt="miLife Insurance"
                className="h-6 w-auto max-w-22 object-contain"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4.5">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-[#e5e9f0] bg-white transition-colors hover:border-[#1e2761]"
          aria-label="Notifications"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-4.25 w-4.25 text-[#1e2761]"
          >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2.5"
          >
            <div className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full bg-[#1f9c7c] text-[13px] font-bold text-white">
              {user ? initials(user.fullName) : ""}
            </div>
            <div className="hidden text-left leading-[1.2] sm:block">
              <div className="text-[13px] font-bold text-[#171b26]">
                {user?.fullName}
              </div>
              <div className="text-[11px] text-[#5b6472]">
                {user ? formatRole(user.role) : ""}
              </div>
            </div>
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-59"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-[calc(100%+8px)] z-60 min-w-42.5 overflow-hidden rounded-[10px] border border-[#e5e9f0] bg-white shadow-[0_12px_30px_rgba(23,27,38,0.22)]">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.25 px-3.5 py-2.5 text-left text-[12.5px] font-semibold text-[#c23b3b] transition-colors hover:bg-[#fbe9e9]"
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
