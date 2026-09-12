import { describe, it, expect } from "vite-plus/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runIngestionPipeline,
  hasEpidemiologicalContentChanged,
} from "../server/pipeline/pipeline-ingest.js";
import { parseMinistrySitrepText } from "../server/pipeline/parsers/sitrep-parser.js";
import {
  validateOutbreakSnapshot,
  createSnapshotFromObservations,
} from "../server/pipeline/contracts.js";
import {
  reconcileNationalWithProvinces,
  reconcileProvinceWithHealthZones,
} from "../server/pipeline/reconciliation.js";
import { render } from "../src/entry-server.js";
import { getPrerenderData } from "../server/pipeline/prerender-loader.js";

import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storageDir = path.resolve(__dirname, "../public/data");

describe("DATA-010: Integrity, Regression, and Operational Coverage", () => {
  describe("1. Schema-Change and Malformed Source Protection", () => {
    it("fails closed when SitRep text is missing critical health zone columns or numbers", async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ebola-op-cov-"));
      try {
        const corruptedSitrep = `
          REPUBLIQUE DEMOCRATIQUE DU CONGO
          MINISTERE DE LA SANTE
          SITUATION EPIDEMIOLOGIQUE
          RAPPORT DE SITUATION NUMERO 999
          DATE: 2026-09-10
          TABLEAU CORROMPU SANS COLONNES
          ZoneInvalide | NA | Corrupted
        `;

        const parsed = parseMinistrySitrepText(corruptedSitrep);
        expect(parsed.valid).toBe(false);
        expect(parsed.provinces.length).toBe(0);

        const result = await runIngestionPipeline({
          storageDir: tempDir,
          drcParsed: parsed,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("invalid");
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("rejects candidate snapshot if negative counts or corrupted dates are introduced", () => {
      const invalidSnapshot = {
        schemaVersion: "1.0.0",
        snapshotId: "snap-invalid-999",
        scheduledCadenceMinutes: 30,
        publishedAt: "invalid-date-string",
        status: "current",
        summary: {
          totalCases: -50,
          totalDeaths: 10,
          affectedCountriesCount: 1,
          lastReportDate: "not-a-date",
        },
        observations: [],
      };

      const validation = validateOutbreakSnapshot(invalidSnapshot);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(
        validation.errors.some((e) => e.includes("negative") || e.includes("totalCases")),
      ).toBe(true);
    });
  });

  describe("2. Reconciliation Integrity & Medical Evacuation Isolation", () => {
    it("ensures medical evacuations to non-endemic countries are quarantined and never counted in national totals", () => {
      const endemicObs = {
        id: "drc-nat-001",
        country: { iso3: "COD", name: "DRC" },
        geographicPrecision: "country",
        metrics: { confirmedCases: 100, confirmedDeaths: 50 },
        provenance: {
          sourceId: "drc-insp-sitrep",
          publisher: "DRC Ministry of Health",
          sourceUrl: "https://sante.gouv.cd",
        },
        timestamps: {
          sourceUpdatedAt: "2026-09-09",
          publishedAt: "2026-09-09",
          fetchedAt: "2026-09-09",
        },
        classification: "affected",
      };

      const evacuatedObs = {
        id: "intl-fra-evac",
        country: { iso3: "FRA", name: "France" },
        geographicPrecision: "country",
        metrics: { confirmedCases: 1, confirmedDeaths: 0 },
        provenance: {
          sourceId: "who-evac",
          publisher: "WHO AFRO",
          sourceUrl: "https://who.int",
        },
        timestamps: {
          sourceUpdatedAt: "2026-09-09",
          publishedAt: "2026-09-09",
          fetchedAt: "2026-09-09",
        },
        classification: "medical-evacuation",
      };

      const observations = [endemicObs, evacuatedObs];
      const snapshot = createSnapshotFromObservations({
        snapshotId: "snap-test-evac",
        observations,
      });

      // Endemic total isolates outbreak from evacuations
      expect(snapshot.summary.totalCases).toBe(100);
      const fraObs = snapshot.observations.find((o) => o.country.iso3 === "FRA");
      expect(fraObs.classification).toBe("medical-evacuation");
    });

    it("detects and blocks mismatch between national headline totals and sum of provinces", () => {
      const national = {
        confirmedCases: 6942,
        confirmedDeaths: 3349,
        reportingDate: "2026-09-09",
      };

      const mismatchedProvinces = [
        { name: "Ituri", cases: 5000, deaths: 2500 },
        { name: "Nord-Kivu", cases: 1000, deaths: 700 },
      ];

      const result = reconcileNationalWithProvinces(national, mismatchedProvinces);
      expect(result.reconciled).toBe(false);
      expect(result.blocking).toBe(true);
      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts.some((c) => c.metric === "confirmedCases")).toBe(true);
    });

    it("reconciles province and health zones by creating unallocated observations without double counting", () => {
      const province = {
        name: "Ituri",
        pcode: "CD54",
        cases: 5542,
        deaths: 2511,
        reportingDate: "2026-09-09",
      };

      const healthZones = [
        { name: "Bunia", cases: 2000, deaths: 900 },
        { name: "Mambasa", cases: 1500, deaths: 700 },
      ];

      const result = reconcileProvinceWithHealthZones(province, healthZones);
      expect(result.blocking).toBe(false);
      expect(result.unallocatedCases).toBe(2042);
      expect(result.unallocatedObservation).toBeDefined();
      expect(result.unallocatedObservation.metrics.confirmedCases).toBe(2042);
    });
  });

  describe("3. Ingestion Dry-Run Mode & Structured Observability", () => {
    it("runs ingestion in dry-run mode without mutating persistent files or snapshot manifests", async () => {
      const fixturePath = path.resolve(__dirname, "fixtures/sitrep/sitrep-118-2026-09-09.txt");
      const text = fs.readFileSync(fixturePath, "utf-8");
      const drcParsed = parseMinistrySitrepText(text);

      const result = await runIngestionPipeline({
        storageDir,
        drcParsed,
        internationalObservations: [],
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.candidateSnapshot).toBeDefined();
      expect(result.candidateSnapshot.summary.totalCases).toBe(6942);
      expect(Array.isArray(result.operationalLogs)).toBe(true);
      expect(result.operationalLogs.length).toBeGreaterThan(0);
    });

    it("evaluates genuine epidemiological change accurately without considering check timestamps", () => {
      const baseSnap = {
        status: "current",
        summary: {
          totalCases: 6843,
          totalDeaths: 2486,
          affectedCountriesCount: 1,
          lastReportDate: "2026-09-09",
        },
        observations: [
          {
            id: "cod-beni",
            metrics: { confirmedCases: 100, confirmedDeaths: 50 },
            timestamps: { sourceUpdatedAt: "2026-09-09" },
          },
        ],
      };

      const timestampOnlySnap = {
        ...baseSnap,
        generatedAt: "2026-09-11T12:00:00Z",
        observations: [
          {
            id: "cod-beni",
            metrics: { confirmedCases: 100, confirmedDeaths: 50 },
            timestamps: { sourceUpdatedAt: "2026-09-09", fetchedAt: "2026-09-11T12:00:00Z" },
          },
        ],
      };

      expect(hasEpidemiologicalContentChanged(baseSnap, timestampOnlySnap)).toBe(false);

      const modifiedSnap = {
        ...baseSnap,
        summary: { ...baseSnap.summary, totalCases: 6844 },
      };
      expect(hasEpidemiologicalContentChanged(baseSnap, modifiedSnap)).toBe(true);
    });
  });

  describe("4. API and Static Parity Verification", () => {
    it("proves prerender data loader and static snapshot file are strictly parity matched", () => {
      const staticSnapshotPath = path.resolve(storageDir, "latest-snapshot.json");
      expect(fs.existsSync(staticSnapshotPath)).toBe(true);

      const staticSnapshot = JSON.parse(fs.readFileSync(staticSnapshotPath, "utf-8"));
      const prerenderData = getPrerenderData(storageDir);

      expect(prerenderData.summary.totalCases).toBe(staticSnapshot.summary.totalCases);
      expect(prerenderData.summary.totalDeaths).toBe(staticSnapshot.summary.totalDeaths);
      expect(prerenderData.summary.lastReportDate).toBe(staticSnapshot.summary.lastReportDate);
    });
  });

  describe("5. UI Structural Regression Protection", () => {
    it("renders server-side HTML with all required architectural containers and zero markup degradation", () => {
      const prerenderData = getPrerenderData(storageDir);
      const { appHtml, jsonLd, initialState } = render(prerenderData);

      expect(appHtml).toContain('id="map"');
      expect(appHtml).toContain("info-panel");
      expect(appHtml).toContain("panel-header");
      expect(appHtml).toContain("stats-grid");
      expect(appHtml).toContain("stat-card");
      expect(appHtml).toContain(prerenderData.summary.totalCases.toLocaleString());
      expect(appHtml).toContain(prerenderData.summary.totalDeaths.toLocaleString());
      expect(appHtml).toContain("freshness-bar");
      expect(appHtml).toContain("freshness-status-pill");
      expect(appHtml).toContain("freshness-label");
      expect(appHtml).toContain("cases-dialog");
      expect(appHtml).toContain("timeline-dialog");
      expect(appHtml).toContain("legend");

      expect(initialState).toContain(String(prerenderData.summary.totalCases));
      expect(jsonLd).toContain("SpecialAnnouncement");
    });
  });
});
