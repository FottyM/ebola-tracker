/**
 * @fileoverview Pure Client/Browser Manifest URL Resolvers.
 * Implements DATA-013 / DATA-007: Base-path aware resolution for static manifest
 * and content-addressed snapshot URLs with zero Node.js runtime dependencies.
 */

export const CURRENT_MANIFEST_SCHEMA_VERSION = "2026-09-11";

/**
 * Resolves a data URL relative to a configurable base path (e.g. '/' or '/ebola-tracker/').
 * Avoids duplicate slashes and handles relative base './'.
 * @param {string} relativePath
 * @param {string} [baseUrl]
 * @returns {string}
 */
export function resolveDataUrl(relativePath, baseUrl = "/") {
  const cleanRelative = relativePath.replace(/^\/+/, "");

  if (!baseUrl || baseUrl === "./" || baseUrl === ".") {
    return cleanRelative;
  }

  const cleanBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${cleanBase}${cleanRelative}`;
}

/**
 * Resolves the manifest URL given a base path.
 * @param {string} [baseUrl]
 * @returns {string}
 */
export function resolveManifestUrl(baseUrl = "/") {
  return resolveDataUrl("data/manifest.json", baseUrl);
}

/**
 * Resolves a snapshot URL given a snapshot path and base path.
 * @param {string} snapshotPathOrUrl
 * @param {string} [baseUrl]
 * @returns {string}
 */
export function resolveSnapshotUrl(snapshotPathOrUrl, baseUrl = "/") {
  if (snapshotPathOrUrl.startsWith("http://") || snapshotPathOrUrl.startsWith("https://")) {
    return snapshotPathOrUrl;
  }

  const stripped = snapshotPathOrUrl.replace(/^\/+/, "");
  if (stripped.startsWith("data/")) {
    return resolveDataUrl(stripped, baseUrl);
  }

  return resolveDataUrl(`data/${stripped}`, baseUrl);
}
