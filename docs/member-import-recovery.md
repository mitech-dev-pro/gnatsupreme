# Member import review and recovery

Bulk Import validates a file before enrollment. "Ready for enrollment" means ready rows are waiting for explicit staff confirmation; it does not mean the members are enrolled. Enrollment creates active members and never updates an existing member. Invalid, duplicate, existing and out-of-scope rows are skipped.

Import history uses server pagination (10 per page), sequential numbering, status filtering and manual refresh. Details retain row outcome filters and pagination, expose source values for review, and keep loaded data on refresh failures. In-progress details refresh without overlapping requests; obsolete responses are ignored after a filter or import changes.

`GET /api/imports/members/:id/recovery-file` streams an XLSX workbook containing only skipped rows and their original source values, spreadsheet row number, issues and next step. Ready and enrolled rows are excluded. Existing members are included for reference with an explicit instruction to use their profile for changes. String cells preserve leading zeros and do not execute formulas. Corrected rows must pass validation and duplicate checks again. Resolved staff type and region are preserved in the workbook.

Uploading identical content retains the existing import and source file. Authorized staff receive a link to the saved import; other uploaders cannot discover its identifiers or storage path. National administrators keep their existing cross-uploader access. Failed queue submissions retain the saved upload and expose a recovery link.

Failed and stalled jobs can be retried. Validation resumes only if no staged rows exist; otherwise enrollment resumes READY rows. Competing starts use an atomic status/version check. Each attempt has a started-at token, and obsolete attempts cannot publish final status or progress. Each enrollment transaction reserves the READY row before creating a member. Enrolled rows cannot be relabelled by a competing runner. Final counters are recomputed from row outcomes, keeping the original file total and previously enrolled count.

Failed rows that need data changes should be corrected in the workbook and uploaded as a new file. Retry does not blindly re-enroll failed or previously enrolled rows. Import history is retained throughout recovery.

Member queue writes have a deadline so an unavailable queue cannot leave the upload request waiting indefinitely. Delayed messages from failed or superseded attempts are ignored. Queue connections are created on demand. Report 20 reconciliation and its payment/matching rules are unchanged.

No additional database migration is required. Deploy the backend and worker before the frontend. The separate claim-drafts migration remains required for that earlier feature.

Verification includes backend tests with temporary synthetic CSV files and workbook round-tripping, frontend tests, and `frontend/scripts/import-recovery-check.mjs` with mocked uploads and enrollment. No real member records are imported during these checks.
