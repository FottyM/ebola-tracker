import { describe, it, expect, beforeEach, afterEach } from "vite-plus/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  saveSnapshotAtomically,
  loadLatestSnapshot,
  executeSnapshotPipeline,
} from "../server/pipeline/snapshot-store.js";
import { createSnapshotFromObservations } from "../server/pipeline/contracts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.resolve(__dirname, "../tmp-test-snapshots");

describe("DATA-006: Atomic Snapshot Store & State Replacement", () => {
  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe("Atomic Storage & Corruption Prevention", () => {
    it("writes snapshot atomically and loads cleanly", () => {
      const snapshot = createSnapshotFromObservations({
        snapshotId: "snap-001",
        status: "current",
        scheduledCadenceMinutes: 30,
        observations: [
          {
            id: "COD:Ituri:Bunia:2026-09-08",
            geographicPrecision: "health-zone",
            country: { iso3: "COD", name: "Democratic Republic of the Congo" },
            province: { name: "Ituri", pcode: "CD54" },
            healthZone: { name: "Bunia", pcode: "CD540201", dhis2Id: "GPi6i83o7l6" },
            city: null,
            metrics: { confirmedCases: 1420, confirmedDeaths: 612 },
            provenance: {
              sourceId: "hdx-consolidated",
              publisher: "HDX",
              sourceUrl: "https://data.humdata.org",
            },
            timestamps: {
              sourceUpdatedAt: "2026-09-08",
              publishedAt: "2026-09-09T00:00:00Z",
              fetchedAt: "2026-09-11T12:00:00Z",
            },
            classification: "affected",
          },
        ],
      });

      const savedPath = saveSnapshotAtomically(snapshot, testDir);
      expect(fs.existsSync(savedPath)).toBe(true);

      const loaded = loadLatestSnapshot(testDir);
      expect(loaded).toBeDefined();
      expect(loaded.snapshotId).toBe("snap-001");
      expect(loaded.summary.totalCases).toBe(1420);
    });

    it("prevents partial writes by writing to a temporary file before atomic rename", () => {
      const snapshot = createSnapshotFromObservations({
        snapshotId: "snap-002",
        status: "current",
        scheduledCadenceMinutes: 30,
        observations: [],
      });

      saveSnapshotAtomically(snapshot, testDir);

      // Verify no dangling .tmp files remain
      const files = fs.readdirSync(testDir);
      expect(files.some((f) => f.endsWith(".tmp"))).toBe(false);
      expect(files.includes("latest-snapshot.json")).toBe(true);
    });
  });

  describe("Fail-Closed & Stale Preservation", () => {
    it("preserves last-known-good snapshot when pipeline encounters blocking error", () => {
      // 1. Establish good snapshot
      const goodSnapshot = createSnapshotFromObservations({
        snapshotId: "snap-good",
        status: "current",
        scheduledCadenceMinutes: 30,
        observations: [
          {
            id: "COD:Ituri:Bunia:2026-09-08",
            geographicPrecision: "health-zone",
            country: { iso3: "COD", name: "Democratic Republic of the Congo" },
            province: { name: "Ituri", pcode: "CD54" },
            healthZone: { name: "Bunia", pcode: "CD540201" },
            city: null,
            metrics: { confirmedCases: 5000, confirmedDeaths: 2000 },
            provenance: {
              sourceId: "hdx",
              publisher: "HDX",
              sourceUrl: "https://data.humdata.org",
            },
            timestamps: {
              sourceUpdatedAt: "2026-09-08",
              publishedAt: "2026-09-09T00:00:00Z",
              fetchedAt: "2026-09-11T12:00:00Z",
            },
            classification: "affected",
          },
        ],
      });
      saveSnapshotAtomically(goodSnapshot, testDir);

      // 2. Run pipeline with invalid/blocking input
      const runResult = executeSnapshotPipeline({
        storageDir: testDir,
        drcParsed: null, // Simulated upstream failure!
        hdxObservations: [],
      });

      expect(runResult.success).toBe(false);

      // 3. Verify last-known-good is untouched
      const current = loadLatestSnapshot(testDir);
      expect(current.snapshotId).toBe("snap-good");
      expect(current.summary.totalCases).toBe(5000);
    });

    it("identifies unchanged state and avoids redundant writes", () => {
      const snapshot = createSnapshotFromObservations({
        snapshotId: "snap-static",
        status: "current",
        scheduledCadenceMinutes: 30,
        observations: [],
      });

      const path1 = saveSnapshotAtomically(snapshot, testDir);

      // Try saving identical snapshot again
      const result = saveSnapshotAtomically(snapshot, testDir);
      expect(result).toBe(path1);
    });
  });
});
