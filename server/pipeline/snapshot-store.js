/**
 * @fileoverview Atomic Snapshot Storage and Pipeline Orchestrator.
 * Implements DATA-006: Replacing mutable hardcoded state with atomic,
 * versioned, fail-closed snapshots and last-known-good stale retention.
 */

import fs from "node:fs";
import path from "node:path";
import { validateOutbreakSnapshot, createSnapshotFromObservations } from "./contracts.js";
import { determineSnapshotFreshness } from "./reconciliation.js";
import { generateManifest, writeManifestAtomically } from "./manifest.js";

/**
 * Saves a snapshot atomically to disk by writing to a temporary file
 * and performing an atomic filesystem rename to eliminate partial writes.
 * @param {import('./contracts.js').OutbreakSnapshot} snapshot
 * @param {string} storageDir
 * @returns {string} Target file path
 */
export function saveSnapshotAtomically(snapshot, storageDir) {
  const validation = validateOutbreakSnapshot(snapshot);
  if (!validation.valid) {
    throw new Error(`Cannot save invalid snapshot: ${validation.errors.join(", ")}`);
  }

  fs.mkdirSync(storageDir, { recursive: true });
  const targetPath = path.join(storageDir, "latest-snapshot.json");

  // Idempotency: avoid redundant disk write if content is unchanged
  if (fs.existsSync(targetPath)) {
    try {
      const existing = fs.readFileSync(targetPath, "utf-8");
      const existingObj = JSON.parse(existing);
      if (
        existingObj.snapshotId === snapshot.snapshotId &&
        existingObj.summary.totalCases === snapshot.summary.totalCases &&
        existingObj.summary.totalDeaths === snapshot.summary.totalDeaths
      ) {
        return targetPath;
      }
    } catch {
      // If corrupted, overwrite cleanly
    }
  }

  const tempPath = path.join(
    storageDir,
    `snapshot.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`,
  );
  const serialized = JSON.stringify(snapshot, null, 2);

  fs.writeFileSync(tempPath, serialized, "utf-8");
  fs.renameSync(tempPath, targetPath);

  // Also archive snapshot to versioned directory
  const archiveDir = path.join(storageDir, "snapshots");
  fs.mkdirSync(archiveDir, { recursive: true });
  const archivePath = path.join(archiveDir, `${snapshot.snapshotId}.json`);
  try {
    fs.writeFileSync(archivePath, serialized, "utf-8");
  } catch {
    // Non-blocking archive write
  }

  // Generate and atomically write manifest pointing to this validated snapshot
  try {
    const manifest = generateManifest(snapshot);
    writeManifestAtomically(manifest, storageDir);
  } catch {
    // Non-blocking manifest write
  }

  return targetPath;
}

/**
 * Loads the current latest validated snapshot from disk.
 * @param {string} storageDir
 * @returns {import('./contracts.js').OutbreakSnapshot | null}
 */
export function loadLatestSnapshot(storageDir) {
  const targetPath = path.join(storageDir, "latest-snapshot.json");
  if (!fs.existsSync(targetPath)) return null;

  try {
    const raw = fs.readFileSync(targetPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Orchestrates the pipeline ingestion run and publishes an atomic snapshot.
 * Fails closed on any blocking conflict, leaving last-known-good snapshot intact.
 * @param {{
 *   storageDir?: string,
 *   drcParsed?: any,
 *   hdxObservations?: any[],
 *   scheduledCadenceMinutes?: number,
 *   fetchedAt?: string,
 *   save?: boolean
 * }} params
 * @returns {{
 *   success: boolean,
 *   snapshot?: import('./contracts.js').OutbreakSnapshot,
 *   errors: string[]
 * }}
 */
export function executeSnapshotPipeline({
  storageDir = DEFAULT_STORAGE_DIR,
  drcParsed,
  hdxObservations = [],
  fetchedAt = new Date().toISOString(),
  scheduledCadenceMinutes = 30,
  save = true,
}) {
  const errors = [];

  // Fail closed if DRC authoritative source is missing or invalid
  if (!drcParsed || !drcParsed.valid) {
    errors.push("DRC Ministry situation report is missing, unparsable, or invalid.");
    return {
      success: false,
      errors,
    };
  }

  // Combine observations
  const observations = [];

  // National
  observations.push({
    id: `COD:National:${drcParsed.reportingDate}`,
    geographicPrecision: "country",
    country: { iso3: "COD", name: "Democratic Republic of the Congo" },
    province: null,
    healthZone: null,
    city: null,
    metrics: {
      confirmedCases: drcParsed.national.confirmedCases,
      confirmedDeaths: drcParsed.national.confirmedDeaths,
      newConfirmedCases: drcParsed.national.newConfirmedCases,
      recovered: drcParsed.national.recovered,
    },
    provenance: {
      sourceId: "drc-insp-sitrep",
      publisher: "Ministère de la Santé Publique / INSP",
      sourceUrl: "https://sante.gouv.cd/documents/sitreps",
      recordIdentifier: `SitRep-${drcParsed.reportNumber}-${drcParsed.reportingDate}`,
    },
    timestamps: {
      sourceUpdatedAt: drcParsed.reportingDate,
      publishedAt: `${drcParsed.reportingDate}T12:00:00.000Z`,
      fetchedAt,
    },
    classification: "affected",
  });

  // Provinces
  for (const p of drcParsed.provinces) {
    observations.push({
      id: `COD:${p.name}:${drcParsed.reportingDate}`,
      geographicPrecision: "province",
      country: { iso3: "COD", name: "Democratic Republic of the Congo" },
      province: { name: p.name },
      healthZone: null,
      city: null,
      metrics: {
        confirmedCases: p.cases,
        confirmedDeaths: p.deaths,
        newConfirmedCases: p.newCases,
      },
      provenance: {
        sourceId: "drc-insp-sitrep",
        publisher: "Ministère de la Santé Publique / INSP",
        sourceUrl: "https://sante.gouv.cd/documents/sitreps",
        recordIdentifier: `SitRep-${drcParsed.reportNumber}-${p.name}`,
      },
      timestamps: {
        sourceUpdatedAt: drcParsed.reportingDate,
        publishedAt: `${drcParsed.reportingDate}T12:00:00.000Z`,
        fetchedAt,
      },
      classification: "affected",
    });
  }

  // Health Zones
  for (const z of hdxObservations) {
    observations.push(z);
  }

  // Determine freshness
  const healthZoneDate = hdxObservations[0]?.timestamps?.sourceUpdatedAt || drcParsed.reportingDate;
  const freshness = determineSnapshotFreshness({
    nationalDate: drcParsed.reportingDate,
    provinceDate: drcParsed.reportingDate,
    healthZoneDate,
  });

  const snapshotId = `snapshot-${drcParsed.reportingDate}-${Date.now()}`;
  const snapshot = createSnapshotFromObservations({
    snapshotId,
    status: freshness.freshness,
    scheduledCadenceMinutes,
    observations,
  });

  if (save) {
    saveSnapshotAtomically(snapshot, storageDir);
  }

  return {
    success: true,
    snapshot,
    errors: [],
  };
}
