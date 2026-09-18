/**
 * @fileoverview Dynamic Backend ETL Engine.
 * Ingests live data from public humanitarian & health data APIs:
 * - WHO DONs (Disease Outbreak News Feed)
 * - HDX CKAN Open Data API (UN OCHA)
 * - ReliefWeb Humanitarian Portal Reports
 * - Africa CDC & ECDC Epidemiological Bulletins
 */

/**
 * @typedef {Object} GeoLocation
 * @property {string} country - Country name.
 * @property {string} countryCode - ISO3 code.
 * @property {string} [region] - Sub-national region or district.
 * @property {string} [province] - Parent province for a health-zone observation.
 * @property {"country" | "province" | "health-zone"} [geographicPrecision]
 * @property {number} cases - Confirmed case count.
 * @property {number} deaths - Confirmed fatalities.
 * @property {number} cfr - Case fatality rate (%).
 * @property {string} status - Epidemic status.
 * @property {[number, number]} center - [Latitude, Longitude] centroid.
 * @property {string} lastReported - Date of latest update.
 * @property {string} [note] - Epidemiological or clinical note.
 */

/**
 * @typedef {Object} EpiCurvePoint
 * @property {string} week - Epi week label (e.g. 'W24 (Jun 8)').
 * @property {number} weeklyCases - New cases reported in that week.
 * @property {number} cumulativeCases - Total cumulative confirmed cases.
 * @property {number} weeklyDeaths - Fatalities recorded in that week.
 */

/**
 * @typedef {Object} Demographics
 * @property {{ femalePct: number, malePct: number, pregnantOrLactating: number }} sex
 * @property {Array<{ group: string, percentage: number, cases: number, deaths: number, cfr: number }>} ageGroups
 * @property {{ healthcareWorkersCases: number, healthcareWorkersDeaths: number }} vulnerableGroups
 */

/**
 * @typedef {Object} DynamicOutbreakState
 * @property {{
 *   totalCases: number,
 *   totalDeaths: number,
 *   overallCfr: string,
 *   affectedCountriesCount: number,
 *   lastUpdated: string
 * }} summary
 * @property {GeoLocation[]} locations - Dynamically discovered affected territories.
 * @property {EpiCurvePoint[]} epiCurve - Weekly epidemiological curve data points.
 * @property {Demographics} demographics - Disaggregated sex and age distribution data.
 * @property {Array<{ from: [number, number], to: [number, number], label: string }>} corridors
 * @property {Record<string, { name: string, url: string, status: string }>} sources
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import defaultOutbreakData from "../src/data/outbreak-data.js";
import { loadLatestSnapshot } from "./pipeline/snapshot-store.js";
import { mapSnapshotToLegacyState } from "./pipeline/contracts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = path.resolve(__dirname, "../public/data");

/** @type {DynamicOutbreakState} */
let liveOutbreakState = null;

function getActiveState() {
  const snapshot = loadLatestSnapshot(SNAPSHOT_DIR);
  if (snapshot) {
    liveOutbreakState = mapSnapshotToLegacyState(snapshot);
    liveOutbreakState.snapshotId = snapshot.snapshotId;
  } else if (!liveOutbreakState) {
    liveOutbreakState = structuredClone(defaultOutbreakData);
  }
  return liveOutbreakState;
}

/** @type {number} */
let lastFetchTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Universal dynamic ETL pipeline.
 * Backed by atomic snapshot store.
 * @returns {Promise<DynamicOutbreakState>}
 */
export async function runETL() {
  const now = Date.now();
  const state = getActiveState();
  if (now - lastFetchTime < CACHE_TTL_MS && state) {
    return state;
  }

  lastFetchTime = now;
  return getActiveState();
}

/**
 * Synchronous state getter.
 * @returns {DynamicOutbreakState}
 */
export function getCachedData() {
  return getActiveState();
}
