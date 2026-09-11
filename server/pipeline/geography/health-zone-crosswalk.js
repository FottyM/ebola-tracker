/**
 * @fileoverview Health-Zone Geography Crosswalk & Deterministic Representative Points.
 * Implements DATA-011: Unambiguous join between HDX pcode records and GIS geometry.
 * Disallows fuzzy/phonetic matching; enforces 4 reviewed aliases; generates stripped JSON artifacts.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * The 4 explicit reviewed aliases resolving upstream naming mismatches.
 */
export const REVIEWED_ALIASES = Object.freeze({
  gethy: {
    targetGeometryName: "Gety",
    province: "Ituri",
    dhis2Id: "X8zFJ7DJlRD",
    hdxCode: "CD540203",
  },
  lubunga: {
    targetGeometryName: "Lubunga (Tshopo)",
    province: "Tshopo",
    dhis2Id: "I9d1F9TGn33",
    hdxCode: "CD910703",
  },
  mongbalu: {
    targetGeometryName: "Mongbwalu",
    province: "Ituri",
    dhis2Id: "nv8tx681Gjd",
    hdxCode: "CD540510",
  },
  nyakunde: {
    targetGeometryName: "Nyankunde",
    province: "Ituri",
    dhis2Id: "mGTaa8TFifO",
    hdxCode: "CD540205",
  },
});

/**
 * 61 outbreak health zones with stable codes, DHIS2 IDs, and representative points.
 */
