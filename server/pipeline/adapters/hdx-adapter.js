/**
 * @fileoverview OCHA HDX Consolidated Ebola Feed Adapter.
 * Implements DATA-005: Schema validation, health-zone crosswalk resolution,
 * unmapped name fail-closed handling, and lag calculation.
 */

import { resolveHealthZone } from "../geography/health-zone-crosswalk.js";
import { HDX_CONFIG } from "../sources.js";

/**
 * Parses raw HDX consolidated CSV string into normalized health-zone observations.
 * @param {string} csvText
 * @param {string} [fetchedAt]
 * @returns {{
 *   valid: boolean,
 *   observations: Array<import('../contracts.js').NormalizedObservation>,
 *   referenceDate: string,
 *   errors: string[]
 * }}
 */
export function parseHdxConsolidatedCsv(csvText, fetchedAt = new Date().toISOString()) {
  const errors = [];

  if (!csvText || typeof csvText !== "string") {
    return {
      valid: false,
      observations: [],
      referenceDate: "",
      errors: ["Input CSV must be a non-empty string."],
    };
  }

  const lines = csvText.trim().split("\n");
  if (lines.length < 2) {
    return {
      valid: false,
      observations: [],
      referenceDate: "",
      errors: ["CSV contains insufficient rows."],
    };
  }

  const header = lines[0].trim().toLowerCase();
  const requiredCols = [
    "country_code",
    "location_level",
    "location_name",
    "pcode",
    "reference_date",
    "measure",
    "value",
  ];
  for (const col of requiredCols) {
    if (!header.includes(col)) {
      return {
        valid: false,
        observations: [],
        referenceDate: "",
        errors: [`Invalid HDX CSV schema: missing column '${col}'.`],
      };
    }
  }

  const headerCols = lines[0].split(",").map((c) => c.trim().toLowerCase());
  const colIndex = (name) => headerCols.indexOf(name);

  const _idxCountry = colIndex("country_code");
  const idxLocName = colIndex("location_name");
  const idxPcode = colIndex("pcode");
  const idxDate = colIndex("reference_date");
  const idxMeasure = colIndex("measure");
  const idxValue = colIndex("value");

  /** @type {Map<string, { pcode: string, name: string, cases: number, deaths: number, date: string, sourceUrl?: string }>} */
  const zoneRecords = new Map();
  let latestRefDate = "";

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cells = line.split(",").map((c) => c.trim());
    const pcode = cells[idxPcode];
    const locName = cells[idxLocName];
    const refDate = cells[idxDate];
    const measure = cells[idxMeasure]?.toLowerCase();
    const val = parseInt(cells[idxValue] || "0", 10);

    if (refDate && refDate > latestRefDate) {
      latestRefDate = refDate;
    }

    const key = pcode || locName;
    if (!zoneRecords.has(key)) {
      zoneRecords.set(key, {
        pcode,
        name: locName,
        cases: 0,
        deaths: 0,
        date: refDate,
      });
    }

    const record = zoneRecords.get(key);
    if (measure === "cases") {
      record.cases = val;
    } else if (measure === "deaths") {
      record.deaths = val;
    }
  }

  const observations = [];

  for (const [key, data] of zoneRecords.entries()) {
    try {
      // Resolve against verified crosswalk (checks exact codes, names, and 4 reviewed aliases)
      const geo = resolveHealthZone(data.pcode || data.name);

      observations.push({
        id: `COD:${geo.province}:${geo.geometryName}:${data.date}`,
        geographicPrecision: "health-zone",
        country: { iso3: "COD", name: "Democratic Republic of the Congo" },
        province: { name: geo.province, pcode: geo.provincePcode },
        healthZone: {
          name: geo.geometryName,
          pcode: geo.hdxCode,
          dhis2Id: geo.dhis2Id,
        },
        city: null, // Prohibited by DATA-001/002/011
        metrics: {
          confirmedCases: data.cases,
          confirmedDeaths: data.deaths,
        },
        provenance: {
          sourceId: "hdx-consolidated",
          publisher: "UN OCHA HDX",
          sourceUrl: `https://data.humdata.org/dataset/${HDX_CONFIG.packageId}/resource/${HDX_CONFIG.resourceId}`,
          recordIdentifier: `${geo.hdxCode}-${data.date}`,
        },
        timestamps: {
          sourceUpdatedAt: data.date,
          publishedAt: `${data.date}T12:00:00.000Z`,
          fetchedAt,
        },
        classification: "affected",
      });
    } catch (err) {
      errors.push(
        `Health zone resolution failed for '${key}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    observations,
    referenceDate: latestRefDate,
    errors,
  };
}

/**
 * Ingests HDX outbreak feed with date-lag computation.
 * @param {{
 *   csvContent: string,
 *   nationalReportingDate: string,
 *   fetchedAt?: string
 * }} params
 * @returns {{
 *   success: boolean,
 *   observations: Array<import('../contracts.js').NormalizedObservation>,
 *   coverageCount: number,
 *   referenceDate: string,
 *   lagDays: number,
 *   errors: string[]
 * }}
 */
export function ingestHdxOutbreakFeed({
  csvContent,
  nationalReportingDate,
  fetchedAt = new Date().toISOString(),
}) {
  const parsed = parseHdxConsolidatedCsv(csvContent, fetchedAt);
  if (!parsed.valid) {
    return {
      success: false,
      observations: [],
      coverageCount: 0,
      referenceDate: "",
      lagDays: 0,
      errors: parsed.errors,
    };
  }

  let lagDays = 0;
  if (nationalReportingDate && parsed.referenceDate) {
    const dNational = new Date(nationalReportingDate).getTime();
    const dHdx = new Date(parsed.referenceDate).getTime();
    lagDays = Math.max(0, Math.round((dNational - dHdx) / (1000 * 60 * 60 * 24)));
  }

  return {
    success: true,
    observations: parsed.observations,
    coverageCount: parsed.observations.length,
    referenceDate: parsed.referenceDate,
    lagDays,
    errors: [],
  };
}
