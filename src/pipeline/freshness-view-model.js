/**
 * @fileoverview Truthful Freshness & Provenance Presentation View Model.
 * Implements DATA-008: Showing authority reporting date, freshness state (current,
 * partial, stale, failed), and section-specific dates without changing established design.
 * Formats dates in European notation (DD/MM/YYYY) with 24-hour time (HH:mm).
 */

/**
 * Formats a date or timestamp into European notation (DD/MM/YYYY) with 24-hour time (HH:mm).
 * e.g. "2026-09-09" -> "09/09/2026 12:00"
 * e.g. "2026-09-09T14:30:00.000Z" -> "09/09/2026 14:30"
 * @param {string} dateStr
 * @param {string|null} [timeOrPublishedAt=null]
 * @returns {string}
 */
export function formatEuropeanDateTime(dateStr, timeOrPublishedAt = null) {
  if (!dateStr || dateStr === "N/A") return "N/A";

  let day = "";
  let month = "";
  let year = "";
  let time = "";

  // 1. If dateStr is an ISO string with time e.g. 2026-09-09T14:30:00Z
  if (typeof dateStr === "string" && dateStr.includes("T")) {
    const d = new Date(dateStr);
    if (!Number.isNaN(d.getTime())) {
      day = String(d.getUTCDate()).padStart(2, "0");
      month = String(d.getUTCMonth() + 1).padStart(2, "0");
      year = String(d.getUTCFullYear());
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mm = String(d.getUTCMinutes()).padStart(2, "0");
      time = `${hh}:${mm}`;
    }
  } else {
    // Check YYYY-MM-DD
    const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      year = m[1];
      month = m[2];
      day = m[3];
    } else {
      // Check already DD/MM/YYYY
      const dm = String(dateStr).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (dm) {
        day = dm[1];
        month = dm[2];
        year = dm[3];
      }
    }
  }

  // 2. Resolve time component
  if (!time && timeOrPublishedAt) {
    if (typeof timeOrPublishedAt === "string" && timeOrPublishedAt.includes("T")) {
      const td = new Date(timeOrPublishedAt);
      if (!Number.isNaN(td.getTime())) {
        const hh = String(td.getUTCHours()).padStart(2, "0");
        const mm = String(td.getUTCMinutes()).padStart(2, "0");
        time = `${hh}:${mm}`;
      }
    } else {
      const tm = String(timeOrPublishedAt).match(/(\d{2}):(\d{2})/);
      if (tm) {
        time = `${tm[1]}:${tm[2]}`;
      }
    }
  }

  // Default time to 12:00 if no time was specified
  if (!time) {
    time = "12:00";
  }

  if (day && month && year) {
    return `${day}/${month}/${year} ${time}`;
  }

  return String(dateStr);
}

/**
 * Formats a date into European date notation (DD/MM/YYYY).
 * @param {string} dateStr
 * @returns {string}
 */
export function formatEuropeanDate(dateStr) {
  if (!dateStr || dateStr === "N/A") return "N/A";
  if (typeof dateStr === "string" && dateStr.includes("T")) {
    const d = new Date(dateStr);
    if (!Number.isNaN(d.getTime())) {
      const day = String(d.getUTCDate()).padStart(2, "0");
      const month = String(d.getUTCMonth() + 1).padStart(2, "0");
      const year = String(d.getUTCFullYear());
      return `${day}/${month}/${year}`;
    }
  }
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
  return String(dateStr);
}

