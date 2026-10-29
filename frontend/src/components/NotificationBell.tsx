import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Link } from "react-router-dom";
import { claimNotificationLink } from "@/lib/notificationLinks";

type Notification = {
  id: number;
  type: string;
  title: string;
  message: string;
  actionUrl?: string | null;
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
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      const count = api
        .get("/notifications/unread-count", { signal: controller.signal })
        .then((res) => {
          if (!controller.signal.aborted) setUnreadCount(res.data.data.count);
        })
        .catch(() => undefined);
      if (open) {
        setLoading(true);
        try {
          const res = await api.get("/notifications", {
            params: { limit: 10 },
            signal: controller.signal,
          });
          if (!controller.signal.aborted) {
            setItems(res.data.data);
            setError("");
          }
        } catch {
          if (!controller.signal.aborted)
            setError("Could not refresh notifications. Previous results may be outdated.");
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      }
      await count;
      running = false;
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 30_000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [open, revision]);

  const handleToggle = () => setOpen((value) => !value);
  const markRead = async (id?: number) => {
    setSaving(true);
    try {
      await api.patch(id ? `/notifications/${id}/read` : "/notifications/read-all");
      setItems((previous) =>
        previous.map((item) =>
          !id || item.id === id
            ? { ...item, readAt: item.readAt ?? new Date().toISOString() }
            : item,
        ),
      );
      setRevision((value) => value + 1);
    } catch {
      setError("Could not mark notifications as read. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          event.currentTarget.querySelector("button")?.focus();
        }
      }}
    >
      <button
        type="button"
        onClick={handleToggle}
        className="relative z-60 flex h-9 w-9 items-center justify-center rounded-lg border border-border-default bg-white transition-colors hover:border-text-strong"
        aria-label="Notifications"
        aria-expanded={open}
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
          <div className="fixed left-4 right-4 top-16 z-60 overflow-hidden rounded-xl border border-border-default bg-white shadow-popover sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-80">
            <div className="flex items-center justify-between border-b border-border-default px-3.5 py-2.5">
              <span className="text-sm font-bold text-text-strong">Notifications</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void markRead()}
                  className="text-xs font-semibold text-action-primary hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {error && (
                <p role="alert" className="px-3.5 py-3 text-xs text-danger">
                  {error}
                </p>
              )}
              {loading && items.length === 0 ? (
                <div className="px-3.5 py-6 text-center text-xs text-text-muted">Loading…</div>
              ) : items.length === 0 && !error ? (
                <div className="px-3.5 py-6 text-center text-xs text-text-muted">
                  No notifications yet.
                </div>
              ) : (
                items.map((item) => (
                  <div key={item.id}>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        if (!item.readAt) void markRead(item.id);
                      }}
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
                    {claimNotificationLink(item.actionUrl, "staff") && (
                      <Link
                        to={claimNotificationLink(item.actionUrl, "staff")!}
                        onClick={() => {
                          if (!item.readAt) void markRead(item.id);
                          setOpen(false);
                        }}
                        className="block px-3.5 pb-2.5 text-xs font-bold text-action-primary hover:underline"
                      >
                        View claim
                      </Link>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
