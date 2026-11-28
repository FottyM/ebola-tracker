import { fetchWhoCountryObservations } from "./adapters/international-adapters.js";
import fs from "node:fs";
import { loadLatestSnapshot, saveSnapshotAtomically } from "./snapshot-store.js";
import {
  mapSnapshotToLegacyState,
  validateOutbreakSnapshot,
  createSnapshotFromObservations,
} from "./contracts.js";
import { hasEpidemiologicalContentChanged, runIngestionPipeline } from "./pipeline-ingest.js";

function validCache(snapshot) {
  if (!validateOutbreakSnapshot(snapshot).valid) return false;
  if (
    !snapshot.observations.some(
      (o) => o.country.iso3 === "COD" && o.geographicPrecision === "country",
    )
  )
    return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.summary.lastReportDate)) return false;
  const summary = createSnapshotFromObservations({
    snapshotId: snapshot.snapshotId,
    observations: snapshot.observations,
  }).summary;
  return Object.keys(summary).every((key) => summary[key] === snapshot.summary[key]);
}

function writeLegacy(snapshot, targetFile) {
  const legacy = { ...mapSnapshotToLegacyState(snapshot), snapshotId: snapshot.snapshotId };
  fs.writeFileSync(
    targetFile,
    `/** @type {import('../../server/etl.js').DynamicOutbreakState} */\nexport const defaultOutbreakData = ${JSON.stringify(legacy, null, 2)};\n\nexport default defaultOutbreakData;\n`,
    "utf8",
  );
}

