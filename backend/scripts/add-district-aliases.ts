import { confirm, input } from "@inquirer/prompts";

import { prisma } from "../src/lib/prisma.js";
import { deleteCachePrefix } from "../src/lib/cache.js";
import { recordAudit } from "../src/modules/audit/audit.service.js";

// One-off: persists the spelling/abbreviation variants found while reconciling GNAT's own
// district list (temp/match_districts.py) against the live app geography (see
// temp/app_geography_live.json) as real DistrictAlias rows, through the same create logic as
// POST /districts/aliases (district.routes.ts) -- duplicate check, cache invalidation, audit
// log -- so a future member import or district lookup benefits from them too, not just this
// one script. Deliberately excludes every alias that assumes an answer to one of GNAT's still-
// open jurisdiction questions (Amenfi East/West/Central, Bunkpurugu-Yunyoo, and every GNAT
// "Municipality"/"Municipal" name that collapses an app region's own further North/South/East/
// West split onto one arbitrarily-picked side) -- see the chat discussion this script came out
// of for the full reasoning per entry.
//
// Run with:
//   npx tsx scripts/add-district-aliases.ts

const ALIASES: { alias: string; district: string }[] = [
  { alias: "Atwima Mponue", district: "Atwima Mponua" },
  { alias: "Kumasi Metro (KMA)", district: "Kumasi Metropolitan" },
  { alias: "KMA", district: "Kumasi Metropolitan" },
  { alias: "Tafo Municipal", district: "Old Tafo" },
  { alias: "Nwabiagya North", district: "Atwima Nwabiagya North" },
  { alias: "Nwabiagya South", district: "Atwima Nwabiagya South" },
  { alias: "Adansi Akrofuom", district: "Akrofuom" },
  { alias: "Juabeng Municipal", district: "Juaben" },
  { alias: "Atebubu Amantim", district: "Atebubu Amantin" },
  { alias: "Komenda Edina Eguafo Abrem Municipal", district: "Komenda Edina Eguafo Abirem" },
  { alias: "Mfantseman Municipal", district: "Mfantsiman" },
  { alias: "Nsawam Adoagyire Municipal", district: "Nsawam Adoagyiri" },
  { alias: "Ayensuuano District", district: "Ayensuano" },
  { alias: "Asene/Manso Akoso", district: "Asene Manso Akroso" },
  { alias: "New Juabeng North", district: "New Juaben North" },
  { alias: "New Juabeng South", district: "New Juaben South" },
  { alias: "Bawku East Municipal", district: "Bawku" },
  { alias: "Kasena-Nankana West", district: "Kassena Nankana West" },
  { alias: "Lambussie", district: "Lambussie Karni" },
  { alias: "Sisala East", district: "Sissala East" },
  { alias: "Sisala West", district: "Sissala West" },
  { alias: "Nadwoli", district: "Nadowli Kaleo" },
  { alias: "Agortime/Kpetoe", district: "Agotime Ziope" },
  { alias: "Afadjato South", district: "Afadzato South" },
  { alias: "Anlo", district: "Anloga" },
  { alias: "Sekondi/ Takoradi Metro", district: "Sekondi Takoradi Metropolitan" },
  { alias: "Ellembele District", district: "Ellembelle" },
  { alias: "Akontombra District", district: "Sefwi Akontombra" },
  { alias: "Tema Metro", district: "Tema Metropolitan" },
  { alias: "Adentan Municipal", district: "Adenta" },
  { alias: "Kpone", district: "Kpone Katamanso" },
  { alias: "Okaikoi", district: "Okaikwei North" },
  { alias: "Accra Metro", district: "Accra Metropolitan" },
  { alias: "Osu Korle Klottey", district: "Korle Klottey" },
  { alias: "La Dadekotopon", district: "La Dade Kotopon" },
  { alias: "Ledzokuku", district: "Ledzokuku Municipal Assembly" },
  { alias: "La Nkwantan Madina Municipal", district: "La Nkwantanang Madina" },
  { alias: "Mamprugu Moaduri District", district: "Mamprugu Moagduri" },
];

async function main() {
  const districts = await prisma.district.findMany({
    select: { id: true, name: true, regionId: true },
  });
  const districtsByName = new Map(districts.map((d) => [d.name, d]));

  const existingAliases = await prisma.districtAlias.findMany({ select: { alias: true } });
  const existingLower = new Set(existingAliases.map((a) => a.alias.toLowerCase()));

  const toCreate: { alias: string; district: (typeof districts)[number] }[] = [];
  const skipped: { alias: string; reason: string }[] = [];

  for (const { alias, district: districtName } of ALIASES) {
    const district = districtsByName.get(districtName);
    if (!district) {
      skipped.push({ alias, reason: `unknown district "${districtName}"` });
      continue;
    }
    if (existingLower.has(alias.toLowerCase())) {
      skipped.push({ alias, reason: "already mapped (case-insensitive match)" });
      continue;
    }
    toCreate.push({ alias, district });
  }

  console.log(`${toCreate.length} alias(es) will be created.`);
  if (skipped.length > 0) {
    console.log(`${skipped.length} skipped:`);
    for (const s of skipped) console.log(`  "${s.alias}" -- ${s.reason}`);
  }
  if (toCreate.length === 0) {
    console.log("\nNothing to create.");
    return;
  }

  console.log("\nTo create:");
  for (const c of toCreate) console.log(`  "${c.alias}" -> ${c.district.name}`);

  const proceed = await confirm({
    message: `Create ${toCreate.length} district alias(es) now?`,
    default: false,
  });
  if (!proceed) {
    console.log("No changes made.");
    return;
  }

  const actorEmail = (
    process.env.ADMIN_EMAIL ??
    (await input({ message: "Your admin email (recorded in the audit log):" }))
  )
    .trim()
    .toLowerCase();
  const actor = await prisma.user.findUnique({ where: { email: actorEmail } });
  if (!actor || !actor.isActive || !["SUPER_ADMIN", "NATIONAL_ADMIN"].includes(actor.role)) {
    throw new Error("An active SUPER_ADMIN or NATIONAL_ADMIN with that email was not found");
  }

  let created = 0;
  for (const { alias, district } of toCreate) {
    const row = await prisma.districtAlias.create({
      data: { alias, districtId: district.id, createdById: actor.id },
    });
    await recordAudit({
      request: { ip: null, userAgent: "add-district-aliases script" },
      actor,
      action: "DISTRICT_ALIAS_CREATED",
      entityType: "DISTRICT_ALIAS",
      entityId: row.id,
      description: `Mapped "${alias}" to district ${district.name}`,
      afterData: { alias, districtId: district.id },
      regionId: district.regionId,
      districtId: district.id,
    });
    created++;
    console.log(`  created  "${alias}" -> ${district.name}`);
  }

  await deleteCachePrefix("reference:district-aliases:");
  console.log(`\n${created} alias(es) created.`);
}

main()
  .catch((error) => {
    if (error instanceof Error && error.name === "ExitPromptError") {
      console.log("\nCancelled. No changes made.");
      return;
    }
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
