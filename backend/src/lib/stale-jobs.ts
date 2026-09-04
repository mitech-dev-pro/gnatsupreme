// A worker that's genuinely still working updates an ImportJob's row periodically (see
// reconcileReport20's batched loop, stageMemberImport, and the member-import commit loop), so
// `updatedAt` keeps moving. If a PENDING/PROCESSING job hasn't been touched in this long, its
// worker process died without ever reporting back (e.g. killed by a deploy/restart mid-run, an
// OOM kill, or — in local dev — the job was enqueued while nothing was consuming the queue) —
// otherwise a stuck job could never be retried, since nothing else ever flips it out of
// PENDING/PROCESSING. Shared by both the Report 20 and member-bulk import routers so the
// threshold and the "is this stale" check can't drift between them.
export const STUCK_JOB_THRESHOLD_MS = 15 * 60 * 1_000;

export function isStaleImportJob(job: { status: string; updatedAt: Date }) {
  return (
    (job.status === "PENDING" || job.status === "PROCESSING") &&
    Date.now() - job.updatedAt.getTime() > STUCK_JOB_THRESHOLD_MS
  );
}
