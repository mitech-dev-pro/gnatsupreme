# Code quality cleanup

## Baseline

The workspace was clean at the start of this cleanup. The current committed Mankrado
contract, including `/claim/submit`, is the compatibility baseline.

- Backend: 25 claims tests and typecheck pass.
- Frontend: strict TypeScript check passes.
- Frontend lint: existing `MemberAuthContext` effect dependency warning.
- Release smoke check: expects a `Transfers` bundle although its route is disabled.

## Functional issues outside this refactor

- The release smoke check and disabled Transfers route disagree. Keep the failing
  check visible until the product decision about Transfers is made.
- CORS `allowedHeaders` omits `Idempotency-Key`, which claim submissions use.
- The current Mankrado provider logs outgoing form fields. Review that logging
  separately against the intended handling of personal claim information.

No schema changes, migrations, API contract changes, live submissions, or changes
to review/authorization rules belong in this cleanup.

## Conventions

- Route entrypoints stay in `pages`; feature implementations, types, hooks, and
  components live under `features`. Shared primitives remain in `components/ui`.
- Backend routes own HTTP concerns, schemas own validation, and domain services
  own reusable business operations. Keep existing transaction and streaming boundaries.
- Use `unknown` for external errors and narrow them through the shared error helper.
- Use the standard Tailwind radius and type scales. Captions use `text-xs`, body
  and controls `text-sm`, subsection headings `text-base`, section headings
  `text-lg`, and page headings `text-2xl`.
- Intentional visual changes: 3px corners become 4px; 7–9px become 8px;
  10–12px become 12px; 14–18px become 16px. Typography becomes 12/14/16/18/24px
  according to purpose. Preserve fluid/calculated layouts and functional motion.
- Use Prettier (two spaces, semicolons, double quotes, trailing commas, UTF-8/LF).
  Generated code, historical migrations, secrets, uploads, and build artifacts are excluded.

## Implementation and review guide

Formatting and style conventions are separate concerns from the functional extractions:

- Formatting/configuration: root Prettier, EditorConfig and Git line-ending rules,
  package format scripts, and formatting of maintained source and scripts.
- Visual changes: standard Tailwind text and radius scales, exact spacing replacements,
  named palette/shadow tokens, and the updated `DESIGN.md`. At high zoom, member
  navigation scrolls horizontally instead of allowing labels to overlap.
- Frontend structure: route files retain their lazy-loaded entrypoints. Implementations
  live in claims, members, member-portal, auth, administration, imports and reporting
  feature directories. Shared claim event/payment/review sections and portal profile
  forms are separate components. Member editing, enrollment, login and import review
  state/request handling live in feature hooks. Administration tabs are separate components.
- Backend structure: HTTP schemas are separate from shared submission fields and
  member eligibility refinement. Benefit and document lookups retain explicit caller
  scope. Member/workflow operations and member-auth public projection are extracted.
  Mankrado response parsing is separate from multipart mapping and delivery operations.
- Typing: frontend strict checking is enabled. Both packages reject explicit `any`.
  Claim tests share typed HTTP adapters and proxy stubs; delivery uses an explicit
  dependency interface. Narrow test-only Express adapters remain at the HTTP boundary.

No commits were created. Formatting and structural edits remain in the working tree;
review whitespace-insensitive diffs alongside the new feature files for logic changes.

## Verification

Run `npm run quality:check` in each package for formatting, lint, typecheck, tests,
and a production build. Frontend lint also rejects arbitrary radius utilities.
The existing `test:smoke` remains separate and still reports the baseline Transfers
failure; it has not been weakened or removed.

Browser checks use mocked API responses only. Run the frontend production preview on
port 4173, then `npm run test:browser`. Windows uses installed Edge by default;
other platforms use Playwright Chromium. `BROWSER_CHANNEL` can override the browser.
Screenshots and results are written to ignored `frontend/test-results/quality/`.
The checked routes are staff claims, member claims, login, member creation and member
details, at 390px and 1440px, 100% and 200% CSS zoom, with keyboard focus and reduced
motion enabled. These checks verify representative screens, not every live-data workflow
or browser-native zoom implementation.

Backend verification: 33 tests pass. They cover multipart bytes/mappings, delivery
states, idempotency, staff/member boundaries, response parsing, document validation,
shared submission schemas, and the public member projection. No live provider
submission, migration, or database mutation was used for verification.

Frontend verification: 14 Vitest/React Testing Library tests pass, including shared
claim forms and review controls, API error narrowing, and import pagination/loading
behavior. Both package quality gates pass. Twenty mocked browser viewport/zoom
combinations passed without runtime errors or page-level horizontal overflow.
