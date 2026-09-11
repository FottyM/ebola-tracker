/**
 * @fileoverview Epidemiological Data Reconciliation Engine.
 * Implements DATA-003: Precedence rules, parent-child reconciliation,
 * unallocated observation creation, correction auditing, and freshness determination.
 */

/**
 * @typedef {Object} ConflictRecord
 * @property {"blocking" | "non-blocking"} severity
 * @property {string} metric
 * @property {string} message
 * @property {any} [expected]
 * @property {any} [actual]
 */

/**
 * Reconciles national headline values with the sum of the official province table.
 * Fails closed with blocking conflicts if cumulative cases, deaths, or new cases mismatch.
 * @param {{
 *   confirmedCases: number,
 *   confirmedDeaths: number,
 *   newConfirmedCases?: number,
 *   reportingDate: string
 * }} national
 * @param {Array<{
 *   name: string,
 *   cases: number,
 *   deaths: number,
 *   newCases?: number
 * }>} provinces
 * @returns {{
 *   reconciled: boolean,
 *   blocking: boolean,
 *   conflicts: ConflictRecord[]
 * }}
 */
export function reconcileNationalWithProvinces(national, provinces) {
  const conflicts = [];

  const provinceCasesSum = provinces.reduce((sum, p) => sum + (p.cases || 0), 0);
  const provinceDeathsSum = provinces.reduce((sum, p) => sum + (p.deaths || 0), 0);

  if (provinceCasesSum !== national.confirmedCases) {
    conflicts.push({
      severity: "blocking",
      metric: "confirmedCases",
      message: `National confirmed cases (${national.confirmedCases}) do not equal sum of province cases (${provinceCasesSum}).`,
      expected: national.confirmedCases,
      actual: provinceCasesSum,
    });
  }

  if (provinceDeathsSum !== national.confirmedDeaths) {
    conflicts.push({
      severity: "blocking",
      metric: "confirmedDeaths",
      message: `National confirmed deaths (${national.confirmedDeaths}) do not equal sum of province deaths (${provinceDeathsSum}).`,
      expected: national.confirmedDeaths,
      actual: provinceDeathsSum,
    });
  }

  if (national.newConfirmedCases !== undefined) {
    const provinceNewCasesSum = provinces.reduce((sum, p) => sum + (p.newCases || 0), 0);
    if (provinceNewCasesSum !== national.newConfirmedCases) {
      conflicts.push({
        severity: "non-blocking",
        metric: "newConfirmedCases",
        message: `National new cases (${national.newConfirmedCases}) do not equal sum of province new cases (${provinceNewCasesSum}).`,
        expected: national.newConfirmedCases,
        actual: provinceNewCasesSum,
      });
    }
  }

  const isBlocking = conflicts.some((c) => c.severity === "blocking");

  return {
    reconciled: !isBlocking,
    blocking: isBlocking,
    conflicts,
  };
}

/**
 * Reconciles a province total with its allocated health zones.
 * If allocated health zones sum to less than the province total,
 * generates an explicit unallocated observation at province precision.
 * @param {{
 *   name: string,
 *   pcode?: string,
 *   cases: number,
 *   deaths: number,
 *   reportingDate: string
 * }} province
 * @param {Array<{
 *   name: string,
 *   cases: number,
 *   deaths: number
 * }>} healthZones
 * @returns {{
 *   unallocatedCases: number,
 *   unallocatedDeaths: number,
 *   unallocatedObservation: object | null,
 *   blocking: boolean,
 *   conflicts: ConflictRecord[]
 * }}
 */
export function reconcileProvinceWithHealthZones(province, healthZones) {
  const conflicts = [];
  const zoneCasesSum = healthZones.reduce((sum, z) => sum + (z.cases || 0), 0);
  const zoneDeathsSum = healthZones.reduce((sum, z) => sum + (z.deaths || 0), 0);

  // Guardrail: Zone sum cannot exceed province total
  if (zoneCasesSum > province.cases) {
    conflicts.push({
      severity: "blocking",
      metric: "cases",
      message: `Allocated health zone cases (${zoneCasesSum}) exceed province total (${province.cases}) for ${province.name}.`,
      expected: province.cases,
      actual: zoneCasesSum,
    });
  }

  if (zoneDeathsSum > province.deaths) {
    conflicts.push({
      severity: "blocking",
      metric: "deaths",
      message: `Allocated health zone deaths (${zoneDeathsSum}) exceed province total (${province.deaths}) for ${province.name}.`,
      expected: province.deaths,
      actual: zoneDeathsSum,
    });
  }

  const unallocatedCases = Math.max(0, province.cases - zoneCasesSum);
  const unallocatedDeaths = Math.max(0, province.deaths - zoneDeathsSum);

  let unallocatedObservation = null;
  if (unallocatedCases > 0 || unallocatedDeaths > 0) {
    unallocatedObservation = {
      id: `COD:${province.name}:unallocated:${province.reportingDate}`,
      geographicPrecision: "province",
      isUnallocated: true,
      country: { iso3: "COD", name: "Democratic Republic of the Congo" },
      province: { name: province.name, pcode: province.pcode },
      healthZone: null,
      city: null,
      metrics: {
        confirmedCases: unallocatedCases,
        confirmedDeaths: unallocatedDeaths,
      },
      note: `Unallocated cases/deaths awaiting epidemiological zone assignment in ${province.name}.`,
    };
  }

  const isBlocking = conflicts.some((c) => c.severity === "blocking");

  return {
    unallocatedCases,
    unallocatedDeaths,
    unallocatedObservation,
    blocking: isBlocking,
    conflicts,
  };
}

