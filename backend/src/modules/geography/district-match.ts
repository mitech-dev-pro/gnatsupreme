// Government payroll/reconciliation files (Report 20, bulk member imports) spell district names
// inconsistently — most commonly by including or omitting the official "Municipal/Metropolitan/
// District Assembly" suffix. Stripping that suffix before comparing catches the vast majority of
// real-world variants safely, since it's a structural transformation, not a similarity guess —
// unlike fuzzy/edit-distance matching, it can't accidentally cross-match distinct neighboring
// districts (e.g. "Ga East" vs "Ga West"), which is a real risk in Ghana's district naming.

const SUFFIX_PATTERN = /\b(metropolitan|municipal|district)(\s+assembly)?\s*$/i;

export function stripDistrictSuffix(name: string): string {
  return name.replace(SUFFIX_PATTERN, "").trim();
}

export function normalizeDistrictName(name: string): string {
  return stripDistrictSuffix(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export type DistrictCandidate = {
  id: number;
  name: string;
  regionId: number;
  region: { name: string };
};

/**
 * Resolves a raw district name (as it appears in an uploaded file) to a known district.
 * Tries, in order: exact suffix-normalized match, then a staff-curated alias.
 */
export function resolveDistrict(
  rawName: string,
  rawRegion: string | null,
  districts: DistrictCandidate[],
  aliasMap: Map<string, number>,
): { district: DistrictCandidate | null; ambiguous: boolean } {
  const normalizedName = normalizeDistrictName(rawName);
  const normalizedRegion = rawRegion ? normalizeDistrictName(rawRegion) : null;

  const candidates = districts.filter(
    (district) =>
      normalizeDistrictName(district.name) === normalizedName &&
      (!normalizedRegion || normalizeDistrictName(district.region.name) === normalizedRegion),
  );
  if (candidates.length === 1) return { district: candidates[0]!, ambiguous: false };
  if (candidates.length > 1) return { district: null, ambiguous: true };

  const aliasedId = aliasMap.get(normalizedName);
  if (aliasedId) {
    const district = districts.find((d) => d.id === aliasedId) ?? null;
    if (district) return { district, ambiguous: false };
  }

  return { district: null, ambiguous: false };
}