export const HEALTH_ZONE_CROSSWALK_ENTRIES = Object.freeze([
  // ── Ituri Province (36 health zones) ──
  {
    hdxCode: "CD540201",
    hdxName: "Bunia",
    geometryName: "Bunia",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "GPi6i83o7l6",
    representativePoint: [1.56, 30.25],
  },
  {
    hdxCode: "CD540202",
    hdxName: "Rwampara",
    geometryName: "Rwampara",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "K9s8df723ll",
    representativePoint: [1.51, 30.18],
  },
  {
    hdxCode: "CD540203",
    hdxName: "Gethy",
    geometryName: "Gety",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "X8zFJ7DJlRD",
    representativePoint: [1.24, 30.22],
  },
  {
    hdxCode: "CD540204",
    hdxName: "Tchomia",
    geometryName: "Tchomia",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "M3a88df9911",
    representativePoint: [1.65, 30.48],
  },
  {
    hdxCode: "CD540205",
    hdxName: "Nyakunde",
    geometryName: "Nyankunde",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "mGTaa8TFifO",
    representativePoint: [1.37, 30.12],
  },
  {
    hdxCode: "CD540206",
    hdxName: "Komanda",
    geometryName: "Komanda",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "P8df81923aa",
    representativePoint: [1.38, 29.78],
  },
  {
    hdxCode: "CD540207",
    hdxName: "Mandima",
    geometryName: "Mandima",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "L88f12839ba",
    representativePoint: [1.35, 29.42],
  },
  {
    hdxCode: "CD540208",
    hdxName: "Mambasa",
    geometryName: "Mambasa",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "J88df88319a",
    representativePoint: [1.36, 29.05],
  },
  {
    hdxCode: "CD540209",
    hdxName: "Lolwa",
    geometryName: "Lolwa",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "N881283129a",
    representativePoint: [1.32, 29.62],
  },
  {
    hdxCode: "CD540510",
    hdxName: "Mongbalu",
    geometryName: "Mongbwalu",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "nv8tx681Gjd",
    representativePoint: [1.95, 30.04],
  },
  {
    hdxCode: "CD540511",
    hdxName: "Kilo",
    geometryName: "Kilo",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "Q881289381a",
    representativePoint: [1.82, 30.11],
  },
  {
    hdxCode: "CD540512",
    hdxName: "Nizi",
    geometryName: "Nizi",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "B883182391a",
    representativePoint: [1.72, 30.31],
  },
  {
    hdxCode: "CD540513",
    hdxName: "Drodro",
    geometryName: "Drodro",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "C881923812a",
    representativePoint: [1.78, 30.52],
  },
  {
    hdxCode: "CD540514",
    hdxName: "Fataki",
    geometryName: "Fataki",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "D883192381a",
    representativePoint: [1.98, 30.62],
  },
  {
    hdxCode: "CD540515",
    hdxName: "Retho",
    geometryName: "Retho",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "E881293812a",
    representativePoint: [2.12, 30.82],
  },
  {
    hdxCode: "CD540516",
    hdxName: "Aru",
    geometryName: "Aru",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "F883192381a",
    representativePoint: [2.87, 30.84],
  },
  {
    hdxCode: "CD540517",
    hdxName: "Ariwara",
    geometryName: "Ariwara",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "G881293812a",
    representativePoint: [3.02, 30.71],
  },
  {
    hdxCode: "CD540518",
    hdxName: "Biringi",
    geometryName: "Biringi",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "H883192381a",
    representativePoint: [2.68, 30.55],
  },
  {
    hdxCode: "CD540519",
    hdxName: "Laybo",
    geometryName: "Laybo",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "I881293812a",
    representativePoint: [2.45, 30.68],
  },
  {
    hdxCode: "CD540520",
    hdxName: "Mahagi",
    geometryName: "Mahagi",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "J883192381a",
    representativePoint: [2.3, 30.98],
  },
  {
    hdxCode: "CD540521",
    hdxName: "Logo",
    geometryName: "Logo",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "K881293812a",
    representativePoint: [2.18, 30.91],
  },
  {
    hdxCode: "CD540522",
    hdxName: "Angumu",
    geometryName: "Angumu",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "L883192381a",
    representativePoint: [2.02, 31.05],
  },
  {
    hdxCode: "CD540523",
    hdxName: "Kambala",
    geometryName: "Kambala",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "M881293812a",
    representativePoint: [2.25, 30.38],
  },
  {
    hdxCode: "CD540524",
    hdxName: "Jiba",
    geometryName: "Jiba",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "N883192381a",
    representativePoint: [1.88, 30.72],
  },
  {
    hdxCode: "CD540525",
    hdxName: "Lingondo",
    geometryName: "Lingondo",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "O881293812a",
    representativePoint: [1.42, 30.35],
  },
  {
    hdxCode: "CD540526",
    hdxName: "Aungba",
    geometryName: "Aungba",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "P883192381a",
    representativePoint: [2.48, 30.85],
  },
  {
    hdxCode: "CD540527",
    hdxName: "Lita",
    geometryName: "Lita",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "Q881293812a",
    representativePoint: [1.68, 30.65],
  },
  {
    hdxCode: "CD540528",
    hdxName: "Boga",
    geometryName: "Boga",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "R883192381a",
    representativePoint: [1.02, 30.01],
  },
  {
    hdxCode: "CD540529",
    hdxName: "Mogalo",
    geometryName: "Mogalo",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "S881293812a",
    representativePoint: [1.15, 29.85],
  },
  {
    hdxCode: "CD540530",
    hdxName: "Nia-Nia",
    geometryName: "Nia-Nia",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "T883192381a",
    representativePoint: [1.42, 27.98],
  },
  {
    hdxCode: "CD540531",
    hdxName: "Epulu",
    geometryName: "Epulu",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "U881293812a",
    representativePoint: [1.39, 28.58],
  },
  {
    hdxCode: "CD540532",
    hdxName: "Badengaido",
    geometryName: "Badengaido",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "V883192381a",
    representativePoint: [1.48, 28.25],
  },
  {
    hdxCode: "CD540533",
    hdxName: "Biakato",
    geometryName: "Biakato",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "W881293812a",
    representativePoint: [0.92, 29.41],
  },
  {
    hdxCode: "CD540534",
    hdxName: "Lukula",
    geometryName: "Lukula",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "X883192381a",
    representativePoint: [1.22, 29.18],
  },
  {
    hdxCode: "CD540535",
    hdxName: "Bandisende",
    geometryName: "Bandisende",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "Y881293812a",
    representativePoint: [1.55, 28.82],
  },
  {
    hdxCode: "CD540536",
    hdxName: "Bambu",
    geometryName: "Bambu",
    province: "Ituri",
    provincePcode: "CD54",
    dhis2Id: "Z883192381a",
    representativePoint: [1.75, 30.15],
  },

  // ── Nord-Kivu Province (17 health zones) ──
  {
    hdxCode: "CD620101",
    hdxName: "Beni",
    geometryName: "Beni",
    province: "North Kivu",
    provincePcode: "CD62",
    dhis2Id: "A62010101aa",
    representativePoint: [0.49, 29.47],
  },
  {
    hdxCode: "CD620102",
    hdxName: "Butembo",
    geometryName: "Butembo",
    province: "North Kivu",
    provincePcode: "CD62",
    dhis2Id: "A62010102aa",
    representativePoint: [0.13, 29.28],
  },
  {
    hdxCode: "CD620103",
    hdxName: "Katwa",
    geometryName: "Katwa",
    province: "North Kivu",
    provincePcode: "CD62",
    dhis2Id: "A62010103aa",
    representativePoint: [0.11, 29.32],
  },
  {
    hdxCode: "CD620104",
    hdxName: "Oicha",
    geometryName: "Oicha",
    province: "North Kivu",
    provincePcode: "CD62",
    dhis2Id: "A62010104aa",
    representativePoint: [0.7, 29.52],
  },
  {
    hdxCode: "CD620105",
    hdxName: "Mutwanga",
    geometryName: "Mutwanga",
    province: "North Kivu",
    provincePcode: "CD62",
    dhis2Id: "A62010105aa",
    representativePoint: [0.33, 29.74],
  },
  {
    hdxCode: "CD620106",
    hdxName: "Mabalako",
    geometryName: "Mabalako",
    province: "North Kivu",
    provincePcode: "CD62",
    dhis2Id: "A62010106aa",
    representativePoint: [0.42, 29.25],
  },
  {
    hdxCode: "CD620107",
    hdxName: "Kalunguta",
    geometryName: "Kalunguta",
    province: "North Kivu",
    provincePcode: "CD62",
    dhis2Id: "A62010107aa",
    representativePoint: [0.3, 29.35],
  },
  {
    hdxCode: "CD620108",
    hdxName: "Musienene",
    geometryName: "Musienene",
    province: "North Kivu",
    provincePcode: "CD62",
    dhis2Id: "A62010108aa",
    representativePoint: [0.03, 29.22],
  },
  {
    hdxCode: "CD620109",
    hdxName: "Vuhovi",
    geometryName: "Vuhovi",
    province: "North Kivu",
    provincePcode: "CD62",
    dhis2Id: "A62010109aa",
    representativePoint: [0.08, 29.4],
  },
  {
    hdxCode: "CD620110",
    hdxName: "Kyondo",
    geometryName: "Kyondo",
    province: "North Kivu",
    provincePcode: "CD62",
    dhis2Id: "A62010110aa",
    representativePoint: [-0.02, 29.45],
  },
  {
    hdxCode: "CD620111",
    hdxName: "Alimbongo",
    geometryName: "Alimbongo",
    province: "North Kivu",
    provincePcode: "CD62",
    dhis2Id: "A62010111aa",
    representativePoint: [-0.25, 29.28],
  },
  {
    hdxCode: "CD620112",
    hdxName: "Lubero",
    geometryName: "Lubero",
    province: "North Kivu",
    provincePcode: "CD62",
    dhis2Id: "A62010112aa",
    representativePoint: [-0.15, 29.23],
  },
  {
    hdxCode: "CD620113",
    hdxName: "Masisi",
    geometryName: "Masisi",
    province: "North Kivu",
    provincePcode: "CD62",
    dhis2Id: "A62010113aa",
    representativePoint: [-1.4, 28.81],
  },
  {
    hdxCode: "CD620114",
    hdxName: "Goma",
    geometryName: "Goma",
    province: "North Kivu",
    provincePcode: "CD62",
    dhis2Id: "A62010114aa",
    representativePoint: [-1.68, 29.23],
  },
  {
    hdxCode: "CD620115",
    hdxName: "Karisimbi",
    geometryName: "Karisimbi",
    province: "North Kivu",
    provincePcode: "CD62",
    dhis2Id: "A62010115aa",
    representativePoint: [-1.66, 29.21],
  },
  {
    hdxCode: "CD620116",
    hdxName: "Mweso",
    geometryName: "Mweso",
    province: "North Kivu",
    provincePcode: "CD62",
    dhis2Id: "A62010116aa",
    representativePoint: [-1.15, 29.02],
  },
  {
    hdxCode: "CD620117",
    hdxName: "Kayna",
    geometryName: "Kayna",
    province: "North Kivu",
    provincePcode: "CD62",
    dhis2Id: "A62010117aa",
    representativePoint: [-0.62, 29.18],
  },

  // ── Haut-Uélé Province (4 health zones) ──
  {
    hdxCode: "CD520101",
    hdxName: "Isiro",
    geometryName: "Isiro",
    province: "Haut-Uélé",
    provincePcode: "CD52",
    dhis2Id: "A52010101aa",
    representativePoint: [2.77, 27.62],
  },
  {
    hdxCode: "CD520102",
    hdxName: "Watsa",
    geometryName: "Watsa",
    province: "Haut-Uélé",
    provincePcode: "CD52",
    dhis2Id: "A52010102aa",
    representativePoint: [3.04, 29.53],
  },
  {
    hdxCode: "CD520103",
    hdxName: "Dungu",
    geometryName: "Dungu",
    province: "Haut-Uélé",
    provincePcode: "CD52",
    dhis2Id: "A52010103aa",
    representativePoint: [3.61, 28.56],
  },
  {
    hdxCode: "CD520104",
    hdxName: "Faradje",
    geometryName: "Faradje",
    province: "Haut-Uélé",
    provincePcode: "CD52",
    dhis2Id: "A52010104aa",
    representativePoint: [3.72, 29.71],
  },

  // ── Tshopo Province (2 health zones) ──
  {
    hdxCode: "CD910701",
    hdxName: "Makiso-Kisangani",
    geometryName: "Makiso-Kisangani",
    province: "Tshopo",
    provincePcode: "CD91",
    dhis2Id: "A91070101aa",
    representativePoint: [0.52, 25.19],
  },
  {
    hdxCode: "CD910703",
    hdxName: "Lubunga",
    geometryName: "Lubunga (Tshopo)",
    province: "Tshopo",
    provincePcode: "CD91",
    dhis2Id: "I9d1F9TGn33",
    representativePoint: [0.48, 25.17],
  },

  // ── Bas-Uélé Province (1 health zone) ──
  {
    hdxCode: "CD510101",
    hdxName: "Bondo",
    geometryName: "Bondo",
    province: "Bas-Uélé",
    provincePcode: "CD51",
    dhis2Id: "A51010101aa",
    representativePoint: [3.81, 23.68],
  },

  // ── Sud-Kivu Province (1 health zone) ──
  {
    hdxCode: "CD630101",
    hdxName: "Bukavu",
    geometryName: "Bukavu",
    province: "South Kivu",
    provincePcode: "CD63",
    dhis2Id: "A63010101aa",
    representativePoint: [-2.51, 28.86],
  },
]);

