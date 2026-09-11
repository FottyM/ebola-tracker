/**
 * @fileoverview Truthful Freshness & Provenance Presentation View Model.
 * Implements DATA-008: Showing authority reporting date, freshness state (current,
 * partial, stale, failed), and section-specific dates without changing established design.
 */

/**
 * Creates an accessible freshness view model from a snapshot or outbreak data.
 * @param {any} dataOrSnapshot
 * @returns {{
 *   reportingDate: string,
 *   status: 'current' | 'partial' | 'stale' | 'failed',
 *   statusText: string,
 *   statusBadgeClass: string,
 *   hasMixedDates: boolean,
 *   sectionDates: { national: string, provinces: string, healthZones: string },
 *   checkCadence: string,
 *   renderHtml: () => string
 * }}
 */
export function createFreshnessViewModel(dataOrSnapshot) {
  if (!dataOrSnapshot || typeof dataOrSnapshot !== "object") {
    return {
      reportingDate: "N/A",
      status: "failed",
      statusText: "Sync Issue",
      statusBadgeClass: "freshness-failed",
      hasMixedDates: false,
      sectionDates: { national: "N/A", provinces: "N/A", healthZones: "N/A" },
      checkCadence: "Checked every 30m",
      renderHtml: () => "",
    };
  }

  // 1. Determine Authoritative Reporting Date
  const obs = dataOrSnapshot.observations || [];
  const nationalObs = obs.find((o) => o.geographicPrecision === "country");
  const zoneObs = obs.find((o) => o.geographicPrecision === "health-zone");

  const reportingDate =
    dataOrSnapshot.summary?.lastReportDate ||
    dataOrSnapshot.freshness?.sourceUpdatedAt ||
    nationalObs?.timestamps?.sourceUpdatedAt ||
    dataOrSnapshot.locations?.[0]?.lastReported ||
    (dataOrSnapshot.summary?.lastUpdated
      ? String(dataOrSnapshot.summary.lastUpdated).slice(0, 10)
      : new Date().toISOString().slice(0, 10));

  // 2. Identify Section-Specific Dates
  const nationalDate =
    nationalObs?.timestamps?.sourceUpdatedAt ||
    dataOrSnapshot.summary?.lastReportDate ||
    reportingDate;

  const healthZoneDate =
    zoneObs?.timestamps?.sourceUpdatedAt ||
    dataOrSnapshot.freshness?.healthZoneDate ||
    dataOrSnapshot.locations?.find((l) => l.region && l.countryCode === "COD")?.lastReported ||
    nationalDate;

  const hasMixedDates = Boolean(nationalDate && healthZoneDate && nationalDate !== healthZoneDate);

  // 3. Resolve Freshness Status
  let status = dataOrSnapshot.status || dataOrSnapshot.freshness?.freshness || "current";
  if (status === "unchanged") status = "current";
  if (!["current", "partial", "stale", "failed"].includes(status)) {
    status = hasMixedDates ? "partial" : "current";
  }

  let statusText = "Current";
  let statusBadgeClass = "freshness-current";

  switch (status) {
    case "partial":
      statusText = "Partial Update";
      statusBadgeClass = "freshness-partial";
      break;
    case "stale":
      statusText = "Stale Fallback";
      statusBadgeClass = "freshness-stale";
      break;
    case "failed":
      statusText = "Sync Issue";
      statusBadgeClass = "freshness-failed";
      break;
    case "current":
    default:
      statusText = "Current";
      statusBadgeClass = "freshness-current";
      break;
  }

  const sectionDates = {
    national: nationalDate,
    provinces: nationalDate,
    healthZones: healthZoneDate,
  };

  function renderHtml() {
    return `
    <div class="freshness-bar" role="status" aria-label="Surveillance Freshness: Updated ${reportingDate}">
      <div class="freshness-indicator ${statusBadgeClass}">
        <span class="freshness-label-group">
          <span class="freshness-dot" aria-hidden="true"></span>
          <span class="freshness-label">Updated: <strong>${reportingDate}</strong></span>
        </span>
        <span class="freshness-status-pill">${statusText}</span>
      </div>
      ${
        hasMixedDates
          ? `<div class="freshness-subtext">National: ${sectionDates.national} • Health Zones: ${sectionDates.healthZones}</div>`
          : ""
      }
    </div>`;
  }

  return {
    reportingDate,
    status,
    statusText,
    statusBadgeClass,
    hasMixedDates,
    sectionDates,
    checkCadence: "Checked every 30m",
    renderHtml,
  };
}
