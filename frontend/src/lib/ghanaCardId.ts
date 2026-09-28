// Matches the backend's shared `ghanaCard` schema (backend/src/modules/members/member.schemas.ts)
// exactly: literal "GHA-", 9 digits, a hyphen, then exactly 1 digit as the check digit.
export const GHANA_CARD_ID_REGEX = /^GHA-\d{9}-\d$/;

// Shown by default (not only once a digit is typed) -- a blank field gives no hint that a Ghana
// Card ID even has a fixed "GHA-" prefix. Fields using this should initialize their state to this
// constant instead of "", and use `hasGhanaCardIdDigits`/`ghanaCardIdOrNull` below rather than raw
// truthiness, since this constant itself is a non-empty string but represents "nothing entered".
export const GHANA_CARD_ID_PREFIX = "GHA-";

/**
 * Rebuilds the canonical "GHA-XXXXXXXXX-X" mask from whatever raw string the input currently
 * holds. Stateless by design: rather than trying to detect "was this a keystroke or a paste?"
 * (an event fires the same way either way), this always extracts the digits present and
 * rebuilds from scratch, which handles typing, backspacing, and pasting identically with no
 * branching. Deleting a digit out of the middle of the number block will shift everything after
 * it left by one (the check digit sliding into the block) -- an accepted, inherent consequence
 * of treating the whole ID as one flat digit stream, not a bug.
 */
export function formatGhanaCardIdInput(rawInputValue: string): string {
  const withoutPrefix = rawInputValue.replace(/^\s*gha-?/i, "");
  const digits = withoutPrefix.replace(/\D/g, "").slice(0, 10);
  if (!digits) return GHANA_CARD_ID_PREFIX;
  const numberBlock = digits.slice(0, 9);
  const checkDigit = digits.slice(9, 10);
  return checkDigit ? `GHA-${numberBlock}-${checkDigit}` : `GHA-${numberBlock}`;
}

// True once at least one digit has actually been entered -- the bare "GHA-" prefix alone (the
// default, untouched state) doesn't count. Use this instead of a raw truthiness check wherever
// code needs to know "did the user actually enter something here".
export function hasGhanaCardIdDigits(value: string): boolean {
  return /\d/.test(value);
}

// What to send to the API: null when nothing was actually entered (bare prefix or empty),
// otherwise the value as typed. Centralizes the "GHA-" alone isn't a real value" rule so every
// submit handler doesn't have to reimplement it.
export function ghanaCardIdOrNull(value: string): string | null {
  return hasGhanaCardIdDigits(value) ? value : null;
}

/**
 * The `onChange` handler every Ghana Card ID input should use. Formats the value (see above)
 * and restores the caret to sit after the same digit it followed before the reformat, since
 * rebuilding the whole string on every keystroke would otherwise always jump the caret to the
 * end -- breaking the normal "backspace to fix one digit in the middle" editing pattern.
 */
export function applyGhanaCardIdChange(event: React.ChangeEvent<HTMLInputElement>): string {
  const input = event.target;
  const raw = input.value;
  const caretRaw = input.selectionStart ?? raw.length;
  const digitsBeforeCaret = raw.slice(0, caretRaw).replace(/\D/g, "").length;
  const formatted = formatGhanaCardIdInput(raw);
  // Clamp to the digits that actually survived formatting (up to 10 -- the rest get truncated).
  // Without this, typing past the limit leaves digitsBeforeCaret higher than any achievable
  // count in `formatted`, so the loop below never satisfies its target and `pos` is stuck at its
  // initial value -- the caret snaps back to right after "GHA-" instead of staying at the end.
  const totalDigitsInFormatted = (formatted.match(/\d/g) ?? []).length;
  const targetDigitCount = Math.min(digitsBeforeCaret, totalDigitsInFormatted);

  requestAnimationFrame(() => {
    // Caret sits right after the targetDigitCount-th digit in the rebuilt string -- or right
    // after the literal "GHA-" prefix (if present) when there are no digits before it yet.
    let pos = formatted.startsWith("GHA-") ? 4 : 0;
    let seen = 0;
    for (let i = 0; i < formatted.length && seen < targetDigitCount; i += 1) {
      if (/\d/.test(formatted[i])) seen += 1;
      if (seen === targetDigitCount) pos = i + 1;
    }
    input.setSelectionRange(pos, pos);
  });

  return formatted;
}
