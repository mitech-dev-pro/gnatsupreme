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
    setItems((prev) =>
      prev.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
    );
    setUnreadCount(0);
  };

  const markRead = async (id: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item,
      ),
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
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border-default bg-white transition-colors hover:border-text-strong"
        aria-label="Notifications"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-4.25 w-4.25 text-text-strong"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-59" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+8px)] z-60 w-80 overflow-hidden rounded-xl border border-border-default bg-white shadow-popover">
            <div className="flex items-center justify-between border-b border-border-default px-3.5 py-2.5">
              <span className="text-sm font-bold text-text-strong">Notifications</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-xs font-semibold text-action-primary hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="px-3.5 py-6 text-center text-xs text-text-muted">Loading…</div>
              ) : items.length === 0 ? (
                <div className="px-3.5 py-6 text-center text-xs text-text-muted">
                  No notifications yet.
                </div>
              ) : (
                items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => !item.readAt && markRead(item.id)}
                    className={`block w-full border-b border-border-default px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-surface-hover ${
                      item.readAt ? "" : "bg-[#f3fbf8]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-ink">{item.title}</span>
                      {!item.readAt && (
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-action-primary" />
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-text-muted">{item.message}</div>
                    <div className="mt-1 text-xs text-nav-muted">{timeAgo(item.createdAt)}</div>
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
