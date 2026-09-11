import { describe, it, expect } from "vite-plus/test";
import { render } from "../src/entry-server.js";
import defaultOutbreakData from "../src/data/outbreak-data.js";

describe("Outbreak Data and SSR Generator", () => {
  it("has valid default outbreak data", () => {
    expect(defaultOutbreakData.summary.totalCases).toBeGreaterThan(0);
    expect(defaultOutbreakData.locations.length).toBeGreaterThan(0);
  });

  it("renders pre-rendered HTML and JSON-LD successfully", () => {
    const { appHtml, jsonLd, initialState } = render(defaultOutbreakData);
    expect(appHtml).toContain('id="map"');
    expect(appHtml).toContain("Ebola Outbreak Tracker");
    expect(jsonLd).toContain("SpecialAnnouncement");
    expect(initialState).toContain("6843");
  });
});
