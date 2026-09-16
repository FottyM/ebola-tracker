import { chromium } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const screenshotsDir = path.resolve(rootDir, "docs/screenshots");

fs.mkdirSync(screenshotsDir, { recursive: true });

async function capture() {
  const browser = await chromium.launch({ headless: true });

  // 1. Desktop French Overview
  {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    console.log("Loading http://localhost:3000/fr for desktop overview...");
    await page.goto("http://localhost:3000/fr", { waitUntil: "networkidle" });
    await page.waitForSelector("#map.leaflet-container", { timeout: 10000 });
    // Allow tiles, fonts, and chart canvas to settle
    await page.waitForTimeout(2500);

    const desktopPath = path.join(screenshotsDir, "ebola-tracker-french-overview.png");
    await page.screenshot({ path: desktopPath });
    console.log(`Saved: ${desktopPath}`);
    await page.close();
  }

  // 2. Desktop French Demographics / Case Breakdown Modal Dialog
  {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    console.log("Loading http://localhost:3000/fr for modal dialog...");
    await page.goto("http://localhost:3000/fr", { waitUntil: "networkidle" });
    await page.waitForSelector("#open-cases-modal", { timeout: 10000 });
    await page.waitForTimeout(1000);

    await page.click("#open-cases-modal");
    await page.waitForSelector("#cases-dialog[open]", { timeout: 5000 });
    await page.waitForTimeout(1500);

    const modalPath = path.join(screenshotsDir, "ebola-tracker-french-modal.png");
    await page.screenshot({ path: modalPath });
    console.log(`Saved: ${modalPath}`);
    await page.close();
  }

  // 3. Mobile French Overview (iPhone 14 / modern viewport)
  {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
    });
    console.log("Loading http://localhost:3000/fr for mobile overview...");
    await page.goto("http://localhost:3000/fr", { waitUntil: "networkidle" });
    await page.waitForSelector("#map.leaflet-container", { timeout: 10000 });
    await page.waitForTimeout(2000);

    const mobilePath = path.join(screenshotsDir, "ebola-tracker-french-mobile.png");
    await page.screenshot({ path: mobilePath });
    console.log(`Saved: ${mobilePath}`);
    await page.close();
  }

  await browser.close();
  console.log("All screenshots captured successfully!");
}

capture().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
