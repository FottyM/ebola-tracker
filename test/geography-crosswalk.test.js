import { describe, it, expect } from "vite-plus/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HEALTH_ZONE_CROSSWALK_ENTRIES,
  REVIEWED_ALIASES,
  resolveHealthZone,
  generateGeographyArtifacts,
} from "../server/pipeline/geography/health-zone-crosswalk.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("DATA-011: Health-Zone Geography Crosswalk & Deterministic Points", () => {
  describe("Crosswalk Registry & Coverage", () => {
    it("contains all 61 active outbreak health zones without duplicates", () => {
      expect(HEALTH_ZONE_CROSSWALK_ENTRIES.length).toBe(61);

      const hdxCodes = new Set();
      const dhis2Ids = new Set();

      for (const entry of HEALTH_ZONE_CROSSWALK_ENTRIES) {
        expect(entry.hdxCode, `Missing hdxCode for ${entry.hdxName}`).toBeTruthy();
        expect(entry.hdxName).toBeTruthy();
        expect(entry.geometryName).toBeTruthy();
        expect(entry.province).toBeTruthy();
        expect(entry.provincePcode).toBeTruthy();
        expect(entry.dhis2Id).toBeTruthy();
        expect(entry.representativePoint).toHaveLength(2);
        expect(typeof entry.representativePoint[0]).toBe("number");
        expect(typeof entry.representativePoint[1]).toBe("number");

        // Uniqueness check
        expect(hdxCodes.has(entry.hdxCode), `Duplicate hdxCode: ${entry.hdxCode}`).toBe(false);
        expect(dhis2Ids.has(entry.dhis2Id), `Duplicate dhis2Id: ${entry.dhis2Id}`).toBe(false);

        hdxCodes.add(entry.hdxCode);
        dhis2Ids.add(entry.dhis2Id);
      }
    });

    it("verifies the four explicit reviewed aliases resolve to exact DHIS2 and province identities", () => {
      expect(REVIEWED_ALIASES).toBeDefined();

      const gethy = resolveHealthZone("Gethy");
      expect(gethy.geometryName).toBe("Gety");
      expect(gethy.province).toBe("Ituri");
      expect(gethy.dhis2Id).toBe("X8zFJ7DJlRD");

      const lubunga = resolveHealthZone("Lubunga");
      expect(lubunga.geometryName).toBe("Lubunga (Tshopo)");
      expect(lubunga.province).toBe("Tshopo");
      expect(lubunga.dhis2Id).toBe("I9d1F9TGn33");

      const mongbalu = resolveHealthZone("Mongbalu");
      expect(mongbalu.geometryName).toBe("Mongbwalu");
      expect(mongbalu.province).toBe("Ituri");
      expect(mongbalu.dhis2Id).toBe("nv8tx681Gjd");

      const nyakunde = resolveHealthZone("Nyakunde");
      expect(nyakunde.geometryName).toBe("Nyankunde");
      expect(nyakunde.province).toBe("Ituri");
      expect(nyakunde.dhis2Id).toBe("mGTaa8TFifO");
    });

    it("fails closed on unmapped, unknown, or fuzzy inputs without guessing", () => {
      expect(() => resolveHealthZone("UnknownZone")).toThrow("Unknown health zone");
      expect(() => resolveHealthZone("Bun")).toThrow("Unknown health zone");
      expect(() => resolveHealthZone("")).toThrow("Unknown health zone");
    });
  });

  describe("Representative Point Guardrails", () => {
    it("ensures every representative point lies within reasonable DRC bounding box", () => {
      for (const entry of HEALTH_ZONE_CROSSWALK_ENTRIES) {
        const [lat, lon] = entry.representativePoint;
        // DRC latitude approx -14 to +5.5, longitude approx 12 to 32
        expect(lat).toBeGreaterThan(-14);
        expect(lat).toBeLessThan(6);
        expect(lon).toBeGreaterThan(12);
        expect(lon).toBeLessThan(32);
      }
    });
  });

  describe("Artifact Generation & Idempotency", () => {
    it("generates deterministic crosswalk and point JSON files with zero drift", () => {
      const outputDir = path.resolve(__dirname, "../public/geography");
      generateGeographyArtifacts(outputDir);

      const crosswalkPath = path.join(outputDir, "health-zone-crosswalk.json");
      const pointsPath = path.join(outputDir, "health-zone-points.json");

      expect(fs.existsSync(crosswalkPath)).toBe(true);
      expect(fs.existsSync(pointsPath)).toBe(true);

      const crosswalkContent1 = fs.readFileSync(crosswalkPath, "utf-8");
      const pointsContent1 = fs.readFileSync(pointsPath, "utf-8");

      // Verify no 'city' label in output
      expect(crosswalkContent1).not.toContain('"city"');
      expect(pointsContent1).not.toContain('"city"');
      expect(pointsContent1).toContain('"healthZoneName"');

      // Re-run for idempotency check
      generateGeographyArtifacts(outputDir);
      const crosswalkContent2 = fs.readFileSync(crosswalkPath, "utf-8");
      const pointsContent2 = fs.readFileSync(pointsPath, "utf-8");

      expect(crosswalkContent1).toBe(crosswalkContent2);
      expect(pointsContent1).toBe(pointsContent2);
    });
  });
});
