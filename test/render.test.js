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
    expect(initialState).toContain(String(defaultOutbreakData.summary.totalCases));
  });

  it("renders sourced Ebola symptoms and locally relevant look-alike illnesses", () => {
    const { appHtml } = render(defaultOutbreakData);

    expect(appHtml).toContain('id="open-symptoms-modal"');
    expect(appHtml).toContain('id="symptoms-dialog"');
    expect(appHtml).toContain('id="close-symptoms-modal"');
    expect(appHtml).toContain('id="symptoms-done-btn"');
    expect(appHtml).toContain('<button type="button" class="symptoms-card"');
    expect(appHtml).toContain('<button type="button" class="dialog-close-btn"');
    expect(appHtml).toContain(
      '<button type="button" class="dialog-action-btn" id="symptoms-done-btn"',
    );
    expect(appHtml).toContain("Early symptoms");
    expect(appHtml).toContain("Later symptoms");
    expect(appHtml).toContain("Malaria");
    expect(appHtml).toContain("Typhoid fever");
    expect(appHtml).toContain("Meningitis");
    expect(appHtml).toContain("Shigellosis");
    expect(appHtml).toContain("Marburg virus disease");
    expect(appHtml).toContain("Bleeding is not always present");
    expect(appHtml).toContain("Symptoms alone cannot diagnose Ebola");
    expect(appHtml).toContain("Call ahead if possible");
    expect(appHtml).toContain("https://www.who.int/news-room/fact-sheets/detail/ebola-disease");
    expect(appHtml).toContain("https://www.cdc.gov/ebola/signs-symptoms/index.html");
  });
});
