import { describe, it, expect } from "vite-plus/test";
import fs from "node:fs";
import { parseMinistrySitrepText } from "../server/pipeline/parsers/sitrep-parser.js";
import { discoverMinistrySitreps } from "../server/pipeline/adapters/drc-ministry-adapter.js";
import { reconcileNationalWithProvinces } from "../server/pipeline/reconciliation.js";

describe("November Ministry PDF layouts", () => {
  for (const [file, cases, deaths, daily, recovered, zones] of [
    ["sitrep-185-2026-11-15.txt", 11432, 5593, 56, 3109, 68],
    ["sitrep-176-2026-11-06.txt", 10878, 5302, 76, 2919, 67],
  ]) {
    it(`reads summary cards and wrapped tables in ${file}`, () => {
      const text = fs.readFileSync(new URL(`./fixtures/sitrep/${file}`, import.meta.url), "utf8");
      const report = parseMinistrySitrepText(text);
      expect(report.valid).toBe(true);
      expect(report.national).toMatchObject({
        confirmedCases: cases,
        confirmedDeaths: deaths,
        newConfirmedCases: daily,
        recovered,
      });
      expect(report.provinces).toHaveLength(8);
      expect(report.healthZones).toHaveLength(zones);
      expect(reconcileNationalWithProvinces(report.national, report.provinces).conflicts).toEqual(
        [],
      );
      expect(report.healthZones.find((z) => z.name === "Tshopo").province).toBe("Tshopo");
      expect(report.healthZones.find((z) => z.name === "Yakoma").province).toBe("Nord-Ubangi");
    });
  }
  it("discovers historical filenames in embedded payloads without inventing missing dates", () => {
    const html = [
      "SitRep_MVE_RDC_N_169_30-10-2026.pdf",
      "SitRep-MVEBDB_178_08_11_26.pdf",
      "SitRep_MVEBDBD_184_14_11_2026.pdf",
      "SitRep_MVEBDB_182_12_11_2026-1.pdf",
    ]
      .map((name) => `https://administration.sante.gouv.cd/uploads/${name}`)
      .join(" ");
    expect(discoverMinistrySitreps(html).map((r) => r.reportingDate)).toEqual([
      "2026-11-14",
      "2026-11-12",
      "2026-11-08",
      "2026-10-30",
    ]);
  });
});

it.each([
  ["2026-11-01", 65, 67],
  ["2026-11-05", 62, 67],
  ["2026-11-12", 57, 68],
])(
  "bounds the health-zone table and reads authoritative daily totals on %s",
  (date, daily, zones) => {
    const report = parseMinistrySitrepText(
      fs.readFileSync(new URL(`./fixtures/sitrep/report-${date}.txt`, import.meta.url), "utf8"),
    );
    expect(report.valid).toBe(true);
    expect(report.reportingDate).toBe(date);
    expect(report.national.newConfirmedCases).toBe(daily);
    expect(report.healthZones).toHaveLength(zones);
    expect(report.healthZones.every((zone) => zone.name.length > 2)).toBe(true);
    expect(report.healthZones.find((zone) => zone.name === "Manguredjipa").province).toBe(
      "Nord-Kivu",
    );
    expect(report.healthZones.find((zone) => zone.name === "Yakoma").province).toBe("Nord-Ubangi");
  },
);
