/**
 * @fileoverview Client-Side DOM and State Dynamic Updater.
 * Implements DATA-007 / DATA-013: Applying new validated snapshot data to the DOM
 * (headline metrics, badges, and cached state) without triggering a full page reload.
 */

import { mapSnapshotToLegacyState } from "../../server/pipeline/contracts.js";

/**
 * Applies an updated snapshot to the DOM and global state without a full page reload.
 * @param {any} snapshot
 * @param {any} [documentRef]
 * @param {any} [windowRef]
 */
export function applyUpdatedSnapshot(
  snapshot,
  documentRef = typeof document !== "undefined" ? document : null,
  windowRef = typeof window !== "undefined" ? window : null,
) {
  if (!snapshot || !snapshot.summary) return;

  const legacy = mapSnapshotToLegacyState(snapshot);
  legacy.snapshotId = snapshot.snapshotId;

  if (documentRef) {
    const casesEl = documentRef.querySelector(".stat-card.cases .value");
    if (casesEl) casesEl.textContent = snapshot.summary.totalCases.toLocaleString();

    const deathsEl = documentRef.querySelector(".stat-card.deaths .value");
    if (deathsEl) deathsEl.textContent = snapshot.summary.totalDeaths.toLocaleString();

    const cfrSubEl = documentRef.querySelector(".stat-card.deaths .sub");
    if (cfrSubEl) cfrSubEl.textContent = `${snapshot.summary.overallCfr} case fatality`;

    const nationsEl = documentRef.querySelector(".stat-card.cfr .value");
    if (nationsEl) nationsEl.textContent = String(snapshot.summary.affectedCountriesCount);

    const badgeEl = documentRef.querySelector(".pheic-badge");
    if (badgeEl) {
      badgeEl.textContent = `Active Surveillance — ${snapshot.summary.affectedCountriesCount} Countries Affected`;
    }
  }

  if (windowRef) {
    /** @type {any} */ (windowRef).__INITIAL_DATA__ = legacy;
  }
}