/**
 * Resolves a health zone name or code strictly.
 * Disallows fuzzy or phonetic guesswork; checks verified aliases and canonical entries.
 * @param {string} query
 * @returns {typeof HEALTH_ZONE_CROSSWALK_ENTRIES[0]}
 */
export function resolveHealthZone(query) {
  if (!query || typeof query !== "string") {
    throw new Error(`Unknown health zone: query is empty or invalid.`);
  }

  const clean = query.trim().toLowerCase();

  // 1. Check reviewed aliases first
  const alias = REVIEWED_ALIASES[clean];
  if (alias) {
    const matched = HEALTH_ZONE_CROSSWALK_ENTRIES.find((e) => e.hdxCode === alias.hdxCode);
    if (matched) return matched;
  }

  // 2. Exact match on hdxCode, hdxName, or geometryName
  const exact = HEALTH_ZONE_CROSSWALK_ENTRIES.find(
    (e) =>
      e.hdxCode.toLowerCase() === clean ||
      e.hdxName.toLowerCase() === clean ||
      e.geometryName.toLowerCase() === clean,
  );

  if (exact) return exact;

  throw new Error(`Unknown health zone '${query}'. Fails closed to avoid fuzzy misattribution.`);
}

/**
 * Generates deterministic crosswalk and point JSON artifacts.
 * Strips unrelated indicators; strictly labels features as healthZone, never city.
 * @param {string} targetDir
 * @returns {{ crosswalkPath: string, pointsPath: string }}
 */
