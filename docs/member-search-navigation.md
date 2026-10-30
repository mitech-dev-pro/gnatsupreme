# Member search and return navigation

Member-list profile, edit and workflow links carry an encoded `returnTo` URL containing the list filters, page size, page and viewed member anchor. **Back to members** restores that destination. Direct profile links without a valid return context fall back to `/members`. Only the local member-list route and numeric member anchors are accepted as return destinations.

In the current tab, a small in-memory cache records the row's viewport offset and horizontal table position, scoped to the staff account and exact list URL. Restoration scrolls the app's main content panel, focuses the visible desktop row or mobile card, and adds a **Last viewed** label. It does not select the member for bulk actions. Browser Back is also supported. Refreshes and fresh tabs retain the URL context and center the viewed row when the original offsets are unavailable.

If edits, removals or other changes move the member outside the current page or filters, the list explains this and keeps the filters. An empty last page is clamped to the remaining page count. Search input follows URL changes, including browser Back.

Edit links open the existing populated editor; workflow links focus the workflow section after details load. Obsolete list/detail responses are ignored, and delayed mutations or password results cannot populate a different member's view. All original edit, review and ownership rules still apply.

Search includes name, staff/Controller ID, Ghana Card, school and phone. Staff ID matching is case insensitive. Phone queries accept punctuation and Ghana local/international forms. Longer phone searches also normalize punctuation in legacy stored numbers through a parameterized, scoped PostgreSQL lookup. Short fragments and ordinary numeric staff IDs use the regular list query. Phone values are not rewritten. Access restrictions and selected filters are retained, and member ordering uses ID to break equal-status/equal-update-time ties.

No database migration is required. Deploy the backend before the frontend. Verification uses mocked APIs and synthetic member data, including `frontend/scripts/member-navigation-check.mjs`; no real records are edited during these checks.
