import { describe, expect, it } from "vite-plus/test";
import {
  buildProvinceLookup,
  getProvinceFallbackStyle,
  normalizeProvinceName,
} from "../src/pipeline/map-boundary-styles.js";
import { mapSnapshotToLegacyState } from "../server/pipeline/contracts.js";
import latestSnapshot from "../public/data/latest-snapshot.json";
import drcProvinces from "../src/data/drc-provinces.json";

describe("DRC province boundary presentation", () => {
  it("keeps unmatched province dividers visible on the dark map", () => {
    expect(getProvinceFallbackStyle()).toEqual({
      color: "#94a3b8",
      weight: 1.4,
      opacity: 0.85,
      fillColor: "transparent",
      fillOpacity: 0,
    });
  });

  it("colours provinces from the current health-zone observations when the SitRep table is absent", () => {
    const locations = mapSnapshotToLegacyState(latestSnapshot).locations;
    const lookup = buildProvinceLookup(locations);
    const shapeNames = drcProvinces.features.map((feature) => feature.properties.shapeName);
    const coloured = shapeNames.filter(
      (name) => lookup.get(normalizeProvinceName(name))?.cases > 0,
    );

    expect(
      latestSnapshot.observations.some(
        (observation) =>
          observation.country?.iso3 === "COD" && observation.geographicPrecision === "province",
      ),
    ).toBe(false);
    expect(coloured).toContain("Ituri");
    expect(coloured).toContain("North Kivu");
    expect(coloured).toContain("Upper Uele");
    expect(lookup.get(normalizeProvinceName("North Kivu")).partial).toBe(true);
  });

  it("uses authoritative province totals instead of adding the same health zones twice", () => {
    const lookup = buildProvinceLookup([
      {
        countryCode: "COD",
        region: "Bunia",
        province: "Ituri",
        geographicPrecision: "health-zone",
        cases: 20,
        deaths: 2,
      },
      {
        countryCode: "COD",
        region: "Ituri",
        province: "Ituri",
        geographicPrecision: "province",
        cases: 100,
        deaths: 10,
      },
    ]);
    expect(lookup.get("ituri").cases).toBe(100);
    expect(lookup.get("ituri").partial).toBe(false);
  });
});
