import { test, expect } from "@playwright/test";
import snapshot from "../public/data/latest-snapshot.json" with { type: "json" };
import { createSnapshotFromObservations } from "../server/pipeline/contracts.js";

test("discovers a new country during background refresh and updates the map, sidebar, dialogs, and metadata", async ({
  page,
}) => {
  await page.route("https://cloud.umami.is/**", (route) => route.fulfill({ body: "" }));
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ body: "", contentType: "text/css" }),
  );
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('.province-item[data-country="KEN"]')).toHaveCount(1);
  await expect(page.locator('.province-item[data-country="NGA"]')).toHaveCount(1);
  await expect(page.locator('.province-item[data-country="FRA"]')).toHaveCount(1);
  await expect
    .poll(() => page.locator(".leaflet-worldCountries-pane path").count())
    .toBeGreaterThan(0);
  const markers = await page.locator(".leaflet-bubbles-pane path").count();
  const affected = await page
    .locator('.leaflet-worldCountries-pane path[stroke="#e5484d"]')
    .count();
  const row = {
    id: "BEN:National:2026-11-16",
    geographicPrecision: "country",
    country: { iso3: "BEN", name: "Benin" },
    province: null,
    healthZone: null,
    city: null,
    classification: "affected",
    metrics: { confirmedCases: 4, confirmedDeaths: 1, recovered: 0 },
    provenance: {
      sourceId: "who-acute-event",
      publisher: "WHO",
      sourceUrl: "https://www.who.int/emergencies/alert-and-response",
    },
    timestamps: {
      sourceUpdatedAt: "2026-11-16",
      publishedAt: null,
      fetchedAt: "2026-11-18T00:00:00Z",
    },
  };
  const next = createSnapshotFromObservations({
    snapshotId: "test-dynamic-country",
    observations: [...snapshot.observations, row],
    epiCurve: snapshot.epiCurve,
  });
  await page.route("**/data/manifest.json*", (route) =>
    route.fulfill({
      json: {
        schemaVersion: "2026-09-11",
        snapshotId: next.snapshotId,
        snapshotPath: "snapshots/test-dynamic-country.json",
      },
    }),
  );
  await page.route("**/data/snapshots/test-dynamic-country.json", (route) =>
    route.fulfill({ json: next }),
  );
  await page.evaluate(() => {
    window.__refreshSentinel = "retained";
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator('.province-item[data-country="BEN"]')).toHaveCount(1);
  await expect(page.locator(".stat-card.cfr .value")).toHaveText("6");
  await expect(page.locator(".leaflet-bubbles-pane path")).toHaveCount(markers + 1);
  await expect(page.locator('.leaflet-worldCountries-pane path[stroke="#e5484d"]')).toHaveCount(
    affected + 1,
  );
  expect(await page.evaluate(() => window.__refreshSentinel)).toBe("retained");
  const metadata = JSON.parse(
    await page.locator('script[type="application/ld+json"]').first().textContent(),
  );
  expect(
    metadata["@graph"][0].spatialCoverage.some((country) => country.identifier === "BEN"),
  ).toBe(true);
  await page.locator('.province-item[data-country="BEN"]').click();
  await expect(page.locator(".leaflet-popup-content")).toContainText("Benin");
  await expect(page.locator(".leaflet-popup-content .pop-val.cases")).toHaveText("4");
  await page.locator("#open-cases-modal").click();
  await expect(page.locator("#cases-dialog .dialog-kpi").nth(3).locator(".kpi-number")).toHaveText(
    "6",
  );
  await expect(page.locator("#modal-cases-age-chart svg")).toHaveCount(0);
  await page.locator("#cases-done-btn").click();
  await page.locator('.lang-btn[data-lang="fr"]').click();
  await expect(page.locator('.province-item[data-country="BEN"]')).toContainText("Bénin");
  expect(errors).toEqual([]);
});
