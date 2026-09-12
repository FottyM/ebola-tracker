import { test, expect } from "@playwright/test";

test.describe("Ebola Outbreak Tracker — E2E Behavioral Suite", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to local dev/SSR server
    await page.goto("/");
    // Wait for network idle and Leaflet map container
    await page.waitForSelector("#map.leaflet-container", { timeout: 10000 });
  });

  test("1. Core Page Load & SSR Metric Hydration", async ({ page }) => {
    // Page Title & Headings
    await expect(page).toHaveTitle(/Ebola Outbreak/i);
    await expect(page.locator(".panel-header h1")).toContainText(/Ebola Outbreak Tracker/i);

    // KPI Cards: ensure numbers are formatted and rendered
    const casesVal = page.locator(".stat-card.cases .value");
    await expect(casesVal).toBeVisible();
    await expect(casesVal).not.toBeEmpty();

    const deathsVal = page.locator(".stat-card.deaths .value");
    await expect(deathsVal).toBeVisible();
    await expect(deathsVal).not.toBeEmpty();

    const cfrSub = page.locator(".stat-card.deaths .sub");
    await expect(cfrSub).toContainText(/case fatality/i);

    const affectedCountriesVal = page.locator(".stat-card.cfr .value");
    await expect(affectedCountriesVal).toBeVisible();

    // Freshness & PHEIC badges
    await expect(page.locator(".pheic-badge")).toBeVisible();
    await expect(page.locator(".freshness-status-pill")).toBeVisible();
  });

  test("2. Epidemic Curve Chart & Timeline Modal Dialog", async ({ page }) => {
    // TanStack chart SVG container mounted
    const epiChart = page.locator("#epi-chart svg");
    await expect(epiChart).toBeVisible({ timeout: 5000 });

    // Open Timeline modal by clicking interactive chart card
    const openTimelineBtn = page.locator("#open-timeline-modal");
    await openTimelineBtn.click();

    const timelineDialog = page.locator("#timeline-dialog");
    await expect(timelineDialog).toHaveAttribute("open", "");

    // Large enlarged chart inside modal renders
    const modalChart = page.locator("#modal-timeline-chart svg");
    await expect(modalChart).toBeVisible({ timeout: 5000 });

    // Close via close button
    const closeBtn = page.locator("#close-timeline-modal");
    await closeBtn.click();
    await expect(timelineDialog).not.toHaveAttribute("open", "");
  });

  test("3. Total Cases Stat Card & Demographics Modal Dialog", async ({ page }) => {
    // Open Cases & Demographics modal by clicking Total Cases stat card
    const openCasesBtn = page.locator("#open-cases-modal");
    await openCasesBtn.click();

    const casesDialog = page.locator("#cases-dialog");
    await expect(casesDialog).toHaveAttribute("open", "");

    // Age distribution chart in modal
    const modalAgeChart = page.locator("#modal-cases-age-chart svg");
    await expect(modalAgeChart).toBeVisible({ timeout: 5000 });

    // Dismiss using Done button
    const doneBtn = page.locator("#cases-done-btn");
    await doneBtn.click();
    await expect(casesDialog).not.toHaveAttribute("open", "");

    // Open via Demographics section card
    const openDemoBtn = page.locator("#open-demographics-modal");
    await openDemoBtn.click();
    await expect(casesDialog).toHaveAttribute("open", "");

    // Close via modal close button
    const closeBtn = page.locator("#close-cases-modal");
    await closeBtn.click();
    await expect(casesDialog).not.toHaveAttribute("open", "");
  });

  test("4. Leaflet Map Custom Panes & Layer Stacking Integrity", async ({ page }) => {
    // Verify dedicated panes exist for strict z-index stacking
    // Note: Leaflet strips 'Pane' from the pane name to generate className: .leaflet-[name]-pane
    const worldPane = page.locator(".leaflet-worldCountries-pane");
    await expect(worldPane).toBeAttached();

    // Verify pointer-events is none on world background so it cannot capture focus or clicks
    const pointerEvents = await worldPane.evaluate(
      (el) => window.getComputedStyle(el).pointerEvents,
    );
    expect(pointerEvents).toBe("none");

    const bubblesPane = page.locator(".leaflet-bubbles-pane");
    await expect(bubblesPane).toBeAttached();

    // Verify bubbles pane has highest z-index among vector layers (500)
    const bubblesZ = await bubblesPane.evaluate((el) => window.getComputedStyle(el).zIndex);
    expect(Number(bubblesZ)).toBe(500);

    // Outbreak circle markers exist in bubblesPane
    const bubbles = bubblesPane.locator("path.leaflet-interactive");
    await expect(bubbles.first()).toBeVisible({ timeout: 8000 });
    const bubbleCount = await bubbles.count();
    expect(bubbleCount).toBeGreaterThan(5);
  });

  test("5. Clicking Outbreak Bubble Directly on Map Opens Stats Popup", async ({ page }) => {
    // Wait for bubbles to be ready in bubblesPane
    const bubbles = page.locator(".leaflet-bubbles-pane path.leaflet-interactive");
    await expect(bubbles.first()).toBeVisible({ timeout: 8000 });

    // Click the first outbreak bubble
    await bubbles.first().click({ force: true });

    // Leaflet popup card must open
    const popup = page.locator(".leaflet-popup").last();
    await expect(popup).toBeVisible({ timeout: 5000 });

    // Check popup internal stats card elements
    await expect(popup.locator(".popup-content h3")).toBeVisible();
    await expect(popup.locator(".popup-content .pop-province")).toBeVisible();
    await expect(popup.locator(".popup-content .pop-val.cases")).toBeVisible();
    await expect(popup.locator(".popup-content .pop-val.deaths")).toBeVisible();
    await expect(popup.locator(".popup-content .pop-val.cfr")).toBeVisible();
  });

  test("6. Clicking Sidebar Location Pans Map AND Automatically Displays Stats Popup", async ({
    page,
  }) => {
    // Find Germany / Charité item in sidebar
    const chariteItem = page.locator(".province-item", { hasText: "Charité" });
    await expect(chariteItem).toBeVisible();

    // Click it
    await chariteItem.click();

    // Verify Leaflet popup card appears automatically with Charité details
    const popup = page.locator(".leaflet-popup").last();
    await expect(popup).toBeVisible({ timeout: 6000 });
    await expect(popup.locator(".popup-content h3")).toContainText(/Germany/i);
    await expect(popup.locator(".popup-content .pop-province")).toContainText(
      /Medical Evacuation/i,
    );
    await expect(popup.locator(".popup-content .pop-note").first()).toContainText(
      /biocontainment/i,
    );

    // Now click Uganda / Bundibugyo in sidebar
    const bundibugyoItem = page.locator(".province-item", { hasText: "Bundibugyo" });
    await bundibugyoItem.click();

    // Verify latest popup switches to Bundibugyo details
    const activePopup = page.locator(".leaflet-popup").last();
    await expect(activePopup.locator(".popup-content h3")).toContainText(/Bundibugyo/i);
    await expect(activePopup.locator(".popup-content .pop-province")).toContainText(
      /Contained \/ Outbreak Over/i,
    );

    // Now click an active DRC epicenter in sidebar
    const epicenterItem = page.locator(".province-item", { hasText: "Nord-Kivu" }).first();
    await epicenterItem.click();

    // Verify popup switches to Nord-Kivu
    const epicPopup = page.locator(".leaflet-popup").last();
    await expect(epicPopup.locator(".popup-content h3")).toContainText(/Nord-Kivu/i);
    await expect(epicPopup.locator(".popup-content .pop-province")).toContainText(/Active/i);
  });

  test("7. Regression Guard: No Giant Square Focus Outline on Countries", async ({ page }) => {
    // Wait for world countries layer to be loaded
    const worldPane = page.locator(".leaflet-worldCountries-pane");
    await expect(worldPane).toBeAttached();

    // Click on open map space (beyond the 400px left sidebar)
    await page.locator("#map").click({ position: { x: 750, y: 350 }, force: true });

    // Verify no focused SVG element has an active outline ring
    const focusedOutline = await page.evaluate(() => {
      const active = document.activeElement;
      if (active && (active.tagName === "path" || active.tagName === "svg")) {
        return window.getComputedStyle(active).outline;
      }
      return "none";
    });
    expect(focusedOutline).toMatch(/none|0px/);
  });

  test("8. Responsive Mobile Bottom Sheet Toggle", async ({ page }) => {
    // Switch to mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    const toggle = page.locator("#panel-toggle");
    await expect(toggle).toBeVisible();

    const panel = page.locator(".info-panel");
    const isCollapsedInitially = await panel.evaluate((el) => el.classList.contains("collapsed"));

    // Toggle collapse
    await toggle.click();
    const isCollapsedAfterClick = await panel.evaluate((el) => el.classList.contains("collapsed"));
    expect(isCollapsedAfterClick).toBe(!isCollapsedInitially);

    // Toggle back
    await toggle.click();
    const isCollapsedFinal = await panel.evaluate((el) => el.classList.contains("collapsed"));
    expect(isCollapsedFinal).toBe(isCollapsedInitially);
  });
});
