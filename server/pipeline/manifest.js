/**
 * @fileoverview Manifest Schema, Generator, and Static Delivery Protocol.
 * Implements DATA-013: Generating content-addressed immutable snapshots,
 * small mutable manifest.json, and base-path-aware URL resolution for
 * GitHub Pages and local development.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { validateOutbreakSnapshot } from "./contracts.js";
import { CURRENT_MANIFEST_SCHEMA_VERSION } from "../../src/pipeline/manifest-urls.js";

/**
 * @typedef {Object} ManifestSummary
 * @property {number} totalCases
 * @property {number} totalDeaths
 * @property {number} affectedCountriesCount
 */

/**
 * @typedef {Object} OutbreakManifest
 * @property {string} schemaVersion
 * @property {string} snapshotId
 * @property {string} snapshotPath
 * @property {string} snapshotUrl
 * @property {string} contentHash
 * @property {string} sourceUpdatedAt
 * @property {string} snapshotPublishedAt
 * @property {number} scheduledCadenceMinutes
 * @property {'current' | 'partial' | 'stale'} status
 * @property {ManifestSummary} summary
 */

/**
 * Generates SHA-256 hash of a serialized string.
 * @param {string} content
 * @returns {string}
 */
export function computeSha256(content) {
  return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
}

/**
 * Generates an immutable, content-addressed manifest from a validated snapshot.
 * @param {import('./contracts.js').OutbreakSnapshot} snapshot
 * @returns {OutbreakManifest}
 */
export function generateManifest(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Invalid snapshot: snapshot must be an object");
  }

  const validation = validateOutbreakSnapshot(snapshot);
  if (!validation.valid) {
    throw new Error(`Invalid snapshot for manifest generation: ${validation.errors.join(", ")}`);
  }

  const serialized = JSON.stringify(snapshot);
  const contentHash = computeSha256(serialized);

  const snapshotFilename = `${snapshot.snapshotId}.json`;
  const snapshotPath = `snapshots/${snapshotFilename}`;
  const snapshotUrl = `data/${snapshotPath}`;

  // Find authoritative reporting date
  const sourceUpdatedAt =
    snapshot.freshness?.sourceUpdatedAt ||
    snapshot.observations?.[0]?.timestamps?.sourceUpdatedAt ||
    new Date().toISOString().slice(0, 10);

  const snapshotPublishedAt =
    snapshot.cadence?.publishedAt ||
    snapshot.observations?.[0]?.timestamps?.publishedAt ||
    new Date().toISOString();

  const manifest = {
    schemaVersion: CURRENT_MANIFEST_SCHEMA_VERSION,
    snapshotId: snapshot.snapshotId,
    snapshotPath,
    snapshotUrl,
    contentHash,
    sourceUpdatedAt,
    snapshotPublishedAt,
    scheduledCadenceMinutes: snapshot.cadence?.scheduledCadenceMinutes || 30,
    status: snapshot.status || "current",
    summary: {
      totalCases: snapshot.summary?.totalCases ?? 0,
      totalDeaths: snapshot.summary?.totalDeaths ?? 0,
      affectedCountriesCount: snapshot.summary?.affectedCountriesCount ?? 1,
    },
  };

  return manifest;
}

/**
 * Validates manifest structure and schema compatibility.
 * @param {any} manifest
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateManifest(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== "object") {
    return { valid: false, errors: ["Manifest must be a non-null object"] };
  }

  if (manifest.schemaVersion !== CURRENT_MANIFEST_SCHEMA_VERSION) {
    errors.push(
      `Incompatible manifest schema: expected ${CURRENT_MANIFEST_SCHEMA_VERSION}, received ${manifest.schemaVersion}`,
    );
  }

  if (typeof manifest.snapshotId !== "string" || !manifest.snapshotId.trim()) {
    errors.push("Missing or invalid snapshotId");
  }

  if (typeof manifest.snapshotPath !== "string" || !manifest.snapshotPath.trim()) {
    errors.push("Missing or invalid snapshotPath");
  }

  if (!["current", "partial", "stale"].includes(manifest.status)) {
    errors.push(`Invalid manifest status: ${manifest.status}`);
  }

  if (
    !manifest.summary ||
    typeof manifest.summary.totalCases !== "number" ||
    typeof manifest.summary.totalDeaths !== "number"
  ) {
    errors.push("Missing or invalid manifest summary statistics");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Writes the manifest to disk atomically via temporary file and rename.
 * @param {OutbreakManifest} manifest
 * @param {string} storageDir
 * @returns {string} Path to written manifest
 */
export function writeManifestAtomically(manifest, storageDir) {
  const validation = validateManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Cannot write invalid manifest: ${validation.errors.join(", ")}`);
  }

  fs.mkdirSync(storageDir, { recursive: true });
  const targetPath = path.join(storageDir, "manifest.json");
  const tempPath = path.join(
    storageDir,
    `manifest.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`,
  );

  const serialized = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(tempPath, serialized, "utf-8");
  fs.renameSync(tempPath, targetPath);

  return targetPath;
}

export {
  CURRENT_MANIFEST_SCHEMA_VERSION,
  resolveDataUrl,
  resolveManifestUrl,
  resolveSnapshotUrl,
} from "../../src/pipeline/manifest-urls.js";
