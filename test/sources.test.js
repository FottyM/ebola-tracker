import { describe, it, expect } from "vite-plus/test";
import {
  AUTHORITATIVE_SOURCES,
  HDX_CONFIG,
  GEOGRAPHIC_LEVELS,
  isGeographicLevelSupported,
  classifyCountryStatus,
  getSourcePrecedenceForMetric,
  FIXTURE_LICENSING_POLICY,
} from "../server/pipeline/sources.js";

describe("DATA-001: Authoritative Sources and Geographic Coverage", () => {
  describe("Source Registry & Feasibility Matrix", () => {
    it("registers all required authoritative sources with complete provenance fields", () => {
      const requiredSourceIds = [
        "drc-insp-sitrep",
        "hdx-consolidated",
        "who-acute-event",
        "who-don",
        "uganda-moh",
        "france-gov",
        "germany-bmg",
        "africa-cdc",
        "inrb-open-data",
      ];

      for (const id of requiredSourceIds) {
        const source = AUTHORITATIVE_SOURCES[id];
        expect(source, `Missing source ${id}`).toBeDefined();
        expect(source.id).toBe(id);
        expect(source.name).toBeTruthy();
        expect(source.publisher).toBeTruthy();
        expect(source.exactUrl).toMatch(/^https?:\/\//);
        expect(source.format).toBeTruthy();
        expect(source.cadence).toBeTruthy();
        expect(source.geographicCoverage).toBeInstanceOf(Array);
        expect(source.role).toBeTruthy();
        expect(source.licensingPolicy).toBeTruthy();
      }
    });
  });

  describe("HDX Stable Identification", () => {
    it("uses verified stable package and resource identifiers rather than search ranking", () => {
      expect(HDX_CONFIG.packageId).toBe("republique-democratique-du-congo-cas-et-deces-d-ebola");
      expect(HDX_CONFIG.resourceId).toBe("d90385d3-5339-4a3f-ac63-2699361edbe0");
      expect(HDX_CONFIG.disallowSearchRankingSelection).toBe(true);
      expect(HDX_CONFIG.expectedFormat).toBe("CSV");
      expect(HDX_CONFIG.locationLevel).toBe(3); // health zones
    });
  });

  describe("Geographic Precision & City-Level Prohibition", () => {
    it("explicitly supports country, province, and health-zone levels", () => {
      expect(isGeographicLevelSupported("country")).toBe(true);
      expect(isGeographicLevelSupported("province")).toBe(true);
      expect(isGeographicLevelSupported("health-zone")).toBe(true);
    });

    it("explicitly forbids general city-level precision without an authoritative city source", () => {
      expect(isGeographicLevelSupported("city")).toBe(false);
      expect(GEOGRAPHIC_LEVELS.city.supported).toBe(false);
      expect(GEOGRAPHIC_LEVELS.city.reason).toContain("No general city-level case table");
    });
  });

  describe("Country Classification: Affected vs Medical Evacuation", () => {
    it("correctly classifies endemic/affected countries vs evacuation destinations", () => {
      const drc = classifyCountryStatus("COD");
      expect(drc.type).toBe("affected");
      expect(drc.includedInEpidemicTotal).toBe(true);

      const uganda = classifyCountryStatus("UGA");
      expect(uganda.type).toBe("affected");
      expect(uganda.includedInEpidemicTotal).toBe(true);

      const france = classifyCountryStatus("FRA");
      expect(france.type).toBe("medical-evacuation");
      expect(france.includedInEpidemicTotal).toBe(false);
      expect(france.note).toContain("evacuated");

      const germany = classifyCountryStatus("DEU");
      expect(germany.type).toBe("medical-evacuation");
      expect(germany.includedInEpidemicTotal).toBe(false);
      expect(germany.note).toContain("counted in DRC");
    });
  });

  describe("Source Precedence Policy", () => {
    it("defines unambiguous canonical and fallback sources per metric and geography", () => {
      const drcNational = getSourcePrecedenceForMetric("DRC", "national-totals");
      expect(drcNational.canonical).toBe("drc-insp-sitrep");
      expect(drcNational.fallbacks).toContain("who-acute-event");

      const drcProvince = getSourcePrecedenceForMetric("DRC", "province-totals");
      expect(drcProvince.canonical).toBe("drc-insp-sitrep");

      const drcHealthZone = getSourcePrecedenceForMetric("DRC", "health-zone-observations");
      expect(drcHealthZone.canonical).toBe("hdx-consolidated");
      expect(drcHealthZone.verificationSource).toBe("drc-insp-sitrep");

      const crossCountry = getSourcePrecedenceForMetric("GLOBAL", "country-reconciliation");
      expect(crossCountry.canonical).toBe("who-acute-event");
    });
  });

  describe("Fixture and Licensing Policy", () => {
    it("strictly prohibits committing raw Ministry PDFs to the repository", () => {
      expect(FIXTURE_LICENSING_POLICY.allowRawPdfCommit).toBe(false);
      expect(FIXTURE_LICENSING_POLICY.allowedFixtureFormats).toEqual([
        "json",
        "csv",
        "txt-synthetic",
      ]);
      expect(FIXTURE_LICENSING_POLICY.attributionRequired).toBe(true);
    });
  });
});

describe("Authoritative Source Fixtures & Data Integrity", () => {
  it("validates HDX package show fixture against configured identifiers", async () => {
    const fixture = (await import("./fixtures/hdx-package-show.json")).default;
    expect(fixture.result.name).toBe(HDX_CONFIG.packageId);
    const targetResource = fixture.result.resources.find((r) => r.id === HDX_CONFIG.resourceId);
    expect(targetResource).toBeDefined();
    expect(targetResource.format).toBe(HDX_CONFIG.expectedFormat);
  });

  it("verifies factual extraction fixture avoids raw PDF redistribution", async () => {
    const fixture = (await import("./fixtures/insp-sitrep-factual.json")).default;
    expect(fixture._licenseNote).toContain("Raw PDF is not redistributed");
    expect(fixture.nationalSummary.confirmedCases).toBeGreaterThan(6000);
    expect(fixture.provinces.length).toBe(6);
  });
});
