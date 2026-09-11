import { describe, it, expect } from "vite-plus/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPrerenderData } from "../server/pipeline/prerender-loader.js";
import { loadLatestSnapshot } from "../server/pipeline/snapshot-store.js";
import { render } from "../src/entry-server.js";
import { applyUpdatedSnapshot } from "../src/pipeline/client-state-updater.js";
import { app } from "../server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDataDir = path.resolve(__dirname, "../public/data");

describe("DATA-007: Unify API, static build, and client data wiring", () => {
  describe("Shared Prerender and Snapshot Loader", () => {
    it("loads data directly from validated public/data snapshot with snapshotId attached", () => {
      const snapshot = loadLatestSnapshot(publicDataDir);
      expect(snapshot).not.toBeNull();

      const prerenderData = getPrerenderData(publicDataDir);
      expect(prerenderData).toBeDefined();
      expect(prerenderData.snapshotId).toBe(snapshot.snapshotId);
      expect(prerenderData.summary.totalCases).toBe(snapshot.summary.totalCases);
      expect(prerenderData.summary.totalDeaths).toBe(snapshot.summary.totalDeaths);
      expect(prerenderData.summary.overallCfr).toBe(snapshot.summary.overallCfr);
    });
  });

  describe("API Endpoint Parity & Content-Type", () => {
    it("returns JSON (never application HTML) for /api/ebola-data", async () => {
      const res = await app.request("/api/ebola-data");
      expect(res.status).toBe(200);

      const contentType = res.headers.get("content-type");
      expect(contentType).toContain("application/json");

      const body = await res.json();
      expect(body).toBeDefined();
      expect(body.summary).toBeDefined();
      expect(typeof body.summary.totalCases).toBe("number");
      expect(typeof body.summary.totalDeaths).toBe("number");

      const snapshot = loadLatestSnapshot(publicDataDir);
      expect(body.summary.totalCases).toBe(snapshot.summary.totalCases);
      expect(body.summary.totalDeaths).toBe(snapshot.summary.totalDeaths);
    });
  });

  describe("Static Build & Prerender Parity", () => {
    it("prerenders HTML containing exact snapshot totals matching manifest.json", () => {
      const manifestPath = path.join(publicDataDir, "manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

      const data = getPrerenderData(publicDataDir);
      const { appHtml, initialState } = render(data);

      expect(appHtml).toContain(manifest.summary.totalCases.toLocaleString());
      expect(appHtml).toContain(manifest.summary.totalDeaths.toLocaleString());

      const stateParsed = JSON.parse(initialState);
      expect(stateParsed.snapshotId).toBe(manifest.snapshotId);
      expect(stateParsed.summary.totalCases).toBe(manifest.summary.totalCases);
      expect(stateParsed.summary.totalDeaths).toBe(manifest.summary.totalDeaths);
    });
  });

  describe("Client Dynamic Ingestion Without Full Reload", () => {
    it("updates DOM stat elements smoothly when a new validated snapshot is applied", () => {
      const mockElements = {
        cases: { textContent: "1,000" },
        deaths: { textContent: "500" },
        cfrSub: { textContent: "50.0% case fatality" },
        nations: { textContent: "1" },
        badge: { textContent: "Active Surveillance — 1 Countries Affected" },
      };

      const mockDoc = {
        querySelector: (sel) => {
          if (sel === ".stat-card.cases .value") return mockElements.cases;
          if (sel === ".stat-card.deaths .value") return mockElements.deaths;
          if (sel === ".stat-card.deaths .sub") return mockElements.cfrSub;
          if (sel === ".stat-card.cfr .value") return mockElements.nations;
          if (sel === ".pheic-badge") return mockElements.badge;
          return null;
        },
      };

      const newSnapshot = {
        snapshotId: "snapshot-2026-09-10-new",
        status: "current",
        summary: {
          totalCases: 7100,
          totalDeaths: 3450,
          overallCfr: "48.6%",
          affectedCountriesCount: 2,
        },
        observations: [],
      };

      applyUpdatedSnapshot(newSnapshot, mockDoc);

      expect(mockElements.cases.textContent).toBe("7,100");
      expect(mockElements.deaths.textContent).toBe("3,450");
      expect(mockElements.cfrSub.textContent).toBe("48.6% case fatality");
      expect(mockElements.nations.textContent).toBe("2");
      expect(mockElements.badge.textContent).toBe("Active Surveillance — 2 Countries Affected");
    });
  });
});
