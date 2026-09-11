/**
 * @fileoverview Browser Polling and Visibility-Refresh Controller.
 * Implements DATA-013: Safe client polling of mutable manifest.json,
 * downloading content-addressed snapshots only when changed,
 * immediate check on tab visibility restoration, and fail-closed state preservation.
 */

import {
  CURRENT_MANIFEST_SCHEMA_VERSION,
  resolveManifestUrl,
  resolveSnapshotUrl,
} from "./manifest-urls.js";

/**
 * Creates a static data refresh controller for GitHub Pages and browser environments.
 * @param {Object} options
 * @param {string} [options.baseUrl]
 * @param {string} [options.currentSnapshotId]
 * @param {(snapshot: any, manifest: any) => void} [options.onUpdate]
 * @param {(error: any) => void} [options.onError]
 * @param {number} [options.pollIntervalMs] - Defaults to 30 minutes (1,800,000 ms)
 * @param {typeof fetch} [options.fetchFn]
 * @param {Document} [options.documentRef]
 * @returns {{
 *   checkForUpdates: () => Promise<{ updated: boolean, reason?: string, snapshot?: any, manifest?: any, error?: any }>,
 *   getCurrentSnapshotId: () => string,
 *   destroy: () => void
 * }}
 */
export function createStaticRefreshController({
  baseUrl = typeof import.meta !== "undefined" && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL
    : "/",
  currentSnapshotId = "",
  onUpdate = () => {},
  onError = () => {},
  pollIntervalMs = 30 * 60 * 1000,
  fetchFn = globalThis.fetch,
  documentRef = typeof document !== "undefined" ? document : null,
} = {}) {
  let activeSnapshotId = currentSnapshotId;
  let intervalId = null;
  let destroyed = false;

  /**
   * Fetches the small mutable manifest with cache-busting query parameter.
   * Only downloads full snapshot if the snapshotId has changed.
   */
  async function checkForUpdates() {
    if (destroyed) return { updated: false, reason: "destroyed" };

    const manifestUrl = `${resolveManifestUrl(baseUrl)}?t=${Date.now()}`;
    let manifest;

    try {
      const res = await fetchFn(manifestUrl, { cache: "no-cache" });
      if (!res.ok) {
        throw new Error(`Failed to fetch manifest: HTTP ${res.status}`);
      }
      manifest = await res.json();
    } catch (err) {
      onError(err);
      return { updated: false, reason: "fetch_failed", error: err };
    }

    // Schema version gate
    if (manifest?.schemaVersion !== CURRENT_MANIFEST_SCHEMA_VERSION) {
      const err = new Error(
        `Incompatible manifest schema version: ${manifest?.schemaVersion}. Expected: ${CURRENT_MANIFEST_SCHEMA_VERSION}`,
      );
      onError(err);
      return { updated: false, reason: "incompatible_schema", error: err };
    }

    if (!manifest?.snapshotId) {
      const err = new Error("Manifest is missing required snapshotId");
      onError(err);
      return { updated: false, reason: "invalid_manifest", error: err };
    }

    // Unchanged gate: skip download if already active
    if (manifest.snapshotId === activeSnapshotId) {
      return { updated: false, reason: "unchanged", snapshotId: activeSnapshotId };
    }

    // Download immutable snapshot
    const snapshotUrl = resolveSnapshotUrl(manifest.snapshotPath || manifest.snapshotUrl, baseUrl);
    let snapshot;

    try {
      const res = await fetchFn(snapshotUrl, { cache: "force-cache" });
      if (!res.ok) {
        throw new Error(`Failed to fetch snapshot from ${snapshotUrl}: HTTP ${res.status}`);
      }
      snapshot = await res.json();
    } catch (err) {
      onError(err);
      return { updated: false, reason: "snapshot_fetch_failed", error: err };
    }

    // Validation gate: snapshot must contain required structure
    if (!snapshot || !snapshot.snapshotId || !snapshot.summary) {
      const err = new Error("Downloaded snapshot is corrupt or missing required fields");
      onError(err);
      return { updated: false, reason: "invalid_snapshot", error: err };
    }

    activeSnapshotId = manifest.snapshotId;
    onUpdate(snapshot, manifest);

    return { updated: true, snapshot, manifest };
  }

  // Set up periodic polling
  if (pollIntervalMs > 0 && typeof setInterval !== "undefined") {
    intervalId = setInterval(() => {
      checkForUpdates().catch((err) => onError(err));
    }, pollIntervalMs);
  }

  // Set up visibilitychange listener
  const handleVisibilityChange = () => {
    if (documentRef && documentRef.visibilityState === "visible") {
      checkForUpdates().catch((err) => onError(err));
    }
  };

  if (documentRef && typeof documentRef.addEventListener === "function") {
    documentRef.addEventListener("visibilitychange", handleVisibilityChange);
  }

  return {
    checkForUpdates,
    getCurrentSnapshotId: () => activeSnapshotId,
    destroy: () => {
      destroyed = true;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (documentRef && typeof documentRef.removeEventListener === "function") {
        documentRef.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    },
  };
}
