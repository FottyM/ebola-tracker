import { describe, it, expect } from "vite-plus/test";
import {
  parseWhoAcuteEventTable,
  parseUgandaOutbreakStatus,
  parseFranceEvacuationStatus,
  parseGermanyEvacuationStatus,
} from "../server/pipeline/adapters/international-adapters.js";

describe("DATA-005: International & National Authority Adapters", () => {
  describe("WHO Acute Event Table Adapter", () => {
    it("parses WHO table and extracts official cross-country status and reporting date", () => {
      const sampleWhoData = {
        eventName: "Ebola disease (Bundibugyo ebolavirus) - DRC & Regional",
        referenceDate: "2026-09-09",
        countries: [
          { iso3: "COD", cases: 6942, deaths: 3349, status: "Active Epicenter" },
          { iso3: "UGA", cases: 20, deaths: 2, status: "Declared Over" },
          { iso3: "FRA", cases: 1, deaths: 0, status: "Medical Evacuation" },
        ],
      };

      const result = parseWhoAcuteEventTable(sampleWhoData);
      expect(result.valid).toBe(true);
      expect(result.countries).toHaveLength(3);
      expect(result.affectedCountries).toHaveLength(2); // COD, UGA only
      expect(result.evacuations).toHaveLength(1); // FRA
    });
  });

  describe("Uganda National Authority Adapter", () => {
    it("verifies Uganda containment status and 42-day milestone declaration", () => {
      const sampleUgandaHtml = `
        <div class="evd-status">
          <h1>Ebola Response Update</h1>
          <p class="declaration">Outbreak officially declared over on 25 August 2026 following 42 consecutive days with zero transmission.</p>
          <span class="stat">Cumulative Cases: 20</span>
          <span class="stat">Confirmed Fatalities: 2</span>
        </div>
      `;

      const result = parseUgandaOutbreakStatus(sampleUgandaHtml);
      expect(result.valid).toBe(true);
      expect(result.cases).toBe(20);
      expect(result.deaths).toBe(2);
      expect(result.isDeclaredOver).toBe(true);
      expect(result.declarationDate).toBe("2026-08-25");
    });
  });

  describe("France & Germany Evacuation Adapters", () => {
    it("verifies France medical evacuation and confirms zero secondary cases", () => {
      const sampleFranceHtml = `<p>Un travailleur humanitaire évacué d'Ituri a été pris en charge à l'Hôpital militaire Bégin. Aucun cas secondaire.</p>`;
      const result = parseFranceEvacuationStatus(sampleFranceHtml);
      expect(result.valid).toBe(true);
      expect(result.cases).toBe(1);
      expect(result.hospital).toBe("Hôpital militaire Bégin");
      expect(result.secondaryCases).toBe(0);
    });

    it("verifies Germany clinical care and confirms case origin belongs to DRC", () => {
      const sampleGermanyText =
        "Two medical workers evacuated under high-level biocontainment to Charité Berlin. Cases are attributed to DRC origin.";
      const result = parseGermanyEvacuationStatus(sampleGermanyText);
      expect(result.valid).toBe(true);
      expect(result.casesCountedInOrigin).toBe(true);
    });
  });
});
