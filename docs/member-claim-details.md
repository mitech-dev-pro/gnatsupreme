# Member claim details

Every locally saved claim in My Claims now has a View details action. It opens a read-only variant of the existing claim-details modal, covering both member-filed claims and claims filed on their behalf. The modal shows the saved particulars, claimant identity/contact, estimated benefit, cheque instructions, notes, review and attachments immediately. Returned claims link to the existing correction form. Staff delivery/review controls and staff history endpoints are not used in the member variant.

The existing `GET /member-portal/claims/:id` response gains minimal filing/member/reviewer information for display. Access remains constrained to the authenticated member's ID, and document metadata is filtered to that member's attached claim documents.

`GET /member-portal/claims/:id/assessment` refreshes an owned claim's Mankrado assessment when an external reference exists. Both staff and member routes share identity validation and the atomic assessment snapshot update. Failures preserve the last saved snapshot and all submitted data.

`GET /member-portal/claims/:id/documents/:documentId` downloads an attachment only if the member owns the claim, the document is attached to it, the stored file belongs to that member and the file is a claim document. Resolved paths must remain under the configured upload directory. Downloads use the member bearer token and private/no-store caching. No database migration is needed for this change.

Tests cover owned versus foreign claims, unattached documents, storage traversal, insurer outages, stale responses and the read-only member UI. The mocked claims browser check covers pending details while history is unavailable, saved assessments during outages, attachment download and desktop/mobile layout.
