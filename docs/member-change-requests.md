# Member change requests

Members can inspect submitted values, staff notes and the next action under **Request Changes → My requests**. History has stage filters, numbering and ten requests per page. Notification links select the containing page and open and focus the request.

Only returned requests can be corrected. Corrections reuse the original request ID, type and beneficiary. The previous review note remains visible while the request awaits review; the correction audit records the previous and replacement proposal. Member records change only on approval.

`PATCH /api/member-portal/change-requests/:id/resubmit` accepts the existing creation payload plus `expectedUpdatedAt`, from the member history response. The server validates fields, member ownership, returned state, unchanged type/target, beneficiary ownership, pending duplicates and the stored version. A conflict retains the member's typed corrections so they can inspect the problem before refreshing.

Individual staff review accepts `expectedUpdatedAt`; bulk review accepts a `versions` map keyed by request ID. Both reserve the pending version inside the same transaction as the decision and member update, preventing competing reviewers from applying the same request twice. Existing role and geographic scope checks remain in place. Returns and rejections require a reason.

New submissions and corrections notify scoped staff in-app. Review decisions notify the member in-app, with a link to the request. Review notifications explicitly disable SMS, and use a timestamp per decision so another correction/review cycle can notify again. Notification failures are logged without failing an already committed request or decision.

Refresh failures retain loaded request history. Failed corrections retain typed values. Approved, rejected and cancelled requests remain read-only.

No additional database migration is required for this feature. Deploy the backend before the frontend, so history responses include `updatedAt` and the correction endpoint is available. The separate claim-drafts feature still requires its own additive migration.

Validation: backend and frontend test suites, lint, typechecks and builds; `frontend/scripts/change-requests-check.mjs` checks the member/staff cycle on mobile and desktop at normal and 200% zoom. Browser API requests are mocked; it sends no real notifications or claims.