/**
 * Creates an accessible freshness view model from a snapshot or outbreak data.
 * @param {any} dataOrSnapshot
 * @returns {{
 *   rawReportingDate: string,
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
const STATUS_CONFIG = {
  current: { badgeClass: "freshness-current", en: "Current", fr: "À jour" },
  partial: { badgeClass: "freshness-partial", en: "Partial Update", fr: "Mise à jour partielle" },
  stale: { badgeClass: "freshness-stale", en: "Stale Fallback", fr: "Données antérieures" },
  failed: { badgeClass: "freshness-failed", en: "Sync Issue", fr: "Problème de synchronisation" },
};

const CADENCE_LABELS = {
  en: "Checked every 30m",
  fr: "Vérifié toutes les 30 min",
};

const UPDATED_LABELS = {
  en: "Updated:",
  fr: "Mis à jour :",
};

/**
 * Creates an accessible freshness view model from a snapshot or outbreak data.
 * @param {any} dataOrSnapshot
 * @param {"en"|"fr"} [locale="en"]
 * @returns {{
 *   rawReportingDate: string,
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
export function createFreshnessViewModel(dataOrSnapshot, locale = "en") {
  const lang = locale === "fr" ? "fr" : "en";

  if (!dataOrSnapshot || typeof dataOrSnapshot !== "object") {
    const failedCfg = STATUS_CONFIG.failed;
    return {
      rawReportingDate: "N/A",
      reportingDate: "N/A",
      status: "failed",
      statusText: failedCfg[lang],
      statusBadgeClass: failedCfg.badgeClass,
      hasMixedDates: false,
      sectionDates: { national: "N/A", provinces: "N/A", healthZones: "N/A" },
      checkCadence: CADENCE_LABELS[lang],
      renderHtml: () => "",
    };
  }

  // 1. Determine Authoritative Reporting Date
  const obs = dataOrSnapshot.observations || [];
  const nationalObs = obs.find((o) => o.geographicPrecision === "country");
  const zoneObs = obs.find((o) => o.geographicPrecision === "health-zone");

  const rawReportingDate =
    dataOrSnapshot.summary?.lastReportDate ||
    dataOrSnapshot.freshness?.sourceUpdatedAt ||
    nationalObs?.timestamps?.sourceUpdatedAt ||
    dataOrSnapshot.locations?.[0]?.lastReported ||
    (dataOrSnapshot.summary?.lastUpdated
      ? String(dataOrSnapshot.summary.lastUpdated).slice(0, 10)
      : new Date().toISOString().slice(0, 10));

  const rawTimeOrPublishedAt =
    dataOrSnapshot.freshness?.publishedAt ||
    nationalObs?.timestamps?.publishedAt ||
    dataOrSnapshot.publishedAt ||
    dataOrSnapshot.summary?.lastUpdated ||
    dataOrSnapshot.generatedAt ||
    null;

  const reportingDate = formatEuropeanDateTime(rawReportingDate, rawTimeOrPublishedAt);

  // 2. Identify Section-Specific Dates
  const rawNationalDate =
    nationalObs?.timestamps?.sourceUpdatedAt ||
    dataOrSnapshot.summary?.lastReportDate ||
    rawReportingDate;

  const rawHealthZoneDate =
    zoneObs?.timestamps?.sourceUpdatedAt ||
    dataOrSnapshot.freshness?.healthZoneDate ||
    dataOrSnapshot.locations?.find((l) => l.region && l.countryCode === "COD")?.lastReported ||
    rawNationalDate;

  const hasMixedDates = Boolean(
    rawNationalDate && rawHealthZoneDate && rawNationalDate !== rawHealthZoneDate,
  );

  // 3. Resolve Freshness Status
  let status = dataOrSnapshot.status || dataOrSnapshot.freshness?.freshness || "current";
  if (status === "unchanged") status = "current";
  if (!["current", "partial", "stale", "failed"].includes(status)) {
    status = hasMixedDates ? "partial" : "current";
  }

  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.current;
  const statusText = statusConfig[lang];
  const statusBadgeClass = statusConfig.badgeClass;

  const sectionDates = {
    national: formatEuropeanDate(rawNationalDate),
    provinces: formatEuropeanDate(rawNationalDate),
    healthZones: formatEuropeanDate(rawHealthZoneDate),
  };

  function renderHtml() {
    const updatedLabel = UPDATED_LABELS[lang];
    const ariaLabel =
      lang === "fr"
        ? `Fraîcheur de la surveillance : Mis à jour ${reportingDate}`
        : `Surveillance Freshness: Updated ${reportingDate}`;
    const subtext =
      lang === "fr"
        ? `National : ${sectionDates.national} • Zones de santé : ${sectionDates.healthZones}`
        : `National: ${sectionDates.national} • Health Zones: ${sectionDates.healthZones}`;

    return `
    <div class="freshness-bar" role="status" aria-label="${ariaLabel}">
      <div class="freshness-indicator ${statusBadgeClass}">
        <span class="freshness-label-group">
          <span class="freshness-dot" aria-hidden="true"></span>
          <span class="freshness-label">${updatedLabel} <strong>${reportingDate}</strong></span>
        </span>
        <span class="freshness-status-pill">${statusText}</span>
      </div>
      ${hasMixedDates ? `<div class="freshness-subtext">${subtext}</div>` : ""}
    </div>`;
  }

  return {
    rawReportingDate,
    reportingDate,
    status,
    statusText,
    statusBadgeClass,
    hasMixedDates,
    sectionDates,
    checkCadence: CADENCE_LABELS[lang],
    renderHtml,
  };
}