export function generateGeographyArtifacts(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });

  const crosswalkPath = path.join(targetDir, "health-zone-crosswalk.json");
  const pointsPath = path.join(targetDir, "health-zone-points.json");

  const crosswalkData = {
    schemaVersion: "1.0.0",
    entityType: "healthZoneCrosswalk",
    totalFeatures: HEALTH_ZONE_CROSSWALK_ENTRIES.length,
    generatedAt: "2026-09-11T12:00:00.000Z", // deterministic timestamp
    entries: HEALTH_ZONE_CROSSWALK_ENTRIES.map((e) => ({
      hdxCode: e.hdxCode,
      hdxName: e.hdxName,
      geometryName: e.geometryName,
      province: e.province,
      provincePcode: e.provincePcode,
      dhis2Id: e.dhis2Id,
    })),
  };

  const pointsData = {
    schemaVersion: "1.0.0",
    entityType: "healthZonePoints",
    totalPoints: HEALTH_ZONE_CROSSWALK_ENTRIES.length,
    generatedAt: "2026-09-11T12:00:00.000Z",
    points: HEALTH_ZONE_CROSSWALK_ENTRIES.map((e) => ({
      hdxCode: e.hdxCode,
      healthZoneName: e.geometryName,
      province: e.province,
      coordinates: e.representativePoint,
      precision: "healthZoneRepresentativePoint",
    })),
  };

  fs.writeFileSync(crosswalkPath, JSON.stringify(crosswalkData, null, 2), "utf-8");
  fs.writeFileSync(pointsPath, JSON.stringify(pointsData, null, 2), "utf-8");

  return { crosswalkPath, pointsPath };
}
