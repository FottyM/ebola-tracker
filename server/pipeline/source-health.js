/**
 * Operational Source Health & Freshness Tracker
 * DATA-015: Separates transport health from epidemiological freshness.
 */

/**
 * Valid states for source execution and data freshness
 */
export const SourceStates = Object.freeze({
  TRANSPORT: {
    REACHABLE: "reachable",
    UNREACHABLE: "unreachable",
  },
  PARSE: {
    VALID: "valid",
    INVALID: "invalid",
  },
  VALIDATION: {
    VALID: "valid",
    CONFLICT: "conflict",
    BLOCKING: "blocking",
  },
  FRESHNESS: {
    CURRENT: "current",
    PARTIAL: "partial",
    STALE: "stale",
    FAILED: "failed",
  },
});

/**
 * Calculate age in days between an ISO date string and current date
 * @param {string} reportingDate
 * @param {string} [currentDate]
 * @returns {number}
 */
export function calculateReportingAgeDays(reportingDate, currentDate) {
  if (!reportingDate) return Infinity;
  const rep = new Date(reportingDate).getTime();
  const cur = currentDate ? new Date(currentDate).getTime() : Date.now();
  if (Number.isNaN(rep) || Number.isNaN(cur)) return Infinity;
  const diffMs = cur - rep;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Derive public epidemiological freshness independent of HTTP 200 connectivity.
 *
 * @param {object} params
 * @param {"reachable"|"unreachable"} params.transportStatus
 * @param {number|null} [params.httpStatus]
 * @param {"valid"|"invalid"} params.parseStatus
 * @param {"valid"|"conflict"|"blocking"} params.validationStatus
 * @param {string|null} [params.reportingDate]
 * @param {string} [params.currentDate]
 * @param {number} [params.staleThresholdDays=7]
 * @returns {{
 *   transportStatus: string,
 *   httpStatus: number|null,
 *   parseStatus: string,
 *   validationStatus: string,
 *   reportingDate: string|null,
 *   freshnessStatus: "current"|"partial"|"stale"|"failed",
 *   ageDays: number,
 *   reason: string
 * }}
 */
export function deriveSourceFreshness({
  transportStatus,
  httpStatus = null,
  parseStatus,
  validationStatus,
  reportingDate = null,
  currentDate,
  staleThresholdDays = 7,
}) {
  if (transportStatus === SourceStates.TRANSPORT.UNREACHABLE) {
    return {
      transportStatus: SourceStates.TRANSPORT.UNREACHABLE,
      httpStatus,
      parseStatus,
      validationStatus,
      reportingDate,
      freshnessStatus: SourceStates.FRESHNESS.FAILED,
      ageDays: Infinity,
      reason: "Transport unreachable: network or DNS failure",
    };
  }

  if (parseStatus !== SourceStates.PARSE.VALID) {
    return {
      transportStatus,
      httpStatus,
      parseStatus: SourceStates.PARSE.INVALID,
      validationStatus,
      reportingDate,
      freshnessStatus: SourceStates.FRESHNESS.FAILED,
      ageDays: Infinity,
      reason: "Parse failure: source format changed or corrupted payload",
    };
  }

  if (validationStatus === SourceStates.VALIDATION.BLOCKING) {
    return {
      transportStatus,
      httpStatus,
      parseStatus,
      validationStatus: SourceStates.VALIDATION.BLOCKING,
      reportingDate,
      freshnessStatus: SourceStates.FRESHNESS.FAILED,
      ageDays: Infinity,
      reason: "Validation failure: blocking integrity error detected",
    };
  }

  if (!reportingDate) {
    return {
      transportStatus,
      httpStatus,
      parseStatus,
      validationStatus,
      reportingDate: null,
      freshnessStatus: SourceStates.FRESHNESS.FAILED,
      ageDays: Infinity,
      reason: "Missing authoritative reporting date in source content",
    };
  }

  const ageDays = calculateReportingAgeDays(reportingDate, currentDate);

  if (validationStatus === SourceStates.VALIDATION.CONFLICT) {
    return {
      transportStatus,
      httpStatus,
      parseStatus,
      validationStatus: SourceStates.VALIDATION.CONFLICT,
      reportingDate,
      freshnessStatus: SourceStates.FRESHNESS.PARTIAL,
      ageDays,
      reason: "Reconciliation conflict observed: non-blocking variance",
    };
  }

  if (ageDays > staleThresholdDays) {
    return {
      transportStatus,
      httpStatus,
      parseStatus,
      validationStatus,
      reportingDate,
      freshnessStatus: SourceStates.FRESHNESS.STALE,
      ageDays,
      reason: `Reporting date exceeds threshold of ${staleThresholdDays} days (${ageDays} days old)`,
    };
  }

  return {
    transportStatus,
    httpStatus,
    parseStatus,
    validationStatus,
    reportingDate,
    freshnessStatus: SourceStates.FRESHNESS.CURRENT,
    ageDays,
    reason: "Source is verified, validated, and current",
  };
}

/**
 * Record a structured operational run result for a single source.
 *
 * @param {object} params
 * @param {string} params.sourceId
 * @param {string} [params.sourceUrl]
 * @param {"reachable"|"unreachable"} params.transportStatus
 * @param {number|null} [params.httpStatus]
 * @param {number} [params.durationMs]
 * @param {"valid"|"invalid"} params.parseStatus
 * @param {"valid"|"conflict"|"blocking"} params.validationStatus
 * @param {string|null} [params.reportingDate]
 * @param {string|null} [params.contentHash]
 * @param {string} [params.currentDate]
 * @param {number} [params.staleThresholdDays=7]
 * @returns {object} Standardized run entry
 */
export function recordSourceRunResult({
  sourceId,
  sourceUrl = "",
  transportStatus,
  httpStatus = null,
  durationMs = 0,
  parseStatus,
  validationStatus,
  reportingDate = null,
  contentHash = null,
  currentDate,
  staleThresholdDays = 7,
}) {
  const freshness = deriveSourceFreshness({
    transportStatus,
    httpStatus,
    parseStatus,
    validationStatus,
    reportingDate,
    currentDate,
    staleThresholdDays,
  });

  return {
    sourceId,
    sourceUrl,
    transportStatus,
    httpStatus,
    durationMs,
    parseStatus,
    validationStatus,
    reportingDate,
    contentHash,
    freshnessStatus: freshness.freshnessStatus,
    freshnessReason: freshness.reason,
    ageDays: freshness.ageDays,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format a structured operational log string for CI/terminal logs.
 *
 * @param {object} entry
 * @returns {string}
 */
export function formatOperationalLog(entry) {
  const ts = entry.timestamp || new Date().toISOString();
  return (
    `[SOURCE-RUN] ${ts} source=${entry.sourceId} transport=${entry.transportStatus} ` +
    `http=${entry.httpStatus ?? "none"} parse=${entry.parseStatus} validation=${entry.validationStatus} ` +
    `freshness=${entry.freshnessStatus} duration=${entry.durationMs}ms reportingDate=${entry.reportingDate ?? "none"}`
  );
}

/**
 * Check failure thresholds on a list of consecutive run histories.
 * History is expected with the most recent runs at the end or at the start.
 * We inspect recent consecutive failures.
 *
 * @param {Array<object>} history
 * @param {object} [thresholds]
 * @returns {{ alert: boolean, level: "info"|"warning"|"critical", reasons: string[] }}
 */
export function checkFailureThresholds(
  history,
  thresholds = {
    consecutiveTransportFailures: 3,
    consecutiveParseFailures: 2,
    consecutiveBlockingFailures: 2,
  },
) {
  if (!history || history.length === 0) {
    return { alert: false, level: "info", reasons: [] };
  }

  // Count trailing consecutive failures
  let consecutiveTransport = 0;
  let consecutiveParse = 0;
  let consecutiveBlocking = 0;

  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];
    if (item.transportStatus === SourceStates.TRANSPORT.UNREACHABLE) {
      consecutiveTransport++;
    } else {
      break;
    }
  }

  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];
    if (
      item.transportStatus === SourceStates.TRANSPORT.REACHABLE &&
      item.parseStatus === SourceStates.PARSE.INVALID
    ) {
      consecutiveParse++;
    } else {
      break;
    }
  }

  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];
    if (
      item.transportStatus === SourceStates.TRANSPORT.REACHABLE &&
      item.validationStatus === SourceStates.VALIDATION.BLOCKING
    ) {
      consecutiveBlocking++;
    } else {
      break;
    }
  }

  const reasons = [];
  let level = "info";

  if (consecutiveParse >= (thresholds.consecutiveParseFailures ?? 2)) {
    reasons.push(
      `${consecutiveParse} consecutive parse failures detected (potential source schema/format drift)`,
    );
    level = "critical";
  }

  if (consecutiveBlocking >= (thresholds.consecutiveBlockingFailures ?? 2)) {
    reasons.push(
      `${consecutiveBlocking} consecutive validation failures detected (integrity breach)`,
    );
    level = "critical";
  }

  if (consecutiveTransport >= (thresholds.consecutiveTransportFailures ?? 3)) {
    reasons.push(
      `${consecutiveTransport} consecutive transport failures detected (endpoint unreachable)`,
    );
    if (level !== "critical") {
      level = "warning";
    }
  }

  return {
    alert: reasons.length > 0,
    level,
    reasons,
  };
}
