import fs from "node:fs";
import { loadLatestSnapshot, saveSnapshotAtomically } from "./snapshot-store.js";
import {
  mapSnapshotToLegacyState,
  validateOutbreakSnapshot,
  createSnapshotFromObservations,
} from "./contracts.js";
import { runIngestionPipeline } from "./pipeline-ingest.js";

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

/** Preserve validated observations on source failure; never re-ingest cached data as live. */
export async function runOutbreakSync({
  storageDir,
  targetFile,
  fetchMinistry,
  fetchHdx = async () => [],
  fetchCurve = async () => [],
  dryRun = false,
}) {
  const existing = loadLatestSnapshot(storageDir);
  let drcParsed;
  let sourceError;
  try {
    drcParsed = await fetchMinistry();
    if (!drcParsed?.valid)
      throw new Error(drcParsed?.errors?.join("; ") || "Invalid Ministry report");
    if (validCache(existing) && drcParsed.reportingDate < existing.summary.lastReportDate)
      throw new Error("Ministry report is older than retained snapshot");
  } catch (error) {
    sourceError = error instanceof Error ? error.message : String(error);
  }
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
    epiCurve,
    dryRun,
  });
  if (!result.success) throw new Error(result.error || "Ingestion validation failed");
  if (!dryRun) writeLegacy(result.snapshot, targetFile);
  return { ...result, sourceMode: "live" };
}
