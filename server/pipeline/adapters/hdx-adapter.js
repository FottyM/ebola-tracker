/**
 * @fileoverview OCHA HDX Consolidated Ebola Feed Adapter.
 * Implements DATA-005: Schema validation, health-zone crosswalk resolution,
 * unmapped name fail-closed handling, and lag calculation.
 */

import { resolveHealthZone } from "../geography/health-zone-crosswalk.js";
import { AUTHORITATIVE_SOURCES } from "../sources.js";

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
export function parseHdxConsolidatedCsv(
  csvText,
  fetchedAt = new Date().toISOString(),
  { strict = true } = {},
) {
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

  const headerCols = lines[0].split(",").map((c) => c.trim().toLowerCase());
  const colIndex = (...names) => {
    for (const name of names) {
      const idx = headerCols.indexOf(name);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const idxCountry = colIndex("country_code", "location_country");
  const idxLocLevel = colIndex("location_level");
  const idxLocName = colIndex("location_name");
  const idxPcode = colIndex("pcode", "location_code");
  const idxDate = colIndex("reference_date");
  const idxMeasure = colIndex("measure");
  const idxClass = colIndex("case_classification", "classification");
  const idxValue = colIndex("value");

  if (
    idxCountry === -1 ||
    idxLocLevel === -1 ||
    idxLocName === -1 ||
    idxPcode === -1 ||
    idxDate === -1 ||
    idxMeasure === -1 ||
    idxValue === -1
  ) {
    return {
      valid: false,
      observations: [],
      referenceDate: "",
      errors: ["Invalid HDX CSV schema: missing required columns."],
    };
  }

  /** @type {Map<string, { geo: any, cases: number, deaths: number, casesDate: string, deathsDate: string, date: string }>} */
  const zoneRecords = new Map();
  let latestRefDate = "";

  const resolveCache = new Map();
  const resolveGeo = (name, code) => {
    const memoKey = `${name}:::${code}`;
    if (resolveCache.has(memoKey)) return resolveCache.get(memoKey);

    let geo = null;
    if (name) {
      try {
        geo = resolveHealthZone(name);
      } catch {}
    }
    if (!geo && code) {
      try {
        geo = resolveHealthZone(code);
      } catch {}
    }
    resolveCache.set(memoKey, geo);
    return geo;
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cells = line.split(",").map((c) => c.trim());
    const measure = cells[idxMeasure]?.toLowerCase();

    // Filter to confirmed cases and deaths if classification is present
    if (idxClass !== -1) {
      const classification = cells[idxClass]?.toLowerCase();
      if (classification && classification !== "confirmed") {
        continue;
      }
    }

    const pcode = cells[idxPcode];
    const locName = cells[idxLocName];
    const refDate = cells[idxDate];
    const val = parseInt(cells[idxValue] || "0", 10);

    if (refDate && refDate > latestRefDate) {
      latestRefDate = refDate;
    }

    const geo = resolveGeo(locName, pcode);
    if (!geo) {
      if (strict) {
        errors.push(`Unknown health zone '${locName || pcode}'.`);
      }
      continue;
    }

    const key = geo.geometryName;
    if (!zoneRecords.has(key)) {
      zoneRecords.set(key, {
        geo,
        cases: 0,
        deaths: 0,
        casesDate: "",
        deathsDate: "",
        date: refDate,
      });
    }

    const record = zoneRecords.get(key);
    if (!record.date || (refDate && refDate > record.date)) {
      record.date = refDate;
    }

    if (measure === "cases") {
      if (!record.casesDate || refDate >= record.casesDate) {
        record.cases = val;
        record.casesDate = refDate;
      }
    } else if (measure === "deaths") {
      if (!record.deathsDate || refDate >= record.deathsDate) {
        record.deaths = val;
        record.deathsDate = refDate;
      }
    }
  }

  const observations = [];

  for (const data of zoneRecords.values()) {
    const geo = data.geo;
    observations.push({
      id: `COD:${geo.province}:${geo.geometryName}:${data.date}`,
      geographicPrecision: "health-zone",
      country: { iso3: "COD", name: "Democratic Republic of the Congo" },
      province: { name: geo.province },
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
        publisher: "UN OCHA Humanitarian Data Exchange",
        sourceUrl:
          "https://data.humdata.org/dataset/e902b209-b7bc-42f9-893a-294276d7cc62/resource/d90385d3-5339-4a3f-ac63-2699361edbe0/download/drc_ebola_cases_consolidated.csv",
        recordIdentifier: `HDX-${geo.hdxCode}-${data.date}`,
      },
      timestamps: {
        sourceUpdatedAt: data.date,
        publishedAt: `${data.date}T12:00:00.000Z`,
        fetchedAt,
      },
      classification: "affected",
    });
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

/**
 * Fetches and parses the latest consolidated HDX CSV feed.
 * @param {{ url?: string, timeoutMs?: number, strict?: boolean }} [options]
 * @returns {Promise<{
 *   success: boolean,
 *   csvText?: string,
 *   parsed?: ReturnType<typeof parseHdxConsolidatedCsv>,
 *   error?: string
 * }>}
 */
export async function fetchLatestHdxFeed({
  url = AUTHORITATIVE_SOURCES["hdx-consolidated"].exactUrl,
  timeoutMs = 15000,
  strict = false,
} = {}) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "EbolaOutbreakTracker/1.0 (Automated Public Health Aggregator)",
        Accept: "text/csv, text/plain, */*",
      },
    });
    clearTimeout(timer);

    if (!resp.ok) {
      return {
        success: false,
        error: `HDX download failed with HTTP status ${resp.status} ${resp.statusText}`,
      };
    }

    const csvText = await resp.text();
    const parsed = parseHdxConsolidatedCsv(csvText, new Date().toISOString(), { strict });

    return {
      success: parsed.valid,
      csvText,
      parsed,
      error: parsed.valid ? undefined : parsed.errors.join("; "),
    };
  } catch (err) {
    return {
      success: false,
      error: `HDX fetch exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
