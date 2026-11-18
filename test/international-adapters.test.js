import { describe, it, expect } from "vite-plus/test";
import fs from "node:fs";
import {
  parseWhoCountryHtml,
  fetchWhoCountryObservations,
  parseWhoAcuteEventTable,
} from "../server/pipeline/adapters/international-adapters.js";
import {
  createSnapshotFromObservations,
  mapSnapshotToLegacyState,
} from "../server/pipeline/contracts.js";
const html = fs.readFileSync(new URL("./fixtures/who-country-table.html", import.meta.url), "utf8");
const fetchFn = async () => ({ ok: true, text: async () => html });

describe("Live WHO country table", () => {
  it("discovers all reported countries, preserving per-row dates and counting France", async () => {
    const report = parseWhoCountryHtml(html);
    expect(report.affectedCountries).toEqual(["COD", "UGA", "FRA", "KEN", "NGA"]);
    expect(report.countries.find((row) => row.iso3 === "UGA").reportingDate).toBe("2026-07-21");
    const observations = await fetchWhoCountryObservations({ fetchFn });
    const snapshot = createSnapshotFromObservations({ snapshotId: "live-who", observations });
    expect(snapshot.summary).toMatchObject({
      totalCases: 11407,
      totalDeaths: 5572,
      affectedCountriesCount: 5,
    });
    const locations = mapSnapshotToLegacyState(snapshot).locations;
    expect(locations.find((row) => row.countryCode === "KEN").center).not.toEqual([1.56, 30.25]);
    expect(locations.find((row) => row.countryCode === "UGA").status).not.toContain("Over");
    expect(locations.find((row) => row.countryCode === "FRA").classification).toBe("affected");
    expect(observations.every((row) => row.provenance.sourceUrl.includes("who.int"))).toBe(true);
  });
  it("automatically includes a newly reported country with no outbreak-code changes", () => {
    const row =
      "<tr><td>Benin</td><td>-</td><td>4</td><td>1</td><td>-</td><td>-</td><td>25%</td><td>0</td></tr>";
    const extra = html
      .replace("<!-- Total -->", row + "<!-- Total -->")
      .replace("11 407", "11 411")
      .replace("5 572", "5 573");
    const report = parseWhoCountryHtml(extra);
    expect(report.countries.find((row) => row.iso3 === "BEN")).toMatchObject({
      cases: 4,
      deaths: 1,
      classification: "affected",
    });
  });
  it("rejects missing, duplicate, malformed, unknown, and inconsistent country rows", () => {
    expect(() => parseWhoCountryHtml("no source table")).toThrow();
    expect(() => parseWhoCountryHtml(html.replace(/Nigeria/g, "Unknownland"))).toThrow(/country/);
    expect(() => parseWhoCountryHtml(html.replace(/Nigeria/g, "Kenya"))).toThrow(/Duplicate/);
    expect(() => parseWhoCountryHtml(html.replace("11 407", "11 408"))).toThrow(/reconcile/);
    expect(() => parseWhoCountryHtml(html.replace(">9</span>", ">N/A</span>"))).toThrow(/count/);
    expect(() =>
      parseWhoCountryHtml(html.replace("Data as of 14 November 2026", "Date missing")),
    ).toThrow(/date|column/);
  });
  it("classifies evacuation destinations from evidence, irrespective of ISO code", () => {
    const report = parseWhoAcuteEventTable({
      countries: [
        { iso3: "FRA", cases: 1, deaths: 0, status: "affected" },
        { iso3: "KEN", cases: 1, deaths: 0, status: "medical-evacuation" },
      ],
    });
    expect(report.affectedCountries).toEqual(["FRA"]);
    expect(report.evacuations).toEqual(["KEN"]);
  });
  it("fails visibly when WHO is unavailable", async () => {
    await expect(
      fetchWhoCountryObservations({ fetchFn: async () => ({ ok: false, status: 503 }) }),
    ).rejects.toThrow("503");
  });
});

it("does not infer active transmission or an outbreak declaration from cumulative counts", async () => {
  const observations = await fetchWhoCountryObservations({ fetchFn });
  const latest = createSnapshotFromObservations({ snapshotId: "statuses", observations });
  const countries = mapSnapshotToLegacyState(latest).locations;
  expect(countries.find((row) => row.countryCode === "COD").status).toBe(
    "Confirmed cases reported",
  );
  expect(
    countries.every(
      (row) => !row.status.includes("Outbreak Over") && !row.status.includes("Active Transmission"),
    ),
  ).toBe(true);
  expect(observations.every((row) => row.timestamps.publishedAt === null)).toBe(true);
});
