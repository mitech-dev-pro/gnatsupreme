# Claim review notifications

Deploy migration `20261029160000_notification_action_links` before the updated backend. It adds a nullable `action_url` to notifications; existing rows remain valid and need no backfill. Then deploy the frontend.

Member-filed claims create in-app notifications when GNAT returns, rejects or approves forwarding. Review notes are included. Confirmed delivery says Mankrado received the claim; unconfirmed or failed delivery says GNAT approved forwarding and staff must follow up. A later successful staff retry creates the confirmed-forwarding notification once. These notifications explicitly disable SMS, and no email is sent.

Returned claims link to the existing correction form. Other decisions link to the owned member claim card, which receives keyboard focus after loading. If a return notification is opened after the claim no longer permits correction, the correction route redirects to that card. Staff submission/resubmission notifications link to the staff claim details page. Existing notifications without links keep their existing behavior.

Review updates retain the existing concurrency guard. Notification upsert keys identify review cycles, while confirmed forwarding has one key per claim. A notification persistence failure is logged after the review succeeds; it does not roll back the decision or trigger another delivery. This is best-effort in-app delivery, not a durable outbox: missed notifications require operational follow-up from the error log.

Staff notification lists refresh each time the bell opens and every 30 seconds while open; unread counts refresh every 30 seconds. Members' notifications and bell counts refresh every 30 seconds, and read actions update the bell. List refresh failures retain previously loaded messages. Member unread counts cover all unread rows, including those outside the most recent 100 returned by the list endpoint.

Backend tests cover decision wording, recipient ownership, idempotency, no SMS contact lookup and storage failures. Frontend tests cover safe links, polling, reopen/refresh behavior and notification actions. `frontend/scripts/claims-details-check.mjs` uses intercepted API responses to verify notifications and claim links on desktop/mobile, alongside the existing claims checks. No live claim submission or notification sending is required for verification.
