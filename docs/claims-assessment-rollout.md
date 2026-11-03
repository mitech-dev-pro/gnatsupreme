# Claims assessment updates

Deploy `20261029140000_save_claim_assessment` before the backend, then deploy the frontend. The migration adds a nullable JSONB column; existing claims need no backfill. Generate the Prisma client during the backend build. Do not run the new backend against the old schema.

The local staff and member detail endpoints now include `externalAssessment`. Staff lists remain lightweight. Successful external detail reads atomically save the six normalized assessment fields, `externalStatus`, and `lastSyncedAt`; their existing response gains `lastSyncedAt`. Failed reads leave the snapshot and successful-check timestamp untouched. Submitted claim data and estimates remain independent of the assessment.

An unconfirmed-delivery retry requires `{ "historyChecked": true }` on the existing staff send endpoint. The UI first requires a successful history lookup and explicit acknowledgment; the backend independently retrieves scoped history before taking the delivery lock. An unavailable history lookup blocks sending. Replaying an original submission cannot bypass this guard. Displayed claim numbers are not treated as external lookup IDs and no automatic reconciliation is attempted.

Run the backend claims tests with Redis disabled for the test process if no Redis instance is available. Run frontend tests, lint, typechecks and both builds. After building the frontend, `node scripts/claims-details-check.mjs` checks desktop/mobile details, refresh failure, guarded retry, the modal, member cards and 200% zoom using intercepted API traffic only. Screenshots are written to `frontend/test-results/claims/`.

After deployment, check an existing saved claim, a pending member claim and an accepted claim. Confirm assessment timestamps change only after a successful retrieval, and inspect retry audit records (`CLAIM_DELIVERY_RECORDED` or `CLAIM_RETRY_BLOCKED`) if staff encounter delivery issues. There is no background polling or webhook synchronization.
