import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";

type Notification = {
  id: number;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const loadedOnce = useRef(false);

  const loadUnreadCount = async () => {
    try {
      const res = await api.get("/notifications/unread-count");
      setUnreadCount(res.data.data.count);
    } catch {
      // silent — the badge just won't update this cycle
    }
  };

  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 30_000);
    return () => clearInterval(interval);
  }, []);

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await api.get("/notifications", { params: { limit: 10 } });
      setItems(res.data.data);
    } finally {
      setLoading(false);
      loadedOnce.current = true;
    }
  };

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loadedOnce.current) loadList();
  };

  const markAllRead = async () => {
    await api.patch("/notifications/read-all");
    setItems((prev) => prev.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    setUnreadCount(0);
  };

  const markRead = async (id: number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await api.patch(`/notifications/${id}/read`);
    } catch {
      // state already optimistically updated; a stale badge here is low-stakes
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-[9px] border border-[#e5e9f0] bg-white transition-colors hover:border-[#1e2761]"
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
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#c23b3b] px-1 text-[9px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-59" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+8px)] z-60 w-80 overflow-hidden rounded-[10px] border border-[#e5e9f0] bg-white shadow-[0_12px_30px_rgba(23,27,38,0.22)]">
            <div className="flex items-center justify-between border-b border-[#e5e9f0] px-3.5 py-2.5">
              <span className="text-[12.5px] font-bold text-[#1e2761]">Notifications</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-[11px] font-semibold text-[#1f9c7c] hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="px-3.5 py-6 text-center text-[12px] text-[#5b6472]">
                  Loading…
                </div>
              ) : items.length === 0 ? (
                <div className="px-3.5 py-6 text-center text-[12px] text-[#5b6472]">
                  No notifications yet.
                </div>
              ) : (
                items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => !item.readAt && markRead(item.id)}
                    className={`block w-full border-b border-[#e5e9f0] px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-[#fafbfd] ${
                      item.readAt ? "" : "bg-[#f3fbf8]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[12px] font-semibold text-[#171b26]">
                        {item.title}
                      </span>
                      {!item.readAt && (
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1f9c7c]" />
                      )}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-[#5b6472]">
                      {item.message}
                    </div>
                    <div className="mt-1 text-[10.5px] text-[#9aa2c4]">
                      {timeAgo(item.createdAt)}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