/** Preserve validated observations on source failure; allow WHO partial updates when Ministry is unavailable. */
export async function runOutbreakSync({
  storageDir,
  targetFile,
  fetchMinistry,
  fetchInternational = fetchWhoCountryObservations,
  fetchHdx = async () => [],
  fetchCurve = async () => [],
  dryRun = false,
}) {
  const existing = loadLatestSnapshot(storageDir);
  const previousDrcRow = existing?.observations?.find(
    (row) => row.country.iso3 === "COD" && row.geographicPrecision === "country",
  );
  const previousDrcDate = previousDrcRow?.timestamps.sourceUpdatedAt;

  let drcParsed;
  let ministryError;
  try {
    drcParsed = await fetchMinistry();
    if (!drcParsed?.valid)
      throw new Error(drcParsed?.errors?.join("; ") || "Invalid Ministry report");
    if (previousDrcDate && drcParsed.reportingDate < previousDrcDate)
      throw new Error("Ministry report is older than retained snapshot");
  } catch (error) {
    ministryError = error instanceof Error ? error.message : String(error);
  }

  let countryRows;
  let internationalObservations;
  let whoError;
  try {
    countryRows = await fetchInternational();
    if (!Array.isArray(countryRows)) throw new Error("WHO country observations missing");
    internationalObservations = countryRows.filter((row) => row.country.iso3 !== "COD");
    for (const previous of existing?.observations || []) {
      if (previous.country.iso3 === "COD" || previous.classification !== "affected") continue;
      const next = internationalObservations.find(
        (row) => row.country.iso3 === previous.country.iso3,
      );
      if (!next)
        throw new Error(`WHO table dropped previously reported country ${previous.country.iso3}`);
      if (
        previous.geographicPrecision === "country" &&
        next.timestamps.sourceUpdatedAt < previous.timestamps.sourceUpdatedAt
      )
        throw new Error(`WHO reporting date regressed for ${previous.country.iso3}`);
    }
  } catch (error) {
    whoError = error instanceof Error ? error.message : String(error);
  }

  // Partial live update: DRC Ministry failed/gated, but live WHO observations are available.
  if (ministryError && !whoError && countryRows?.length > 0 && validCache(existing)) {
    const whoCodRow = countryRows.find(
      (row) => row.country.iso3 === "COD" && row.geographicPrecision === "country",
    );
    const useWhoCodNational =
      Boolean(whoCodRow) &&
      (!previousDrcDate || whoCodRow.timestamps.sourceUpdatedAt > previousDrcDate);
    const existingCodObservations = existing.observations.filter(
      (row) =>
        row.country.iso3 === "COD" && !(useWhoCodNational && row.geographicPrecision === "country"),
    );
    const mergedObservations = [
      ...(useWhoCodNational ? [whoCodRow] : []),
      ...existingCodObservations,
      ...internationalObservations,
    ];
    let liveCurve = [];
    try {
      const fetchedCurve = await fetchCurve();
      if (Array.isArray(fetchedCurve) && fetchedCurve.length > 0) liveCurve = fetchedCurve;
    } catch {
      // Retain existing curve if weekly bulletin fetch fails during partial update.
    }
    const epiCurve = liveCurve.length > 0 ? liveCurve : existing.epiCurve || [];
    const baseSnapshot = createSnapshotFromObservations({
      snapshotId: `snapshot-${whoCodRow?.timestamps.sourceUpdatedAt || previousDrcDate}-${Date.now()}-partial`,
      status: "partial",
      scheduledCadenceMinutes: existing.scheduledCadenceMinutes || 240,
      observations: mergedObservations,
      epiCurve,
    });
    const existingMinistryHealth = (existing.sourceHealth || []).find(
      (source) => source.sourceId === "drc-insp-sitrep",
    );
    const candidateSnapshot = {
      ...baseSnapshot,
      sourceHealth: baseSnapshot.sourceHealth.map((source) =>
        source.sourceId === "drc-insp-sitrep"
          ? {
              ...source,
              status: "Stale (last-known-good)",
              lastSuccessAt: existingMinistryHealth?.lastSuccessAt || source.lastSuccessAt,
            }
          : source,
      ),
    };
    const changed = hasEpidemiologicalContentChanged(existing, candidateSnapshot);
    const activeSnapshot = changed ? candidateSnapshot : existing;
    if (!dryRun) {
      if (changed) saveSnapshotAtomically(candidateSnapshot, storageDir);
      writeLegacy(activeSnapshot, targetFile);
    }
    return {
      success: true,
      changed,
      dryRun,
      sourceMode: "partial",
      sourceError: ministryError,
      candidateSnapshot,
      snapshot: activeSnapshot,
      snapshotId: activeSnapshot.snapshotId,
    };
  }

  const sourceError = ministryError || whoError;
  if (sourceError) {
    if (!validCache(existing))
      throw new Error(`No validated last-known-good snapshot available; ${sourceError}`);
    const candidateSnapshot = {
      ...existing,
      snapshotId:
        existing.status === "stale" ? existing.snapshotId : `${existing.snapshotId}-stale`,
      status: "stale",
      sourceHealth: (existing.sourceHealth || []).map((source) => ({
        ...source,
        status: "Stale (last-known-good)",
      })),
    };
    const changed = JSON.stringify(existing) !== JSON.stringify(candidateSnapshot);
    if (!dryRun) {
      if (changed) saveSnapshotAtomically(candidateSnapshot, storageDir);
      writeLegacy(candidateSnapshot, targetFile);
    }
    return {
      success: true,
      changed,
      dryRun,
      sourceMode: "cache",
      sourceError,
      candidateSnapshot,
      snapshot: candidateSnapshot,
      snapshotId: candidateSnapshot.snapshotId,
    };
  }
  const hdxObservations = drcParsed.healthZones?.length ? [] : await fetchHdx();
  const epiCurve = await fetchCurve();
  const result = await runIngestionPipeline({
    storageDir,
    drcParsed,
    hdxObservations,
    internationalObservations,
    epiCurve,
    dryRun,
  });
  if (!result.success) throw new Error(result.error || "Ingestion validation failed");
  if (!dryRun) writeLegacy(result.snapshot, targetFile);
  return { ...result, sourceMode: "live" };
}
