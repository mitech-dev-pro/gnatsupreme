# Mankrado claims integration

The backend sends multipart data to `https://mankradotest.milifeghana.com:8443/gnatsupreme/claim/submit` with an `x-api-key` header. The frontend continues to send JSON to this application's API and uploads files separately. Never put the provider key in frontend configuration.

## Configuration and deployment

Set backend `MANKRADO_BASE_URL` to the URL above, `MANKRADO_MODE=API`, `MANKRADO_API_KEY` to the issued secret, and `MANKRADO_ENABLED=true` when ready. Preserve the trailing path `/gnatsupreme/`. Keep secrets in the runtime environment, not example files or source control.

Run `npm run migrate:deploy` and `npm run build` in `backend`, then restart the backend. Build the frontend with `npm run build`. `GET /api/claims/provider` reports whether submissions are configured; it does not verify remote credentials.

## Provisional provider contract

All provider mapping and response parsing lives in `src/modules/claims/mankrado.contract.ts`. Document meanings still require further Mankrado confirmation for claim types other than hospitalization; the submission endpoint, field names below, `claim_type` values, and the response envelope are confirmed against a live sandbox test (2026-09-08, `POST /gnatsupreme/claim/submit`, HTTP 200 with a `claimId` returned).

Submission fields are **camelCase**, not snake_case. Confirmed fields: `claimType`, `claimantIdType`, `ghanaCardNumber` (claimant's Ghana Card ID), `claimant` (claimant's name), `mobileNumber` (claimant's primary phone), `paymentMethod`, and per-claim-type detail keys sent as-is (e.g. `hospitalName`, `dischargeDate`, `reason`), with one override: hospitalization's `admissionDate` is sent as `adminDate`. No staff/member ID field is sent — Mankrado matches the member by `ghanaCardNumber` alone. Dates use YYYY-MM-DD. Empty optional fields are omitted. CHEQUE is the only supported payment method; the app enforces this at the schema level.

Additional fields are kept alongside the confirmed set even though the live test didn't require them (harmless if ignored, may matter for reconciliation on Mankrado's side): `submissionReference` (our idempotency key), `memberName`, `claimantType`, `notes`, plus the remaining `claimantContact` fields (`contactName`, `additionalPhone`, `email`, `gpsAddress`, `residentialAddress`, `nationality`) and `payeeName` from `paymentDetails`.

| Claim type | `claimType` value | File fields |
| --- | --- | --- |
| DEATH | death | death_med, death_cert, death_police |
| TOTAL_PERMANENT_DISABILITY | tpd | tpd_doc, tpd_police |
| CRITICAL_ILLNESS | ci | ci_med, ci_lab |
| HOSPITALIZATION | hospital | hospital_med |

`death_doc` is reserved until its meaning is confirmed. Unmapped attached documents block submission. Each mapped field accepts one file: PDF, DOC, DOCX, JPEG/JPG, up to 1,000,000 bytes. DOC/DOCX support and decimal MB interpretation are provisional. Signature checks detect obvious MIME mismatches; they are not malware scanning or document-content verification.

Confirmed submission response:

```json
{"status":"200","claimId":"316192"}
```

`claimId` (a nonempty string or positive integer) becomes the local `externalClaimId`; no separate status text or submission timestamp is returned. Confirmed history response: `{"status":"200","history":[{"claimNumber":1788876358,"name":"Test Member","claimDate":"2026-09-08","amountPayable":"20,000.0","claimStatus":"Awaiting Approval"}]}`. Numeric claim numbers are normalized to strings, correctly grouped amounts to ungrouped decimal strings, and duplicate rows are preserved. History loads automatically alongside local claim information; it does not overwrite local review or delivery status. Confirmed details response: `{"status":"200","details":{"claimNumber":"MC-0617-254542","name":"Test Member","claimDate":"2025-06-17 14:50:16.360","amountPayable":"8095.64","claimStatus":"Completed","rejectReason":null}}`. The endpoint lookup ID is retained separately from `claimNumber`. Amounts remain decimal strings; dates without timezone information are displayed as supplied. The details page automatically fetches this assessment alongside the saved form fields. Only normalized fields are exposed to the UI. A response with a mismatching member identifier is rejected.

## Local interfaces and recovery

- `POST /api/claims/submissions`: existing JSON claim payload; requires a UUID `Idempotency-Key` header. Keep the key stable across repeat clicks/network retries for the same submission. Returns the saved claim with `deliveryState`; HTTP 201 means accepted, 202 means saved without confirmed acceptance. Do not interpret `success: true` alone as external acceptance.
- `POST /api/member-portal/claims`: requires the same UUID `Idempotency-Key` header and saves a claim for review; it does not call Mankrado.
- `PATCH /api/claims/submissions/:id/review`: APPROVE, RETURN or REJECT. Approval records the review and initiates delivery; check `deliveryState` in its response.
- `POST /api/claims/submissions/:id/send`: recovery for a saved NOT_SENT claim only, after staff approval for member-filed claims. This never retries FAILED or UNKNOWN claims.
- `GET /api/claims/history/:staffId`: authorized member history from Mankrado.
- `GET /api/claims/claimdetails/:externalId`: details for an external reference already associated with an accessible local Mankrado claim. It updates external status without changing local review status.

Delivery states: NOT_SENT, SENDING, ACCEPTED, FAILED, UNKNOWN. Requests time out after 30 seconds. Interrupted SENDING records older than two minutes become UNKNOWN when staff load claims. No automatic retries occur. For UNKNOWN, inspect Mankrado history and coordinate reconciliation before filing again; the stable submission reference is sent but provider deduplication support is not assumed. Historical SIMULATION records never enter live delivery.

Documents on filed claims cannot be deleted, except on returned, unsent drafts. Member submissions retain staff review; approval never implies that Mankrado approved payment.

## Verification

`npm run test:claims` runs mocked provider, delivery, document, and access-control tests without sending live claims. Run backend typecheck/build and frontend build/lint as well. Sandbox compatibility requires a test submission using a provider-recognized sandbox member and supported documents. No production claim should be used as test data.
