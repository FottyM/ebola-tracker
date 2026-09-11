/**
 * @fileoverview Snapshot Retention, Rollback, and Gating Engine.
 * Implements DATA-014: Retaining content-addressed immutable snapshots,
 * safe atomic rollback to previous validated snapshots, and minimum retention
 * protection ensuring the last-known-good deployment is never lost.
 */

import fs from "node:fs";
import path from "node:path";
import { saveSnapshotAtomically, loadLatestSnapshot } from "./snapshot-store.js";
import { validateOutbreakSnapshot } from "./contracts.js";
import { generateManifest } from "./manifest.js";

/**
 * Lists all available historical snapshots in the archive directory.
 * @param {string} storageDir
 * @returns {Array<{
 *   snapshotId: string,
 *   filePath: string,
 *   sourceUpdatedAt: string,
 *   totalCases: number,
 *   totalDeaths: number,
 *   valid: boolean
 * }>}
 */
export function listAvailableSnapshots(storageDir) {
  const archiveDir = path.join(storageDir, "snapshots");
  if (!fs.existsSync(archiveDir)) return [];

  const files = fs.readdirSync(archiveDir).filter((f) => f.endsWith(".json"));
  const snapshots = [];

  for (const f of files) {
    const fullPath = path.join(archiveDir, f);
    try {
      const raw = fs.readFileSync(fullPath, "utf-8");
      const obj = JSON.parse(raw);
      const validation = validateOutbreakSnapshot(obj);

      snapshots.push({
        snapshotId: obj.snapshotId,
        filePath: fullPath,
        sourceUpdatedAt: obj.freshness?.sourceUpdatedAt || obj.summary?.lastReportDate || "",
        totalCases: obj.summary?.totalCases ?? 0,
        totalDeaths: obj.summary?.totalDeaths ?? 0,
        valid: validation.valid,
        mtime: fs.statSync(fullPath).mtimeMs,
      });
    } catch {
      // Ignore unparseable or corrupted archive files
    }
  }

  // Sort descending by file modification time / date
  return snapshots.sort((a, b) => b.mtime - a.mtime);
}

/**
 * Rolls back the active deployment atomically to a prior validated snapshot.
 * Replaces both latest-snapshot.json and manifest.json synchronously.
 * @param {string} targetSnapshotId
 * @param {string} storageDir
 * @returns {{
 *   success: boolean,
 *   snapshot?: import('./contracts.js').OutbreakSnapshot,
 *   manifest?: any,
 *   error?: string
 * }}
 */
export function rollbackToSnapshot(targetSnapshotId, storageDir) {
  const archivePath = path.join(storageDir, "snapshots", `${targetSnapshotId}.json`);
  if (!fs.existsSync(archivePath)) {
    return {
      success: false,
      error: `Target snapshot not found: ${targetSnapshotId}`,
    };
  }

  let snapshot;
  try {
    const raw = fs.readFileSync(archivePath, "utf-8");
    snapshot = JSON.parse(raw);
  } catch (err) {
    return {
      success: false,
      error: `Failed to read target snapshot: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const validation = validateOutbreakSnapshot(snapshot);
  if (!validation.valid) {
    return {
      success: false,
      error: `Target snapshot failed validation: ${validation.errors.join(", ")}`,
    };
  }

  // Atomically persist snapshot & manifest
  try {
    saveSnapshotAtomically(snapshot, storageDir);
    const manifest = generateManifest(snapshot);
    return {
      success: true,
      snapshot,
      manifest,
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to persist rolled-back snapshot: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Prunes historical snapshots based on retention rules.
 * Strictly guarantees that:
 * 1. The currently active snapshot can NEVER be pruned.
 * 2. At least keepMinCount snapshots are preserved.
 * @param {Object} options
 * @param {string} options.storageDir
 * @param {number} [options.keepMinCount] - Minimum count of snapshots to retain (default: 10)
 * @param {number} [options.maxAgeDays] - Max age in days before pruning eligible snapshots (default: 30)
 * @returns {{ deleted: string[], retained: string[] }}
 */
export function pruneSnapshots({ storageDir, keepMinCount = 10, maxAgeDays = 30 }) {
  const archiveDir = path.join(storageDir, "snapshots");
  if (!fs.existsSync(archiveDir)) {
    return { deleted: [], retained: [] };
  }

  const currentSnapshot = loadLatestSnapshot(storageDir);
  const activeSnapshotId = currentSnapshot?.snapshotId || "";

  const files = fs.readdirSync(archiveDir).filter((f) => f.endsWith(".json"));
  const snapshotEntries = files.map((f) => {
    const fullPath = path.join(archiveDir, f);
    return {
      name: f,
      snapshotId: f.replace(/\.json$/, ""),
      fullPath,
      mtime: fs.statSync(fullPath).mtimeMs,
    };
  });

  // Sort descending (newest first)
  snapshotEntries.sort((a, b) => b.mtime - a.mtime);

  const deleted = [];
  const retained = [];
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  for (let i = 0; i < snapshotEntries.length; i++) {
    const entry = snapshotEntries[i];
    const isProtected = entry.snapshotId === activeSnapshotId || i < keepMinCount;

    if (isProtected) {
      retained.push(entry.snapshotId);
    } else if (now - entry.mtime > maxAgeMs || i >= keepMinCount) {
      try {
        fs.unlinkSync(entry.fullPath);
        deleted.push(entry.snapshotId);
      } catch {
        retained.push(entry.snapshotId);
      }
    } else {
      retained.push(entry.snapshotId);
    }
  }

  return { deleted, retained };
}