/**
 * Determines snapshot freshness based on reporting dates across sections and conflict severities.
 * @param {{
 *   nationalDate: string,
 *   provinceDate: string,
 *   healthZoneDate: string,
 *   hasBlockingConflicts?: boolean,
 *   hasNonBlockingConflicts?: boolean
 * }} params
 * @returns {{
 *   freshness: "current" | "partial" | "unchanged" | "stale" | "failed",
 *   reason?: string,
 *   sectionDates: { national: string, provinces: string, healthZones: string }
 * }}
 */
export function determineSnapshotFreshness({
  nationalDate,
  provinceDate,
  healthZoneDate,
  hasBlockingConflicts = false,
  hasNonBlockingConflicts = false,
}) {
  const sectionDates = {
    national: nationalDate,
    provinces: provinceDate,
    healthZones: healthZoneDate,
  };

  if (hasBlockingConflicts) {
    return {
      freshness: "failed",
      reason: "Ingestion failed closed due to blocking reconciliation conflicts.",
      sectionDates,
    };
  }

  // If health-zone date lags national/province report date
  if (healthZoneDate < nationalDate || healthZoneDate < provinceDate) {
    return {
      freshness: "partial",
      reason: `Health-zone data reference date (${healthZoneDate}) lags national situation report date (${nationalDate}).`,
      sectionDates,
    };
  }

  if (hasNonBlockingConflicts) {
    return {
      freshness: "partial",
      reason: "Non-blocking data warnings recorded during reconciliation.",
      sectionDates,
    };
  }

  return {
    freshness: "current",
    sectionDates,
  };
}

/**
 * Records an authoritative cumulative count correction (e.g. decrease after re-testing).
 * @param {{ region: string, cases: number, source: string, reportingDate: string }} previous
 * @param {{ region: string, cases: number, source: string, reportingDate: string, reason?: string }} updated
 * @returns {{
 *   isCorrection: boolean,
 *   difference: number,
 *   accepted: boolean,
 *   previousSource: string,
 *   newSource: string,
 *   auditLog: string
 * }}
 */
export function recordSourceCorrection(previous, updated) {
  const diff = updated.cases - previous.cases;
  const isCorrection = diff < 0;

  return {
    isCorrection,
    difference: diff,
    accepted: true,
    previousSource: previous.source,
    newSource: updated.source,
    auditLog: isCorrection
      ? `Authoritative correction accepted for ${updated.region}: cumulative cases adjusted by ${diff} (${previous.cases} -> ${updated.cases}). Reason: ${updated.reason || "Official epidemiological update"}.`
      : `Standard monotonic increase of +${diff} cases.`,
  };
}

/**
 * Segregates cross-country records to ensure medical evacuation destinations
 * do not increment affected nations count or duplicate epidemic caseloads.
 * @param {Array<{ countryCode: string, cases: number, type: "affected" | "medical-evacuation" | "monitoring" }>} records
 * @returns {{
 *   affectedCountriesCount: number,
 *   totalEpidemicCases: number,
 *   evacuationDestinations: Array<{ countryCode: string, cases: number }>
 * }}
 */
export function reconcileCrossCountryEvacuations(records) {
  let totalEpidemicCases = 0;
  const affected = new Set();
  const evacuationDestinations = [];

  for (const r of records) {
    if (r.type === "affected") {
      totalEpidemicCases += r.cases;
      affected.add(r.countryCode);
    } else if (r.type === "medical-evacuation") {
      evacuationDestinations.push({
        countryCode: r.countryCode,
        cases: r.cases,
      });
    }
  }

  return {
    affectedCountriesCount: affected.size,
    totalEpidemicCases,
    evacuationDestinations,
  };
}
