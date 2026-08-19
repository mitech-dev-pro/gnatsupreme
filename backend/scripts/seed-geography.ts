import { prisma } from "../src/lib/prisma.js";

const geography: Record<string, string[]> = {
  Ahafo: [
    "Asunafo North", "Asunafo South", "Asutifi North", "Asutifi South", "Tano North", "Tano South",
  ],
  Ashanti: [
    "Adansi Asokwa", "Adansi North", "Adansi South", "Afigya Kwabre North", "Afigya Kwabre South",
    "Ahafo Ano North", "Ahafo Ano South East", "Ahafo Ano South West", "Akrofuom", "Amansie Central",
    "Amansie West", "Amansie South", "Asante Akim Central", "Asante Akim North", "Asante Akim South",
    "Asokore Mampong", "Asokwa", "Atwima Kwanwoma", "Atwima Mponua", "Atwima Nwabiagya South",
    "Atwima Nwabiagya North", "Bekwai", "Bosome Freho", "Bosomtwe", "Ejisu", "Ejura Sekyedumase",
    "Juaben", "Kumasi Metropolitan", "Kwabre East", "Kwadaso", "Mampong", "Obuasi East", "Obuasi",
    "Offinso", "Offinso North", "Oforikrom", "Old Tafo", "Sekyere Afram Plains", "Sekyere Central",
    "Sekyere East", "Sekyere Kumawu", "Sekyere South", "Suame",
  ],
  Bono: [
    "Banda", "Berekum East", "Berekum West", "Dormaa Central", "Dormaa East", "Dormaa West",
    "Jaman North", "Jaman South", "Sunyani", "Sunyani West", "Tain", "Wenchi",
  ],
  "Bono East": [
    "Atebubu Amantin", "Kintampo North", "Kintampo South", "Nkoranza North", "Nkoranza South",
    "Pru East", "Pru West", "Sene East", "Sene West", "Techiman", "Techiman North",
  ],
  Central: [
    "Abura Asebu Kwamankese", "Agona East", "Agona West", "Ajumako Enyan Essiam",
    "Asikuma Odoben Brakwa", "Assin Fosu", "Assin North", "Assin South", "Awutu Senya East",
    "Awutu Senya West", "Cape Coast Metropolitan", "Effutu", "Ekumfi", "Gomoa East", "Gomoa Central",
    "Gomoa West", "Komenda Edina Eguafo Abirem", "Mfantsiman", "Twifo Atti Morkwa",
    "Twifo Hemang Lower Denkyira", "Upper Denkyira East", "Upper Denkyira West",
  ],
  Eastern: [
    "Abuakwa North", "Abuakwa South", "Achiase", "Akuapem North", "Akuapem South", "Akyemansa",
    "Asene Manso Akroso", "Asuogyaman", "Atiwa East", "Atiwa West", "Ayensuano", "Birim Central",
    "Birim North", "Birim South", "Denkyembour", "Fanteakwa North", "Fanteakwa South", "Kwaebibirem",
    "Kwahu Afram Plains North", "Kwahu Afram Plains South", "Kwahu East", "Kwahu South", "Kwahu West",
    "Lower Manya Krobo", "New Juaben North", "New Juaben South", "Nsawam Adoagyiri", "Okere", "Suhum",
    "Upper Manya Krobo", "Upper West Akim", "West Akim", "Yilo Krobo",
  ],
  "Greater Accra": [
    "Ablekuma Central", "Ablekuma North", "Ablekuma West", "Accra Metropolitan", "Ada East", "Ada West",
    "Adenta", "Ashaiman", "Ayawaso Central", "Ayawaso East", "Ayawaso North", "Ayawaso West",
    "Ga Central", "Ga East", "Ga North", "Ga South", "Ga West", "Korle Klottey", "Kpone Katamanso",
    "Krowor", "La Dade Kotopon", "La Nkwantanang Madina", "Ledzokuku", "Ningo Prampram",
    "Okaikwei North", "Shai Osudoku", "Tema Metropolitan", "Tema West", "Weija Gbawe",
  ],
  "North East": [
    "Bunkpurugu Nakpanduri", "Chereponi", "East Mamprusi", "Mamprugu Moagduri", "West Mamprusi",
    "Yunyoo Nasuan",
  ],
  Northern: [
    "Gushegu", "Karaga", "Kpandai", "Kumbungu", "Mion", "Nanton", "Nanumba North", "Nanumba South",
    "Saboba", "Sagnarigu", "Savelugu", "Tamale Metropolitan", "Tatale Sanguli", "Tolon", "Yendi", "Zabzugu",
  ],
  Oti: [
    "Biakoye", "Guan", "Jasikan", "Kadjebi", "Krachi East", "Krachi Nchumuru", "Krachi West",
    "Nkwanta North", "Nkwanta South",
  ],
  Savannah: [
    "Bole", "Central Gonja", "East Gonja", "North Gonja", "North East Gonja", "Sawla Tuna Kalba", "West Gonja",
  ],
  "Upper East": [
    "Bawku", "Bawku West", "Binduri", "Bolgatanga East", "Bolgatanga", "Bongo", "Builsa North",
    "Builsa South", "Garu", "Kassena Nankana East", "Kassena Nankana West", "Nabdam", "Pusiga", "Talensi",
    "Tempane",
  ],
  "Upper West": [
    "Daffiama Bussie Issa", "Jirapa", "Lambussie Karni", "Lawra", "Nadowli Kaleo", "Nandom",
    "Sissala East", "Sissala West", "Wa East", "Wa", "Wa West",
  ],
  Volta: [
    "Adaklu", "Afadzato South", "Agotime Ziope", "Akatsi North", "Akatsi South", "Anloga", "Central Tongu",
    "Ho", "Ho West", "Hohoe", "Keta", "Ketu North", "Ketu South", "Kpando", "North Dayi", "North Tongu",
    "South Dayi", "South Tongu",
  ],
  Western: [
    "Ahanta West", "Wassa Amenfi Central", "Wassa Amenfi West", "Effia Kwesimintsim", "Ellembelle", "Jomoro",
    "Mpohor", "Nzema East", "Prestea Huni Valley", "Sekondi Takoradi Metropolitan", "Shama", "Tarkwa Nsuaem",
    "Wassa Amenfi East", "Wassa East",
  ],
  "Western North": [
    "Aowin", "Bia East", "Bia West", "Bibiani Anhwiaso Bekwai", "Bodi", "Juaboso", "Sefwi Akontombra",
    "Sefwi Wiawso", "Suaman",
  ],
};

async function seedGeography() {
  const expectedRegions = Object.keys(geography).length;
  const expectedDistricts = Object.values(geography).reduce((total, districts) => total + districts.length, 0);

  if (expectedRegions !== 16 || expectedDistricts !== 261) {
    throw new Error(`Invalid geography seed: expected 16 regions/261 districts, got ${expectedRegions}/${expectedDistricts}`);
  }

  for (const [regionName, districtNames] of Object.entries(geography)) {
    const region = await prisma.region.upsert({
      where: { name: regionName },
      update: {},
      create: { name: regionName },
    });

    await prisma.district.createMany({
      data: districtNames.map((name) => ({ name, regionId: region.id })),
      skipDuplicates: true,
    });
  }

  const [regionCount, districtCount] = await Promise.all([
    prisma.region.count(),
    prisma.district.count(),
  ]);

  console.log(`Geography seed complete: ${regionCount} regions and ${districtCount} districts in the database.`);
}

try {
  await seedGeography();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Unable to seed geography: ${message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
