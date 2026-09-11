import { describe, it, expect, beforeEach, afterEach } from "vite-plus/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  listAvailableSnapshots,
  rollbackToSnapshot,
  pruneSnapshots,
} from "../server/pipeline/rollback-retention.js";
import { saveSnapshotAtomically, loadLatestSnapshot } from "../server/pipeline/snapshot-store.js";
import { createSnapshotFromObservations } from "../server/pipeline/contracts.js";

describe("DATA-014: Snapshot Retention, Rollback, and Gating", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ebola-rollback-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function makeSnapshot(id, cases, deaths, date = "2026-09-08") {
    return createSnapshotFromObservations({
      snapshotId: id,
      status: "current",
      scheduledCadenceMinutes: 30,
      observations: [
        {
          id: `COD:National:${date}`,
          geographicPrecision: "country",
          country: { iso3: "COD", name: "Democratic Republic of the Congo" },
          province: null,
          healthZone: null,
          city: null,
          metrics: { confirmedCases: cases, confirmedDeaths: deaths },
          provenance: {
            sourceId: "drc-insp-sitrep",
            publisher: "INSP",
            sourceUrl: "https://sante.gouv.cd",
          },
          timestamps: {
            sourceUpdatedAt: date,
            publishedAt: `${date}T12:00:00Z`,
            fetchedAt: `${date}T14:00:00Z`,
          },
          classification: "affected",
        },
      ],
    });
  }

  describe("Snapshot History Listing", () => {
    it("lists all valid archived snapshots with summary and provenance intact", () => {
      const snap1 = makeSnapshot("snap-001", 6000, 3000, "2026-09-01");
      const snap2 = makeSnapshot("snap-002", 6500, 3200, "2026-09-05");

      saveSnapshotAtomically(snap1, tempDir);
      saveSnapshotAtomically(snap2, tempDir);

      const available = listAvailableSnapshots(tempDir);
      expect(available.length).toBe(2);
      expect(available.map((s) => s.snapshotId)).toContain("snap-001");
      expect(available.map((s) => s.snapshotId)).toContain("snap-002");
    });
  });

  describe("Atomic Rollback Flow", () => {
    it("rolls back atomically to a prior immutable snapshot and updates manifest pointer", () => {
      const snap1 = makeSnapshot("snap-good", 6800, 3300, "2026-09-07");
      const snap2 = makeSnapshot("snap-latest", 6942, 3349, "2026-09-09");

      saveSnapshotAtomically(snap1, tempDir);
      saveSnapshotAtomically(snap2, tempDir);

      // Verify currently active is snap-latest
      expect(loadLatestSnapshot(tempDir).snapshotId).toBe("snap-latest");

      // Execute rollback to snap-good
      const result = rollbackToSnapshot("snap-good", tempDir);
      expect(result.success).toBe(true);
      expect(result.snapshot.snapshotId).toBe("snap-good");

      // Verify active snapshot is now snap-good
      const current = loadLatestSnapshot(tempDir);
      expect(current.snapshotId).toBe("snap-good");
      expect(current.summary.totalCases).toBe(6800);

      // Verify manifest was updated atomically and points to snap-good
      const manifestPath = path.join(tempDir, "manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.snapshotId).toBe("snap-good");
      expect(manifest.snapshotPath).toBe("snapshots/snap-good.json");
      expect(manifest.summary.totalCases).toBe(6800);
    });

    it("fails safely and keeps existing snapshot when rollback target does not exist", () => {
      const snap1 = makeSnapshot("snap-active", 6942, 3349);
      saveSnapshotAtomically(snap1, tempDir);

      const result = rollbackToSnapshot("non-existent-snapshot", tempDir);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Target snapshot not found");

      // Active snapshot remains untouched
      expect(loadLatestSnapshot(tempDir).snapshotId).toBe("snap-active");
    });
  });

  describe("Minimum Retention and Pruning Protection", () => {
    it("protects the active snapshot from ever being pruned", () => {
      const snap1 = makeSnapshot("snap-sole", 6942, 3349);
      saveSnapshotAtomically(snap1, tempDir);

      const pruneResult = pruneSnapshots({ storageDir: tempDir, keepMinCount: 0 });
      expect(pruneResult.deleted).toHaveLength(0);
      expect(pruneResult.retained).toContain("snap-sole");

      // Verify still exists
      expect(loadLatestSnapshot(tempDir).snapshotId).toBe("snap-sole");
    });

    it("honors keepMinCount threshold and retains required recent history", () => {
      for (let i = 1; i <= 6; i++) {
        const snap = makeSnapshot(`snap-history-${i}`, 6000 + i * 10, 3000 + i * 5);
        saveSnapshotAtomically(snap, tempDir);
      }

      // We have 6 snapshots. Keep minimum 4.
      const pruneResult = pruneSnapshots({ storageDir: tempDir, keepMinCount: 4 });
      expect(pruneResult.retained.length).toBeGreaterThanOrEqual(4);
      expect(pruneResult.deleted.length).toBeLessThanOrEqual(2);
      expect(pruneResult.retained).toContain("snap-history-6"); // active
    });
  });

  describe("Deployment Gating Verification", () => {
    it("verifies CI deploy workflow gates Pages deployment on test execution", () => {
      const workflowPath = path.resolve(__dirname, "../.github/workflows/deploy.yml");
      const content = fs.readFileSync(workflowPath, "utf-8");

      expect(content).toContain("vp test");
    });
  });
});
