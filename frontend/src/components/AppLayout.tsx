import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";

export default function AppLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-[var(--app-bg)]">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar onToggleSidebar={() => setIsSidebarOpen((v) => !v)} />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
