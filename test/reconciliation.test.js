import { describe, it, expect } from "vite-plus/test";
import {
  reconcileNationalWithProvinces,
  reconcileProvinceWithHealthZones,
  determineSnapshotFreshness,
  reconcileCrossCountryEvacuations,
  recordSourceCorrection,
} from "../server/pipeline/reconciliation.js";

describe("DATA-003: Source Precedence and Reconciliation Rules", () => {
  describe("Rule 1: National vs Province Reconciliation", () => {
    it("passes when province cumulative cases and deaths match national totals", () => {
      const national = {
        confirmedCases: 6942,
        confirmedDeaths: 3349,
        newConfirmedCases: 99,
        reportingDate: "2026-09-09",
      };

      const provinces = [
        { name: "Ituri", cases: 5542, deaths: 2511, newCases: 78 },
        { name: "Nord-Kivu", cases: 1109, deaths: 718, newCases: 16 },
        { name: "Haut-Uele", cases: 260, deaths: 107, newCases: 5 },
        { name: "Tshopo", cases: 24, deaths: 9, newCases: 0 },
        { name: "Bas-Uele", cases: 4, deaths: 3, newCases: 0 },
        { name: "Sud-Kivu", cases: 3, deaths: 1, newCases: 0 },
      ];

      const result = reconcileNationalWithProvinces(national, provinces);
      expect(result.reconciled).toBe(true);
      expect(result.conflicts).toHaveLength(0);
      expect(result.blocking).toBe(false);
    });

    it("generates a blocking conflict when sum of provinces does not match national cases", () => {
      const national = {
        confirmedCases: 6942,
        confirmedDeaths: 3349,
        reportingDate: "2026-09-09",
      };

      const provinces = [
        { name: "Ituri", cases: 5000, deaths: 2512 },
        { name: "Nord-Kivu", cases: 1109, deaths: 718 },
        // Remaining provinces missing, sum = 6109 != 6942
      ];

      const result = reconcileNationalWithProvinces(national, provinces);
      expect(result.reconciled).toBe(false);
      expect(result.blocking).toBe(true);
      expect(result.conflicts.some((c) => c.metric === "confirmedCases")).toBe(true);
    });
  });

  describe("Rule 2: Province vs Health Zone Unallocated Differences", () => {
    it("creates explicit unallocated observations when zone sum is less than province total", () => {
      const province = {
        name: "Ituri",
        pcode: "CD54",
        cases: 5461,
        deaths: 2481,
        reportingDate: "2026-09-08",
      };

      const healthZones = [
        { name: "Bunia", cases: 3000, deaths: 1200 },
        { name: "Mambasa", cases: 2000, deaths: 900 },
        // Zone deaths = 2100, Province deaths = 2481 -> unallocated = 381
      ];

      const result = reconcileProvinceWithHealthZones(province, healthZones);
      expect(result.unallocatedCases).toBe(461);
      expect(result.unallocatedDeaths).toBe(381);
      expect(result.unallocatedObservation).toBeDefined();
      expect(result.unallocatedObservation.geographicPrecision).toBe("province");
      expect(result.unallocatedObservation.healthZone).toBeNull();
      expect(result.unallocatedObservation.isUnallocated).toBe(true);
    });

    it("flags a blocking conflict if allocated zone cases exceed the province total", () => {
      const province = {
        name: "Tshopo",
        cases: 24,
        deaths: 9,
        reportingDate: "2026-09-08",
      };

      const healthZones = [
        { name: "Makiso-Kisangani", cases: 35, deaths: 12 }, // 35 > 24!
      ];

      const result = reconcileProvinceWithHealthZones(province, healthZones);
      expect(result.blocking).toBe(true);
      expect(result.conflicts.some((c) => c.severity === "blocking")).toBe(true);
    });
  });

  describe("Rule 3 & Freshness States: Mixed Reporting Dates", () => {
    it("determines 'partial' status when health-zone feed date lags national report date", () => {
      const status = determineSnapshotFreshness({
        nationalDate: "2026-09-09",
        provinceDate: "2026-09-09",
        healthZoneDate: "2026-09-08", // 1 day lag
        hasBlockingConflicts: false,
        hasNonBlockingConflicts: true,
      });

      expect(status.freshness).toBe("partial");
      expect(status.reason).toContain("Health-zone data reference date (2026-09-08) lags");
      expect(status.sectionDates.national).toBe("2026-09-09");
      expect(status.sectionDates.healthZones).toBe("2026-09-08");
    });

    it("determines 'current' status when all dates align and checks pass", () => {
      const status = determineSnapshotFreshness({
        nationalDate: "2026-09-09",
        provinceDate: "2026-09-09",
        healthZoneDate: "2026-09-09",
        hasBlockingConflicts: false,
        hasNonBlockingConflicts: false,
      });

      expect(status.freshness).toBe("current");
    });

    it("determines 'failed' status when blocking conflicts occur", () => {
      const status = determineSnapshotFreshness({
        nationalDate: "2026-09-09",
        provinceDate: "2026-09-09",
        healthZoneDate: "2026-09-09",
        hasBlockingConflicts: true,
        hasNonBlockingConflicts: false,
      });

      expect(status.freshness).toBe("failed");
    });
  });

  describe("Rule 5: Legitimate Source Corrections", () => {
    it("accepts a cumulative decrease when documented as an authoritative correction", () => {
      const previous = {
        region: "Bas-Uele",
        cases: 6,
        source: "SitRep 117",
        reportingDate: "2026-09-08",
      };

      const updated = {
        region: "Bas-Uele",
        cases: 4, // Decrease from 6 to 4 due to laboratory declassification
        source: "SitRep 118",
        reportingDate: "2026-09-09",
        reason: "False positive re-tested negative by PCR",
      };

      const correction = recordSourceCorrection(previous, updated);
      expect(correction.isCorrection).toBe(true);
      expect(correction.difference).toBe(-2);
      expect(correction.accepted).toBe(true);
      expect(correction.previousSource).toBe("SitRep 117");
      expect(correction.newSource).toBe("SitRep 118");
    });
  });

  describe("Rule 7: Germany and France Evacuation Guardrail", () => {
    it("ensures evacuation cases are segregated and do not increment affected countries count", () => {
      const records = [
        { countryCode: "COD", cases: 6942, type: "affected" },
        { countryCode: "UGA", cases: 20, type: "affected" },
        { countryCode: "FRA", cases: 1, type: "medical-evacuation" },
        { countryCode: "DEU", cases: 1, type: "medical-evacuation" },
      ];

      const result = reconcileCrossCountryEvacuations(records);
      expect(result.affectedCountriesCount).toBe(2);
      expect(result.totalEpidemicCases).toBe(6962); // 6942 + 20
      expect(result.evacuationDestinations).toHaveLength(2);
      expect(result.evacuationDestinations.map((d) => d.countryCode)).toEqual(["FRA", "DEU"]);
    });
  });
});
