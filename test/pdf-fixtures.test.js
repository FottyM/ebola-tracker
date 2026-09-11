import { describe, it, expect } from "vite-plus/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseMinistrySitrepText } from "../server/pipeline/parsers/sitrep-parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("DATA-012: Licensing-Safe PDF Extraction Fixtures", () => {
  describe("Repository Safety", () => {
    it("guarantees no binary PDF files are stored in the test fixtures directory", () => {
      const fixturesDir = path.resolve(__dirname, "fixtures");
      function scanDir(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else {
            expect(entry.name.endsWith(".pdf"), `Forbidden PDF file found: ${entry.name}`).toBe(
              false,
            );
          }
        }
      }
      scanDir(fixturesDir);
    });
  });

  describe("Synthetic Fixture Extraction & Edge Cases", () => {
    it("correctly extracts SitRep 118 (9 Sept) with decimal commas, French accents, and split names", () => {
      const fixtureText = fs.readFileSync(
        path.resolve(__dirname, "fixtures/sitrep/sitrep-118-2026-09-09.txt"),
        "utf-8",
      );

      const parsed = parseMinistrySitrepText(fixtureText);
      expect(parsed.valid).toBe(true);
      expect(parsed.reportNumber).toBe(118);
      expect(parsed.reportingDate).toBe("2026-09-09");
      expect(parsed.national.confirmedCases).toBe(6942);
      expect(parsed.national.confirmedDeaths).toBe(3349);
      expect(parsed.national.recovered).toBe(1647);
      expect(parsed.national.cfr).toBe("48.2%");
      expect(parsed.provinces).toHaveLength(6);

      const ituri = parsed.provinces.find((p) => p.name === "Ituri");
      expect(ituri).toBeDefined();
      expect(ituri.cases).toBe(5542);
      expect(ituri.deaths).toBe(2511);

      // Verify unallocated deaths handling (A ventiler)
      expect(parsed.hasUnallocatedValues).toBe(true);
    });

    it("correctly extracts SitRep 117 (8 Sept) matching the 6,843 cases baseline", () => {
      const fixtureText = fs.readFileSync(
        path.resolve(__dirname, "fixtures/sitrep/sitrep-117-2026-09-08.txt"),
        "utf-8",
      );

      const parsed = parseMinistrySitrepText(fixtureText);
      expect(parsed.valid).toBe(true);
      expect(parsed.reportingDate).toBe("2026-09-08");
      expect(parsed.national.confirmedCases).toBe(6843);
      expect(parsed.national.confirmedDeaths).toBe(3310);
    });

    it("fails closed on malformed or format-drifted text fixture", () => {
      const malformedText = fs.readFileSync(
        path.resolve(__dirname, "fixtures/sitrep/sitrep-malformed-drift.txt"),
        "utf-8",
      );

      const parsed = parseMinistrySitrepText(malformedText);
      expect(parsed.valid).toBe(false);
      expect(parsed.errors.length).toBeGreaterThan(0);
      expect(parsed.errors.some((e) => e.includes("Format drift") || e.includes("Missing"))).toBe(
        true,
      );
    });
  });
});
