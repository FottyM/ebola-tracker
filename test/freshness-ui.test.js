import { describe, it, expect } from "vite-plus/test";
import {
  createFreshnessViewModel,
  formatEuropeanDateTime,
  formatEuropeanDate,
} from "../src/pipeline/freshness-view-model.js";
import { render } from "../src/entry-server.js";
import { applyUpdatedSnapshot } from "../src/pipeline/client-state-updater.js";

describe("DATA-008: Present Truthful Freshness and Provenance", () => {
  describe("European Date & Time Formatting", () => {
    it("formats ISO dates into European notation with 24-hour time", () => {
      expect(formatEuropeanDateTime("2026-09-09")).toBe("09/09/2026 12:00");
      expect(formatEuropeanDateTime("2026-09-09T14:30:00.000Z")).toBe("09/09/2026 14:30");
      expect(formatEuropeanDateTime("2026-09-09", "18:45")).toBe("09/09/2026 18:45");
      expect(formatEuropeanDate("2026-09-09")).toBe("09/09/2026");
    });
  });

  describe("Freshness View Model", () => {
    it("derives reporting date and status accurately from validated snapshot in European notation with time", () => {
      const snapshot = {
        snapshotId: "snapshot-2026-09-09-001",
        status: "current",
        cadence: { scheduledCadenceMinutes: 30 },
        summary: {
          totalCases: 6942,
          totalDeaths: 3349,
          overallCfr: "48.2%",
          affectedCountriesCount: 1,
          lastReportDate: "2026-09-09",
        },
        freshness: {
          freshness: "current",
          sourceUpdatedAt: "2026-09-09",
          publishedAt: "2026-09-09T12:00:00.000Z",
        },
        observations: [
          {
            geographicPrecision: "country",
            timestamps: { sourceUpdatedAt: "2026-09-09", publishedAt: "2026-09-09T12:00:00.000Z" },
          },
          {
            geographicPrecision: "health-zone",
            timestamps: { sourceUpdatedAt: "2026-09-09" },
          },
        ],
      };

      const vm = createFreshnessViewModel(snapshot);
      expect(vm.reportingDate).toBe("09/09/2026 12:00");
      expect(vm.status).toBe("current");
      expect(vm.statusText).toBe("Current");
      expect(vm.statusBadgeClass).toBe("freshness-current");
      expect(vm.hasMixedDates).toBe(false);
    });

    it("identifies mixed reporting dates between national and health-zone data in European format", () => {
      const mixedSnapshot = {
        snapshotId: "snapshot-mixed-001",
        status: "partial",
        summary: {
          lastReportDate: "2026-09-09",
        },
        observations: [
          {
            geographicPrecision: "country",
            timestamps: { sourceUpdatedAt: "2026-09-09", publishedAt: "2026-09-09T12:00:00.000Z" },
          },
          {
            geographicPrecision: "health-zone",
            timestamps: { sourceUpdatedAt: "2026-09-08" },
          },
        ],
      };

      const vm = createFreshnessViewModel(mixedSnapshot);
      expect(vm.status).toBe("partial");
      expect(vm.statusText).toBe("Partial Update");
      expect(vm.statusBadgeClass).toBe("freshness-partial");
      expect(vm.hasMixedDates).toBe(true);
      expect(vm.sectionDates.national).toBe("09/09/2026");
      expect(vm.sectionDates.healthZones).toBe("08/09/2026");
    });

    it("represents stale and failed states truthfully", () => {
      const staleSnapshot = {
        snapshotId: "snapshot-stale",
        status: "stale",
        summary: { lastReportDate: "2026-09-05" },
        observations: [],
      };
      const vmStale = createFreshnessViewModel(staleSnapshot);
      expect(vmStale.status).toBe("stale");
      expect(vmStale.statusText).toBe("Stale Fallback");
      expect(vmStale.statusBadgeClass).toBe("freshness-stale");

      const failedSnapshot = {
        snapshotId: "snapshot-failed",
        status: "failed",
        summary: { lastReportDate: "2026-09-01" },
        observations: [],
      };
      const vmFailed = createFreshnessViewModel(failedSnapshot);
      expect(vmFailed.status).toBe("failed");
      expect(vmFailed.statusText).toBe("Sync Issue");
      expect(vmFailed.statusBadgeClass).toBe("freshness-failed");
    });
  });

  describe("UI Rendering and Accessibility", () => {
    it("renders compact freshness bar with authority reporting date into SSR HTML", () => {
      const testData = {
        snapshotId: "snapshot-2026-09-09-001",
        status: "current",
        summary: {
          totalCases: 6942,
          totalDeaths: 3349,
          overallCfr: "48.2%",
          affectedCountriesCount: 1,
          lastReportDate: "2026-09-09",
        },
        locations: [
          {
            country: "Democratic Republic of the Congo",
            countryCode: "COD",
            region: "Ituri",
            cases: 5542,
            deaths: 2511,
            cfr: 45.3,
            status: "Active Epicenter",
            center: [1.56, 30.25],
            lastReported: "2026-09-09",
          },
        ],
        epiCurve: [],
        demographics: null,
        corridors: [],
        sources: {
          hdx: { name: "HDX", url: "https://data.humdata.org", status: "Live (200 OK)" },
          who: { name: "WHO", url: "https://www.who.int", status: "Official Stream" },
          reliefweb: { name: "ReliefWeb", url: "https://reliefweb.int", status: "Active Portal" },
        },
      };

      const { appHtml } = render(testData);

      expect(appHtml).toContain("freshness-bar");
      expect(appHtml).toContain("09/09/2026 12:00");
      expect(appHtml).toContain("Current");
      expect(appHtml).toContain("freshness-current");
    });
  });

  describe("Client-Side Dynamic Freshness Update", () => {
    it("updates freshness bar elements without full reload when new snapshot is applied", () => {
      const mockElements = {
        dateEl: { textContent: "08/09/2026 12:00" },
        statusPill: { textContent: "Current", className: "freshness-status-pill" },
        indicator: { className: "freshness-indicator freshness-current" },
      };

      const mockDoc = {
        querySelector: (sel) => {
          if (sel === ".freshness-label strong") return mockElements.dateEl;
          if (sel === ".freshness-status-pill") return mockElements.statusPill;
          if (sel === ".freshness-indicator") return mockElements.indicator;
          return null;
        },
      };

      const updatedSnapshot = {
        snapshotId: "snapshot-2026-09-10-new",
        status: "partial",
        summary: {
          totalCases: 7200,
          totalDeaths: 3500,
          overallCfr: "48.6%",
          affectedCountriesCount: 1,
          lastReportDate: "2026-09-10",
        },
        observations: [
          {
            geographicPrecision: "country",
            timestamps: { sourceUpdatedAt: "2026-09-10", publishedAt: "2026-09-10T12:00:00.000Z" },
          },
          {
            geographicPrecision: "health-zone",
            timestamps: { sourceUpdatedAt: "2026-09-09" },
          },
        ],
      };

      applyUpdatedSnapshot(updatedSnapshot, mockDoc);

      expect(mockElements.dateEl.textContent).toBe("10/09/2026 12:00");
      expect(mockElements.statusPill.textContent).toBe("Partial Update");
      expect(mockElements.indicator.className).toContain("freshness-partial");
    });
  });
});
