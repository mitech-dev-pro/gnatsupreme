// Rejects the easy-to-guess choices a non-technical user picks when the character-class rules
// alone (staffPasswordSchema) are satisfied but offer no real resistance -- "Password1!",
// "Gnat2026!", etc. Matched after stripping trailing digits/symbols and lowercasing, so
// `Password123#` and `PASSWORD!` both normalize to the same entry a plain exact-string list
// would miss. Also rejects anything containing the org name, regardless of what's attached to
// it, without needing every digit/year variant spelled out as its own entry.

const ORG_NAME = "gnat";

const COMMON_PASSWORDS = [
  "password",
  "passw0rd",
  "letmein",
  "welcome",
  "admin",
  "administrator",
  "qwerty",
  "asdf",
  "zxcv",
  "changeme",
  "temppassword",
  "temporary",
  "supreme",
  "supremecare",
  "teacher",
  "ghana",
  "school",
  "secretary",
];

function normalize(password: string): string {
  return password
    .trim()
    .toLowerCase()
    .replace(/[0-9!@#$%&*?\-_=+]+$/g, "");
}

export function isCommonPassword(password: string): boolean {
  const normalized = normalize(password);
  if (normalized.includes(ORG_NAME)) return true;
  return COMMON_PASSWORDS.includes(normalized);
}
