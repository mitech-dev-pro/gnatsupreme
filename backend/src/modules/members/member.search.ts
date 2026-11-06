import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import type { MemberSearchScope } from "./member.access.js";

export function phoneSearchTerms(search: string) {
  if (!/^\+?[\d\s().-]+$/.test(search)) return [];
  const digits = search.replace(/\D/g, "");
  if (digits.length < 3 || digits.length > 15) return [];
  const terms = new Set([digits]);
  const international = digits.startsWith("00233") ? digits.slice(2) : digits;
  if (international.startsWith("233") && international.length === 12) {
    terms.add(international);
    terms.add(`0${international.slice(3)}`);
  }
  if (digits.startsWith("0") && digits.length === 10) terms.add(`233${digits.slice(1)}`);
  return [...terms];
}

export async function memberSearchWhere(
  search: string | undefined,
  scope: MemberSearchScope,
): Promise<Prisma.MemberWhereInput> {
  if (!search?.trim()) return {};
  const value = search.trim();
  const terms = phoneSearchTerms(value);
  const OR: Prisma.MemberWhereInput[] = [
    { fullName: { contains: value, mode: "insensitive" } },
    { controllerId: { contains: value, mode: "insensitive" } },
    { ghanaCardId: { contains: value, mode: "insensitive" } },
    { school: { contains: value, mode: "insensitive" } },
    { phone: { contains: value } },
    ...terms.map((term) => ({ phone: { contains: term } })),
  ];
  // Full/long phone queries also match legacy punctuation in stored values. Scope is
  // applied here and again by the caller; SQL values are always parameterized. Always include
  // the ANY() clause whenever scope.kind !== "all" -- never guard it behind an array-length
  // check, which would omit the filter entirely for an empty-scope admin and let this subquery
  // return every member's id instead of none.
  if (terms.some((term) => term.length >= 9)) {
    const clauses = [Prisma.sql`TRUE`];
    if (scope.kind === "district") {
      clauses.push(Prisma.sql`district_id = ANY(${scope.districtIds}::int[])`);
    } else if (scope.kind === "region") {
      clauses.push(Prisma.sql`region_id = ANY(${scope.regionIds}::int[])`);
    }
    const matches = await prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id FROM members WHERE ${Prisma.join(clauses, " AND ")}
      AND (${Prisma.join(
        terms.map(
          (term) => Prisma.sql`regexp_replace(phone, '[^0-9]', '', 'g') LIKE ${`%${term}%`}`,
        ),
        " OR ",
      )})
    `);
    if (matches.length) OR.push({ id: { in: matches.map((item) => item.id) } });
  }
  return { OR };
}
