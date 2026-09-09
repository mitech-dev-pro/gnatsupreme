import PageHeader from "@/components/ui/PageHeader";
import { Link, useLocation } from "react-router-dom";

export default function Unauthorized() {
  const location = useLocation();
  const attemptedPath = (location.state as { from?: string } | null)?.from;
  return (
    <div className="max-w-2xl">
      <PageHeader
        eyebrow="Access restricted"
        title="You do not have access to this area"
        description="Your account is active, but its assigned role does not include this administrative function."
      />
      <div className="rounded-xl border border-warning-border bg-warning-soft p-5">
        {attemptedPath && (
          <p className="text-xs text-text-muted">
            Requested location:{" "}
            <code className="font-semibold text-text-strong">{attemptedPath}</code>
          </p>
        )}
        <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-text-muted">
          If this is part of your work, ask a National Administrator to review your role and
          administrative scope.
        </p>
        <Link
          to="/"
          className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-action-primary px-4 py-2 text-sm font-bold text-text-on-action hover:bg-(--action-primary-hover) focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          Return to dashboard
        </Link>
      </div>
    </div>
  );
}
