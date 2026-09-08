// Matches the backend's shared `ghanaCard` schema (backend/src/modules/members/member.schemas.ts)
// exactly: literal "GHA-", 9 digits, a hyphen, then exactly 1 digit as the check digit.
export const GHANA_CARD_ID_REGEX = /^GHA-\d{9}-\d$/;

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
  if (!digits) return "";
  const numberBlock = digits.slice(0, 9);
  const checkDigit = digits.slice(9, 10);
  return checkDigit ? `GHA-${numberBlock}-${checkDigit}` : `GHA-${numberBlock}`;
}

/**
 * The `onChange` handler every Ghana Card ID input should use. Formats the value (see above)
 * and restores the caret to sit after the same digit it followed before the reformat, since
 * rebuilding the whole string on every keystroke would otherwise always jump the caret to the
 * end -- breaking the normal "backspace to fix one digit in the middle" editing pattern.
 */
export function applyGhanaCardIdChange(
  event: React.ChangeEvent<HTMLInputElement>,
): string {
  const input = event.target;
  const raw = input.value;
  const caretRaw = input.selectionStart ?? raw.length;
  const digitsBeforeCaret = raw.slice(0, caretRaw).replace(/\D/g, "").length;
  const formatted = formatGhanaCardIdInput(raw);

  requestAnimationFrame(() => {
    // Caret sits right after the digitsBeforeCaret-th digit in the rebuilt string -- or right
    // after the literal "GHA-" prefix (if present) when there are no digits before it yet.
    let pos = formatted.startsWith("GHA-") ? 4 : 0;
    let seen = 0;
    for (let i = 0; i < formatted.length && seen < digitsBeforeCaret; i += 1) {
      if (/\d/.test(formatted[i])) seen += 1;
      if (seen === digitsBeforeCaret) pos = i + 1;
    }
    input.setSelectionRange(pos, pos);
  });

  return formatted;
}
