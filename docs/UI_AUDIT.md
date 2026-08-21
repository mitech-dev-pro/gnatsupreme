# Frontend UI Audit

Audit date: 20 August 2026

## Health score

| Dimension | Score | Key finding |
| --- | ---: | --- |
| Accessibility | 2/4 | Several forms visually label controls without programmatic label association. |
| Performance | 3/4 | Route splitting is good; no serious animation or rendering problems were found. |
| Responsive design | 2/4 | Core layouts respond, but most operational tables depend on horizontal scrolling. |
| Theming | 1/4 | Theme tokens exist, but 650 hard-coded hexadecimal color uses bypass them. |
| Anti-patterns | 3/4 | The interface is restrained; repeated working-surface cards and legacy styling remain. |
| **Total** | **11/20** | **Acceptable, significant consistency work required** |

## Anti-pattern verdict

The product does not read as generic AI-generated UI. It has a coherent operational character and avoids gradient text, glass effects, novelty motion, and decorative metric templates. Its main weakness is implementation fragmentation: newer token-based components coexist with older page-specific styles.

## Prioritized findings

### P1: Organization settings do not reach every UI surface

- **Category:** Theming
- **Impact:** Administrators can save a brand or terminology change and still see old values elsewhere, which makes settings feel unreliable.
- **Recommendation:** Route shared colors through live CSS variables and expose terminology, currency, and timezone through the organization settings context.

### P1: Form labels are inconsistently associated with controls

- **Category:** Accessibility
- **Impact:** Screen-reader users may hear an unlabeled input, particularly in Setup, Settings, System, import review, and transfer workflows.
- **Standard:** WCAG 1.3.1 and 3.3.2.
- **Recommendation:** Migrate controls to the shared FormField components or add stable `id` and `htmlFor` pairs.

### P1: Operational tables lack purpose-built narrow-screen views

- **Category:** Responsive design
- **Impact:** At mobile widths and 200% zoom, users must pan horizontally to understand or act on records.
- **Standard:** WCAG 1.4.10.
- **Recommendation:** Provide compact record rows/cards for task-critical tables; retain accessible horizontal scrolling for secondary dense reports.

### P2: Loading and empty feedback varies by route

- **Category:** Accessibility / consistency
- **Impact:** Users cannot predict whether the system is loading, empty, or failed.
- **Recommendation:** Use shared skeleton, alert, and empty-state components with live-region semantics.

### P2: Small text actions have undersized touch targets

- **Category:** Responsive design
- **Impact:** Rename, edit, delete, and compact history actions can be difficult on touch screens.
- **Standard:** WCAG 2.5.8 target-size guidance.
- **Recommendation:** Use shared small buttons with a minimum 32px desktop and 44px coarse-pointer target.

### P2: Raw field keys appear in configuration history

- **Category:** Accessibility / clarity
- **Impact:** Audit history is harder to understand without internal implementation knowledge.
- **Recommendation:** Map stored keys to human-readable labels and disclose details progressively.

## Positive findings

- Route-level lazy loading keeps the initial bundle focused.
- Reduced-motion preferences are respected globally.
- Shared buttons, feedback, form fields, pagination, confirmations, and table frames provide a solid system foundation.
- Destructive actions use explicit confirmations rather than browser-native dialogs.
- The redesigned Setup and Settings workflows have strong hierarchy and progressive disclosure.
- Keyboard focus is globally visible.

## Fix order

1. Centralize live branding and organization terminology.
2. Migrate forms to programmatic labels and shared errors.
3. Add responsive record views to task-critical tables.
4. Standardize loading, empty, and error feedback.
5. Re-run this audit and finish with a visual polish pass.
