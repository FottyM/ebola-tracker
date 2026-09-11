import { describe, it, expect } from "vite-plus/test";
import {
  parseHdxConsolidatedCsv,
  ingestHdxOutbreakFeed,
} from "../server/pipeline/adapters/hdx-adapter.js";

describe("DATA-005: HDX Subnational Health-Zone Adapter", () => {
  const sampleCsvHeader =
    "country_code,location_level,location_name,pcode,reference_date,measure,classification,period,value,source,source_url\n";
  const sampleCsvRows = [
    "COD,3,Bunia,CD540201,2026-09-08,cases,confirmed,cumulative,1420,INSP,https://sante.gouv.cd\n",
    "COD,3,Bunia,CD540201,2026-09-08,deaths,confirmed,cumulative,612,INSP,https://sante.gouv.cd\n",
    "COD,3,Gethy,CD540203,2026-09-08,cases,confirmed,cumulative,245,INSP,https://sante.gouv.cd\n",
    "COD,3,Gethy,CD540203,2026-09-08,deaths,confirmed,cumulative,110,INSP,https://sante.gouv.cd\n",
    "COD,3,Lubunga,CD910703,2026-09-08,cases,confirmed,cumulative,14,INSP,https://sante.gouv.cd\n",
    "COD,3,Lubunga,CD910703,2026-09-08,deaths,confirmed,cumulative,5,INSP,https://sante.gouv.cd\n",
  ].join("");

  const sampleCsv = sampleCsvHeader + sampleCsvRows;

  describe("CSV Schema Parsing & Geo Resolution", () => {
    it("parses valid HDX CSV and maps to normalized observations via crosswalk", () => {
      const result = parseHdxConsolidatedCsv(sampleCsv);
      expect(result.valid).toBe(true);
      expect(result.observations).toHaveLength(3); // Bunia, Gethy, Lubunga

      const bunia = result.observations.find((o) => o.healthZone.name === "Bunia");
      expect(bunia).toBeDefined();
      expect(bunia.geographicPrecision).toBe("health-zone");
      expect(bunia.city).toBeNull();
      expect(bunia.province.name).toBe("Ituri");
      expect(bunia.healthZone.pcode).toBe("CD540201");
      expect(bunia.healthZone.dhis2Id).toBe("GPi6i83o7l6");
      expect(bunia.metrics.confirmedCases).toBe(1420);
      expect(bunia.metrics.confirmedDeaths).toBe(612);
      expect(bunia.timestamps.sourceUpdatedAt).toBe("2026-09-08");

      // Verify alias resolution for Gethy -> Gety
      const gethy = result.observations.find((o) => o.healthZone.pcode === "CD540203");
      expect(gethy).toBeDefined();
      expect(gethy.healthZone.name).toBe("Gety");
      expect(gethy.healthZone.dhis2Id).toBe("X8zFJ7DJlRD");

      // Verify alias resolution for Lubunga -> Tshopo
      const lubunga = result.observations.find((o) => o.healthZone.pcode === "CD910703");
      expect(lubunga).toBeDefined();
      expect(lubunga.province.name).toBe("Tshopo");
    });

    it("fails closed on unmapped health zone pcode or name", () => {
      const invalidCsv =
        sampleCsvHeader +
        "COD,3,Atlantis,CD999999,2026-09-08,cases,confirmed,cumulative,50,INSP,https://sante.gouv.cd\n";
      const result = parseHdxConsolidatedCsv(invalidCsv);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Unknown health zone"))).toBe(true);
    });

    it("fails closed on corrupted CSV header", () => {
      const badHeader = "col1,col2,col3\n1,2,3\n";
      const result = parseHdxConsolidatedCsv(badHeader);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Invalid HDX CSV schema"))).toBe(true);
    });
  });

  describe("Feed Ingestion Wrapper", () => {
    it("wraps parsed records with complete source provenance and lag report", () => {
      const feed = ingestHdxOutbreakFeed({
        csvContent: sampleCsv,
        nationalReportingDate: "2026-09-09",
        fetchedAt: "2026-09-11T14:00:00.000Z",
      });

      expect(feed.success).toBe(true);
      expect(feed.coverageCount).toBe(3);
      expect(feed.referenceDate).toBe("2026-09-08");
      expect(feed.lagDays).toBe(1); // 2026-09-09 vs 2026-09-08
    });
  });
});
