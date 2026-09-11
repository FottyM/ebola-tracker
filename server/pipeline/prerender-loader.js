/**
 * @fileoverview Shared Prerender and Snapshot Loader.
 * Implements DATA-007: Unifying static prerendering, local dev SSR,
 * and API responses to load from the same validated atomic snapshot.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLatestSnapshot } from "./snapshot-store.js";
import { mapSnapshotToLegacyState } from "./contracts.js";
import defaultOutbreakData from "../../src/data/outbreak-data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STORAGE_DIR = path.resolve(__dirname, "../../public/data");

/**
 * Loads the latest validated snapshot and maps it to the UI rendering contract.
 * Attaches snapshotId for parity between prerender and client hydration.
 * @param {string} [storageDir]
 * @returns {import('../etl.js').DynamicOutbreakState & { snapshotId?: string }}
 */
export function getPrerenderData(storageDir = DEFAULT_STORAGE_DIR) {
  const snapshot = loadLatestSnapshot(storageDir);
  if (snapshot) {
    const legacy = mapSnapshotToLegacyState(snapshot);
    legacy.snapshotId = snapshot.snapshotId;
    return legacy;
  }
  return structuredClone(defaultOutbreakData);
}
