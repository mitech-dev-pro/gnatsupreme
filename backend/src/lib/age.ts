const ADULT_AGE_YEARS = 18;

// The only place date of birth is still collected/used anywhere in this app: computing whether
// a beneficiary is a minor, which is what actually gates the trustee/guardian fields (previously
// gated on relationship === "CHILD", which doesn't reliably indicate age -- an adult child is
// still relationship CHILD). An unknown/missing date of birth is treated as "not a minor" rather
// than blocking the form, since we can't assert minority without a birth date.
export function isMinor(
  dateOfBirth: Date | string | null | undefined,
  asOf: Date = new Date(),
): boolean {
  if (!dateOfBirth) return false;
  const dob = typeof dateOfBirth === "string" ? new Date(dateOfBirth) : dateOfBirth;
  if (Number.isNaN(dob.getTime())) return false;

  let age = asOf.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    asOf.getMonth() > dob.getMonth() ||
    (asOf.getMonth() === dob.getMonth() && asOf.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;

  return age < ADULT_AGE_YEARS;
}
