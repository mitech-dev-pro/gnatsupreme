---
name: GNAT Supreme Care
description: A trustworthy operations workspace for membership and benefit administration.
colors:
  authority-navy: "#1e2761"
  authority-navy-deep: "#151b45"
  assurance-teal: "#1f9c7c"
  assurance-teal-deep: "#17805f"
  ink: "#171b26"
  quiet-slate: "#5b6472"
  border: "#e5e9f0"
  paper: "#fbfcfe"
  canvas: "#f4f6fa"
  danger: "#c23b3b"
  danger-soft: "#fbe9e9"
  success: "#17805f"
  success-soft: "#dff7ee"
  warning: "#b9791a"
  warning-soft: "#fbf0dd"
typography:
  headline:
    fontFamily: "Plus Jakarta Sans, Inter, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.25
  title:
    fontFamily: "Plus Jakarta Sans, Inter, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.35
rounded:
  sm: "7px"
  md: "9px"
  lg: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.assurance-teal}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.assurance-teal-deep}"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.authority-navy}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
  status-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "2px 10px"
---

# Design System: GNAT Supreme Care

## 1. Overview

**Creative North Star: "The Trusted Operations Desk"**

GNAT Supreme Care should feel like a well-organized desk used to complete important work: composed, legible, and dependable. It is a light product interface for staff working in ordinary office and school environments, often while processing large datasets or making consequential changes. Hierarchy and status must be understood at a glance.

The system is restrained and confident. It uses one strong navy for structure, one teal for primary action, and quiet neutral surfaces that keep records readable. It explicitly rejects flashy healthcare styling, crowded government-portal layouts, repetitive card grids, decorative motion, unexplained icons, and color-only status communication.

**Key Characteristics:**

- Dense enough for operational work, never cramped.
- Clear hierarchy with predictable placement of actions and feedback.
- Flat by default, with elevation reserved for floating surfaces.
- Consistent across administrative and member-facing experiences.
- Accessible at WCAG 2.1 AA and resilient at 200% zoom.

## 2. Colors

Authority Navy anchors structure, Assurance Teal marks action, and Quiet Slate neutrals keep long sessions comfortable.

### Primary

- **Authority Navy:** Navigation, headings, selected structural elements, and high-emphasis text.
- **Assurance Teal:** Primary actions, focus emphasis, and positive progress. It is functional, never decorative.

### Neutral

- **Ink:** Primary body text and values.
- **Quiet Slate:** Secondary text, metadata, hints, and inactive labels.
- **Paper:** Controls and primary content surfaces.
- **Canvas:** The application background behind working surfaces.
- **Border:** Dividers and control boundaries.

### Tertiary

- **Success:** Confirmed completion and healthy system states.
- **Warning:** Attention required without immediate failure.
- **Danger:** Errors, destructive actions, and blocked outcomes.

**The One Action Color Rule.** Assurance Teal is reserved for the primary action, focus, or progress. It must not become surface decoration.

**The Redundancy Rule.** Status always combines color with text, an icon, or both.

## 3. Typography

**Display Font:** Plus Jakarta Sans (with Inter and sans-serif fallback)
**Body Font:** Inter (with system-ui and sans-serif fallback)

**Character:** Headings are compact and authoritative. Body copy is neutral, highly legible, and optimized for tables, forms, and operational metadata.

### Hierarchy

- **Headline** (800, 22px, 1.25): Page titles only.
- **Title** (700, 15px, 1.35): Section and panel headings.
- **Body** (400, 13px, 1.5): Instructions, records, and descriptions. Prose is capped at 70ch.
- **Label** (600, 12px, 1.35): Controls, metadata, table headings, and compact actions.

**The Working Scale Rule.** Product hierarchy comes from weight and spacing before large type. Display-sized marketing typography is prohibited inside the application shell.

## 4. Elevation

The interface is flat by default. Borders and tonal surface changes establish structure. Soft ambient shadows are reserved for the sidebar logo, dropdowns, notifications, dialogs, and other elements that physically float over the working plane.

### Shadow Vocabulary

- **Low ambient** (`0 2px 6px rgba(30,39,97,0.10)`): Focused controls and small floating surfaces.
- **Floating** (`0 14px 34px rgba(30,39,97,0.18)`): Menus, notification panels, and dialogs.

**The Flat-by-Default Rule.** A surface at rest uses a border or tonal shift, not a shadow.

## 5. Components

Components are restrained and confident. Their states are obvious without changing the interaction vocabulary between screens.

### Buttons

- **Shape:** Gently curved rectangle (9px radius).
- **Primary:** Assurance Teal with light text and 10px by 16px padding.
- **Hover / Focus:** Deepen the teal on hover; use a visible 3px focus halo without moving the control.
- **Secondary:** Paper surface, Authority Navy text, and a quiet border.
- **Danger:** Reserve Danger red for destructive actions and pair it with explicit action copy.

### Chips

- **Style:** Soft semantic background with matching readable text and a pill shape.
- **State:** Always include a human-readable label; color alone is insufficient.

### Cards / Containers

- **Corner Style:** Gently rounded working surfaces (12px radius).
- **Background:** Paper over Canvas.
- **Shadow Strategy:** Flat at rest.
- **Border:** One-pixel quiet border.
- **Internal Padding:** 16px for compact panels, 24px for primary forms and sections.

### Inputs / Fields

- **Style:** Paper or near-paper fill, one-pixel border, and 9px radius.
- **Focus:** Assurance Teal border with a soft, visible focus halo.
- **Error / Disabled:** Error text is attached to its field; disabled controls retain readable labels and clearly reduced affordance.

### Navigation

The sidebar uses Authority Navy with muted labels, white active text, and Assurance Teal only for the current primary destination. Mobile navigation uses a dismissible overlay, visible focus, and predictable reading order. Inaccessible destinations are hidden unless their presence teaches the user how to request access.

### Data Tables

Tables prioritize scanning. Headers are compact, rows use quiet dividers, actions remain keyboard-accessible, and mobile layouts preserve the same information hierarchy without forcing users to decode a desktop table through horizontal scrolling.

## 6. Do's and Don'ts

### Do:

- **Do** make the current state and next available action visible in every workflow.
- **Do** use Authority Navy for structure and Assurance Teal for primary action.
- **Do** provide loading, empty, error, success, disabled, hover, focus, and active states.
- **Do** preserve familiar product patterns for forms, tables, navigation, and confirmations.
- **Do** keep touch targets usable and all workflows operable by keyboard.
- **Do** use plain language and explain internal terminology where it first appears.

### Don't:

- **Don't** use flashy or stereotypical healthcare styling that uses decoration to imply trust.
- **Don't** recreate dense government portals with weak hierarchy, crowded navigation, and long undifferentiated forms.
- **Don't** build generic dashboards from repetitive, interchangeable cards.
- **Don't** use decorative animation, novelty transitions, glass effects, or unexplained icons.
- **Don't** use role-specific jargon without contextual explanation.
- **Don't** rely on color alone to communicate status or urgency.
- **Don't** hide destructive actions behind ambiguous controls or browser-native dialogs.
- **Don't** use colored side-stripe borders, gradient text, or nested cards.
