import { describe, it, expect } from "vite-plus/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  hasEpidemiologicalContentChanged,
  runIngestionPipeline,
} from "../server/pipeline/pipeline-ingest.js";
import { createSnapshotFromObservations } from "../server/pipeline/contracts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("DATA-009: Schedule safe 30-minute ingestion & Concurrency", () => {
  describe("Content-Based Change Detection", () => {
    it("identifies unchanged data even when check-time timestamps differ", () => {
      const baseObservation = {
        id: "COD:National:2026-09-09",
        geographicPrecision: "country",
        country: { iso3: "COD", name: "Democratic Republic of the Congo" },
        province: null,
        healthZone: null,
        city: null,
        metrics: { confirmedCases: 6942, confirmedDeaths: 3349 },
        provenance: {
          sourceId: "drc-insp-sitrep",
          publisher: "INSP",
          sourceUrl: "https://sante.gouv.cd",
        },
        timestamps: {
          sourceUpdatedAt: "2026-09-09",
          publishedAt: "2026-09-09T12:00:00.000Z",
          fetchedAt: "2026-09-11T12:00:00.000Z",
        },
        classification: "affected",
      };

      const snap1 = createSnapshotFromObservations({
        snapshotId: "snap-run-1",
        status: "current",
        scheduledCadenceMinutes: 30,
        observations: [baseObservation],
      });

      // Second snapshot with identical data but later check/fetch time
      const laterObservation = {
        ...baseObservation,
        timestamps: {
          ...baseObservation.timestamps,
          fetchedAt: "2026-09-11T12:30:00.000Z", // 30 minutes later
        },
      };

      const snap2 = createSnapshotFromObservations({
        snapshotId: "snap-run-2",
        status: "current",
        scheduledCadenceMinutes: 30,
        observations: [laterObservation],
      });

      const changed = hasEpidemiologicalContentChanged(snap1, snap2);
      expect(changed).toBe(false);
    });

    it("detects genuine changes in case counts, deaths, or reporting date", () => {
      const snap1 = createSnapshotFromObservations({
        snapshotId: "snap-1",
        status: "current",
        observations: [
          {
            id: "COD:National:2026-09-08",
            geographicPrecision: "country",
            country: { iso3: "COD", name: "Democratic Republic of the Congo" },
            province: null,
            healthZone: null,
            city: null,
            metrics: { confirmedCases: 6843, confirmedDeaths: 3310 },
            provenance: { sourceId: "drc", publisher: "INSP", sourceUrl: "https://sante.gouv.cd" },
            timestamps: {
              sourceUpdatedAt: "2026-09-08",
              publishedAt: "2026-09-08T12:00:00Z",
              fetchedAt: "2026-09-08T12:00:00Z",
            },
            classification: "affected",
          },
        ],
      });

      const snap2 = createSnapshotFromObservations({
        snapshotId: "snap-2",
        status: "current",
        observations: [
          {
            id: "COD:National:2026-09-09",
            geographicPrecision: "country",
            country: { iso3: "COD", name: "Democratic Republic of the Congo" },
            province: null,
            healthZone: null,
            city: null,
            metrics: { confirmedCases: 6942, confirmedDeaths: 3349 }, // Increased!
            provenance: { sourceId: "drc", publisher: "INSP", sourceUrl: "https://sante.gouv.cd" },
            timestamps: {
              sourceUpdatedAt: "2026-09-09",
              publishedAt: "2026-09-09T12:00:00Z",
              fetchedAt: "2026-09-09T12:00:00Z",
            },
            classification: "affected",
          },
        ],
      });

      const changed = hasEpidemiologicalContentChanged(snap1, snap2);
      expect(changed).toBe(true);
    });
  });

  describe("Ingestion Pipeline Execution & Fail-Closed Protection", () => {
    it("leaves existing snapshot intact when ingestion encounters upstream failure", async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ebola-sched-test-"));
      try {
        // 1. Establish initial good snapshot
        const initialSnapshot = createSnapshotFromObservations({
          snapshotId: "initial-good-snapshot",
          status: "current",
          observations: [
            {
              id: "COD:National:2026-09-08",
              geographicPrecision: "country",
              country: { iso3: "COD", name: "Democratic Republic of the Congo" },
              province: null,
              healthZone: null,
              city: null,
              metrics: { confirmedCases: 6843, confirmedDeaths: 3310 },
              provenance: {
                sourceId: "drc",
                publisher: "INSP",
                sourceUrl: "https://sante.gouv.cd",
              },
              timestamps: {
                sourceUpdatedAt: "2026-09-08",
                publishedAt: "2026-09-08T12:00:00Z",
                fetchedAt: "2026-09-08T12:00:00Z",
              },
              classification: "affected",
            },
          ],
        });
        const { saveSnapshotAtomically } = await import("../server/pipeline/snapshot-store.js");
        saveSnapshotAtomically(initialSnapshot, tempDir);

        // 2. Run ingestion pipeline with failing source mock
        const result = await runIngestionPipeline({
          storageDir: tempDir,
          fetchSourceDataFn: async () => {
            throw new Error("503 Service Unavailable");
          },
        });

        expect(result.success).toBe(false);
        expect(result.changed).toBe(false);
        expect(result.error).toContain("503 Service Unavailable");

        // 3. Verify target snapshot file is unchanged
        const { loadLatestSnapshot } = await import("../server/pipeline/snapshot-store.js");
        const loaded = loadLatestSnapshot(tempDir);
        expect(loaded.snapshotId).toBe("initial-good-snapshot");
        expect(loaded.summary.totalCases).toBe(6843);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("GitHub Actions Workflow Verification", () => {
    it("configures 30-minute cron, timeout bounds, and pnpm version accurately", () => {
      const workflowPath = path.resolve(__dirname, "../.github/workflows/deploy.yml");
      const content = fs.readFileSync(workflowPath, "utf-8");

      // 30-minute cron check
      expect(content).toContain("*/30 * * * *");

      // Bounded execution timeout
      expect(content).toContain("timeout-minutes:");

      // Concurrency protection
      expect(content).toContain("concurrency:");

      // pnpm devEngine alignment
      expect(content).toMatch(/version:\s*(12|12\.3\.4)/);
    });
  });
});
