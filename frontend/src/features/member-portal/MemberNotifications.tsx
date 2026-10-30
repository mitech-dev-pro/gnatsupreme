import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Alert } from "@/components/ui/Feedback";
import { claimNotificationLink } from "@/lib/notificationLinks";
import { timeAgo, type MemberNotification } from "./MemberHome.shared";

export default function MemberNotifications() {
  const [items, setItems] = useState<MemberNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const result = await api.get("/member-portal/notifications", { signal: controller.signal });
        if (!controller.signal.aborted) {
          setItems(result.data.data);
          setUnreadCount(result.data.unreadCount);
          setError("");
        }
      } catch {
        if (!controller.signal.aborted)
          setError(
            "Could not refresh notifications. Any saved notifications below may be outdated.",
          );
      } finally {
        running = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [revision]);
  const markRead = async (id?: number) => {
    setSaving(true);
    try {
      await api.patch(
        id ? `/member-portal/notifications/${id}/read` : "/member-portal/notifications/read-all",
      );
      setItems((previous) =>
        previous.map((item) =>
          !id || item.id === id
            ? { ...item, readAt: item.readAt ?? new Date().toISOString() }
            : item,
        ),
      );
      window.dispatchEvent(new Event("member-notifications-changed"));
      setRevision((value) => value + 1);
    } catch {
      setError("Could not mark notifications as read. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section
      className="rounded-2xl border border-border-default bg-white p-5 md:col-span-2"
      aria-label="Member notifications"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-text-strong">Notifications</h2>
        <div className="flex gap-3">
          <button
            type="button"
            className="text-xs font-semibold text-action-primary hover:underline"
            onClick={() => setRevision((value) => value + 1)}
          >
            Refresh notifications
          </button>
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
      </div>
      {error && <Alert tone="warning">{error}</Alert>}
      {loading ? (
        <p role="status" className="text-sm text-text-muted">
          Loading notifications…
        </p>
      ) : items.length === 0 && !error ? (
        <p className="text-sm text-text-muted">No notifications yet.</p>
      ) : null}
      <ul className="divide-y divide-border-default">
        {items.map((item) => {
          const action = claimNotificationLink(item.actionUrl, "member");
          return (
            <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  {!item.readAt && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-action-primary"
                      aria-label="Unread"
                    />
                  )}
                  {item.title}
                </div>
                <p className="mt-0.5 text-xs text-text-muted">{item.message}</p>
                {action && (
                  <Link
                    to={action}
                    onClick={() => {
                      if (!item.readAt) void markRead(item.id);
                    }}
                    className="mt-1.5 inline-block text-xs font-bold text-action-primary no-underline hover:underline"
                  >
                    {action.includes("/requests#")
                      ? "View request"
                      : action.endsWith("/resubmit")
                        ? "Correct and resubmit"
                        : "View claim"}
                  </Link>
                )}
                {item.type === "PROFILE_COMPLETION_REQUIRED" && (
                  <Link
                    to="/member"
                    className="mt-1.5 inline-block text-xs font-bold text-action-primary no-underline hover:underline"
                  >
                    Review missing details
                  </Link>
                )}
              </div>
              <div className="whitespace-nowrap text-xs text-nav-muted">
                {timeAgo(item.createdAt)}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
