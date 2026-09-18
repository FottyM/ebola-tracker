import { test, expect } from "@playwright/test";
import snapshot from "../public/data/latest-snapshot.json" with { type: "json" };
import provinces from "../src/data/drc-provinces.json" with { type: "json" };

for (const locale of ["en", "fr"]) {
  test(`hydrates the ${locale} page snapshot and paints province polygons`, async ({ page }) => {
    // Analytics must not delay the page's deferred scripts in a browser test.
    await page.route("https://cloud.umami.is/**", (route) => route.fulfill({ body: "" }));
    await page.route("https://fonts.googleapis.com/**", (route) =>
      route.fulfill({ body: "", contentType: "text/css" }),
    );
    let url = "/";
    if (locale === "fr") {
      url = "/fr/";
    }
    await page.goto(url, { waitUntil: "domcontentloaded" });

    const embedded = await page.locator("#ssr-state-data").textContent();
    expect(JSON.parse(embedded).snapshotId).toBe(snapshot.snapshotId);
    expect(await page.evaluate(() => window.__INITIAL_DATA__.snapshotId)).toBe(snapshot.snapshotId);

    const paths = page.locator(".leaflet-provinces-pane path");
    await expect(paths).toHaveCount(provinces.features.length);
    for (const name of ["Ituri", "North Kivu"]) {
      const index = provinces.features.findIndex(
        (feature) => feature.properties.shapeName === name,
      );
      await expect(paths.nth(index)).toHaveAttribute("fill", "#e5484d");
      await expect(paths.nth(index)).toHaveAttribute("stroke", "#e5484d");
      await expect(paths.nth(index)).toHaveAttribute("fill-opacity", "0.32");
    }
    const kinshasa = provinces.features.findIndex(
      (feature) => feature.properties.shapeName === "Kinshasa",
    );
    await expect(paths.nth(kinshasa)).toHaveAttribute("fill", "transparent");
    await page.screenshot({ path: `test-results/province-map-${locale}.png` });
  });
}
