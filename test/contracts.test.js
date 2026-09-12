import { describe, it, expect } from "vite-plus/test";
import {
  validateNormalizedObservation,
  validateOutbreakSnapshot,
  createSnapshotFromObservations,
  mapSnapshotToLegacyState,
} from "../server/pipeline/contracts.js";

describe("DATA-002: Normalized Observations and Snapshot Contract", () => {
  const validProvenance = {
    sourceId: "hdx-consolidated",
    publisher: "UN OCHA HDX",
    sourceUrl: "https://data.humdata.org/dataset/e902b209-b7bc-42f9-893a-294276d7cc62",
    recordIdentifier: "CD540201-20260908",
  };

  const validTimestamps = {
    sourceUpdatedAt: "2026-09-08",
    publishedAt: "2026-09-09T06:00:00.000Z",
    fetchedAt: "2026-09-11T12:00:00.000Z",
  };

  describe("Observation Validation", () => {
    it("accepts a fully compliant health-zone observation", () => {
      const observation = {
        id: "COD:Ituri:Bunia:2026-09-08",
        geographicPrecision: "health-zone",
        country: { iso3: "COD", name: "Democratic Republic of the Congo" },
        province: { name: "Ituri", pcode: "CD54" },
        healthZone: { name: "Bunia", pcode: "CD540201", dhis2Id: "GPi6i83o7l6" },
        city: null, // explicit nullability
        metrics: {
          confirmedCases: 1420,
          confirmedDeaths: 612,
          recovered: 350,
          unallocatedDeaths: 0,
        },
        provenance: validProvenance,
        timestamps: validTimestamps,
        classification: "affected",
      };

      const result = validateNormalizedObservation(observation);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects observations with negative counts", () => {
      const observation = {
        id: "COD:Ituri:Bunia:2026-09-08",
        geographicPrecision: "health-zone",
        country: { iso3: "COD", name: "Democratic Republic of the Congo" },
        province: { name: "Ituri", pcode: "CD54" },
        healthZone: { name: "Bunia", pcode: "CD540201" },
        city: null,
        metrics: {
          confirmedCases: -5,
          confirmedDeaths: 10,
        },
        provenance: validProvenance,
        timestamps: validTimestamps,
        classification: "affected",
      };

      const result = validateNormalizedObservation(observation);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("negative"))).toBe(true);
    });

    it("rejects observation claiming city precision without authoritative source", () => {
      const observation = {
        id: "COD:Ituri:Bunia-City:2026-09-08",
        geographicPrecision: "city",
        country: { iso3: "COD", name: "Democratic Republic of the Congo" },
        province: { name: "Ituri" },
        city: "Bunia",
        metrics: { confirmedCases: 100, confirmedDeaths: 20 },
        provenance: validProvenance,
        timestamps: validTimestamps,
        classification: "affected",
      };

      const result = validateNormalizedObservation(observation);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("city"))).toBe(true);
    });

    it("rejects observations with missing provenance", () => {
      const observation = {
        id: "COD:Ituri:2026-09-08",
        geographicPrecision: "province",
        country: { iso3: "COD", name: "Democratic Republic of the Congo" },
        province: { name: "Ituri" },
        city: null,
        metrics: { confirmedCases: 5461, confirmedDeaths: 2481 },
        provenance: null, // missing!
        timestamps: validTimestamps,
        classification: "affected",
      };

      const result = validateNormalizedObservation(observation);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("provenance"))).toBe(true);
    });

    it("enforces separation of sourceUpdatedAt, publishedAt, and fetchedAt", () => {
      const observation = {
        id: "COD:National:2026-09-09",
        geographicPrecision: "country",
        country: { iso3: "COD", name: "Democratic Republic of the Congo" },
        province: null,
        healthZone: null,
        city: null,
        metrics: { confirmedCases: 6942, confirmedDeaths: 3349 },
        provenance: validProvenance,
        timestamps: {
          sourceUpdatedAt: "2026-09-09",
          // missing publishedAt and fetchedAt
        },
        classification: "affected",
      };

      const result = validateNormalizedObservation(observation);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("timestamps"))).toBe(true);
    });
  });

  describe("Snapshot Contract & Aggregation", () => {
    it("creates a valid snapshot from normalized observations and computes unallocated counts", () => {
      const observations = [
        {
          id: "COD:Ituri:Bunia:2026-09-08",
          geographicPrecision: "health-zone",
          country: { iso3: "COD", name: "Democratic Republic of the Congo" },
          province: { name: "Ituri" },
          healthZone: { name: "Bunia", pcode: "CD540201" },
          city: null,
          metrics: { confirmedCases: 5000, confirmedDeaths: 2000 },
          provenance: validProvenance,
          timestamps: validTimestamps,
          classification: "affected",
        },
        {
          id: "UGA:Bundibugyo:2026-08-25",
          geographicPrecision: "province",
          country: { iso3: "UGA", name: "Uganda" },
          province: { name: "Bundibugyo" },
          healthZone: null,
          city: null,
          metrics: { confirmedCases: 20, confirmedDeaths: 2 },
          provenance: validProvenance,
          timestamps: validTimestamps,
          classification: "affected",
        },
        {
          id: "FRA:Paris:2026-06-12",
          geographicPrecision: "country",
          country: { iso3: "FRA", name: "France" },
          province: null,
          healthZone: null,
          city: null,
          metrics: { confirmedCases: 1, confirmedDeaths: 0 },
          provenance: validProvenance,
          timestamps: validTimestamps,
          classification: "medical-evacuation",
        },
      ];

      const snapshot = createSnapshotFromObservations({
        snapshotId: "snapshot-2026-09-11-001",
        status: "current",
        scheduledCadenceMinutes: 30,
        observations,
      });

      const validation = validateOutbreakSnapshot(snapshot);
      expect(validation.valid).toBe(true);

      // France must NOT be summed into global total cases because it's medical-evacuation
      expect(snapshot.summary.totalCases).toBe(5020);
      expect(snapshot.summary.totalDeaths).toBe(2002);
      expect(snapshot.summary.affectedCountriesCount).toBe(2); // COD and UGA only
      expect(snapshot.status).toBe("current");
      expect(snapshot.scheduledCadenceMinutes).toBe(30);
    });

    it("maps a normalized snapshot seamlessly to existing UI legacy state contract", () => {
      const observations = [
        {
          id: "COD:Ituri:Bunia:2026-09-08",
          geographicPrecision: "health-zone",
          country: { iso3: "COD", name: "Democratic Republic of the Congo" },
          province: { name: "Ituri" },
          healthZone: { name: "Bunia", pcode: "CD540201" },
          city: null,
          metrics: { confirmedCases: 5461, confirmedDeaths: 2481 },
          provenance: validProvenance,
          timestamps: validTimestamps,
          classification: "affected",
        },
      ];

      const snapshot = createSnapshotFromObservations({
        snapshotId: "snapshot-2026-09-11-002",
        status: "current",
        scheduledCadenceMinutes: 30,
        observations,
      });

      const legacyState = mapSnapshotToLegacyState(snapshot);
      expect(legacyState.summary.totalCases).toBe(5461);
      expect(legacyState.summary.totalDeaths).toBe(2481);
      expect(legacyState.locations.length).toBeGreaterThan(0);
      expect(legacyState.locations[0].region).toBe("Bunia");
      expect(legacyState.locations[0].cases).toBe(5461);
      expect(legacyState.locations[0].center).toEqual([1.56, 30.25]);
    });

    it("resolves authentic distinct centroids and preserves international locations and notes", () => {
      const observations = [
        {
          id: "COD:National:2026-09-09",
          geographicPrecision: "country",
          country: { iso3: "COD", name: "Democratic Republic of the Congo" },
          province: null,
          healthZone: null,
          city: null,
          metrics: { confirmedCases: 7022, confirmedDeaths: 3398 },
          provenance: validProvenance,
          timestamps: validTimestamps,
          classification: "affected",
        },
        {
          id: "COD:Ituri:2026-09-09",
          geographicPrecision: "province",
          country: { iso3: "COD", name: "Democratic Republic of the Congo" },
          province: { name: "Ituri" },
          healthZone: null,
          city: null,
          metrics: { confirmedCases: 5538, confirmedDeaths: 2524 },
          provenance: validProvenance,
          timestamps: validTimestamps,
          classification: "affected",
        },
        {
          id: "COD:Nord-Kivu:Beni:2026-09-08",
          geographicPrecision: "health-zone",
          country: { iso3: "COD", name: "Democratic Republic of the Congo" },
          province: { name: "Nord-Kivu" },
          healthZone: { name: "Beni", pcode: "CD620101" },
          city: null,
          metrics: { confirmedCases: 195, confirmedDeaths: 145 },
          provenance: validProvenance,
          timestamps: validTimestamps,
          classification: "affected",
        },
        {
          id: "UGA:Bundibugyo:2026-08-25",
          geographicPrecision: "province",
          country: { iso3: "UGA", name: "Uganda" },
          province: { name: "Bundibugyo District (Border)" },
          healthZone: null,
          city: null,
          metrics: { confirmedCases: 18, confirmedDeaths: 2 },
          provenance: validProvenance,
          timestamps: validTimestamps,
          classification: "affected",
          representativePoint: [0.71, 30.06],
          note: "Index cross-border cluster. Declared officially over by WHO on 25 August 2026.",
        },
        {
          id: "FRA:Paris:2026-06-12",
          geographicPrecision: "country",
          country: { iso3: "FRA", name: "France" },
          province: { name: "Paris (Military Hospital Bégin)" },
          healthZone: null,
          city: null,
          metrics: { confirmedCases: 1, confirmedDeaths: 0 },
          provenance: validProvenance,
          timestamps: validTimestamps,
          classification: "medical-evacuation",
          representativePoint: [48.8566, 2.3522],
          note: "Humanitarian healthcare worker evacuated under high-level biocontainment.",
        },
        {
          id: "DEU:Berlin:2026-07-04",
          geographicPrecision: "country",
          country: { iso3: "DEU", name: "Germany" },
          province: { name: "Frankfurt / Berlin (Charité)" },
          healthZone: null,
          city: null,
          metrics: { confirmedCases: 1, confirmedDeaths: 0 },
          provenance: validProvenance,
          timestamps: validTimestamps,
          classification: "medical-evacuation",
          representativePoint: [52.52, 13.405],
          note: "Specialized clinical evacuation under biocontainment.",
        },
      ];

      const snapshot = createSnapshotFromObservations({
        snapshotId: "snapshot-test-centroids",
        observations,
      });

      const legacy = mapSnapshotToLegacyState(snapshot);

      // Redundant COD:National is omitted because subnational observations exist
      expect(legacy.locations.some((l) => l.region === "Democratic Republic of the Congo")).toBe(
        false,
      );

      // Ituri province centroid is resolved
      const ituriLoc = legacy.locations.find((l) => l.region === "Ituri");
      expect(ituriLoc).toBeDefined();
      expect(ituriLoc.center).toEqual([1.7, 29.9]);

      // Beni health zone centroid is resolved via crosswalk
      const beniLoc = legacy.locations.find((l) => l.region === "Beni");
      expect(beniLoc).toBeDefined();
      expect(beniLoc.center).toEqual([0.49, 29.47]);

      // Uganda location is present with Contained status and note
      const ugaLoc = legacy.locations.find((l) => l.countryCode === "UGA");
      expect(ugaLoc).toBeDefined();
      expect(ugaLoc.status).toBe("Contained / Outbreak Over");
      expect(ugaLoc.center).toEqual([0.71, 30.06]);
      expect(ugaLoc.note).toContain("Declared officially over");

      // France location is present with Medical Evacuation status and note
      const fraLoc = legacy.locations.find((l) => l.countryCode === "FRA");
      expect(fraLoc).toBeDefined();
      expect(fraLoc.status).toBe("Medical Evacuation (Contained)");
      expect(fraLoc.center).toEqual([48.8566, 2.3522]);
      expect(fraLoc.note).toContain("biocontainment");

      // Germany location is present with Medical Evacuation status and note
      const deuLoc = legacy.locations.find((l) => l.countryCode === "DEU");
      expect(deuLoc).toBeDefined();
      expect(deuLoc.status).toBe("Medical Evacuation (Contained)");
      expect(deuLoc.center).toEqual([52.52, 13.405]);
      expect(deuLoc.note).toContain("biocontainment");
    });
  });
});
