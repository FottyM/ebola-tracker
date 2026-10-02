import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runOutbreakSync } from "../server/pipeline/sync-outbreak.js";
import { fetchLatestMinistrySitrepPdf } from "../server/pipeline/adapters/drc-ministry-adapter.js";
import { fetchWhoWeeklyCurve } from "../server/pipeline/adapters/who-weekly-adapter.js";
import {
  fetchLatestHdxFeed,
  parseHdxConsolidatedCsv,
} from "../server/pipeline/adapters/hdx-adapter.js";
import { getPrerenderData } from "../server/pipeline/prerender-loader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetFile = path.resolve(__dirname, "../src/data/outbreak-data.js");
const storageDir = path.resolve(__dirname, "../public/data");
const baselineHdxPath = path.resolve(__dirname, "../server/pipeline/data/baseline-hdx.csv");

/** Fetch only live Ministry data; fallback is handled at the snapshot boundary. */
async function resolveDrcSitrep() {
  console.log("📡 [DRC Ministry] Checking official portal...");
  const report = await fetchLatestMinistrySitrepPdf({ timeoutMs: 25000 });
  if (report?.valid)
    console.log(
      `✅ [DRC Ministry] Parsed SitRep #${report.reportNumber} (${report.reportingDate})`,
    );
  return report;
}

async function resolveWhoWeeklyCurve() {
  console.log("📡 [WHO AFRO] Checking authoritative weekly Ebola bulletins...");
  try {
    const curve = await fetchWhoWeeklyCurve({ timeoutMs: 25000 });
    console.log(`✅ [WHO AFRO] Parsed ${curve.length} authoritative weekly curve points.`);
    return curve;
  } catch (err) {
    console.warn(
      `⚠️ [WHO AFRO] Weekly curve unavailable (${err instanceof Error ? err.message : String(err)}).`,
    );
    return [];
  }
}

/**
 * Resolves UN OCHA HDX consolidated health-zone observations via live download or local cache.
 */
async function resolveHdxFeed(dryRun = false) {
  console.log("📡 [OCHA HDX] Checking consolidated health-zone feed...");
  try {
    const hdxRes = await fetchLatestHdxFeed({ timeoutMs: 25000, strict: false });
    if (hdxRes && hdxRes.success && hdxRes.parsed?.observations?.length > 0) {
      console.log(
        `✅ [OCHA HDX] Successfully fetched ${hdxRes.parsed.observations.length} health-zone observations (refDate: ${hdxRes.parsed.referenceDate})`,
      );
      if (hdxRes.csvText && !dryRun) {
        try {
          fs.writeFileSync(baselineHdxPath, hdxRes.csvText, "utf-8");
        } catch {
          // non-blocking cache write
        }
      }
      return hdxRes.parsed.observations;
    }
    console.warn(`⚠️ [OCHA HDX] Live feed returned no observations or errors: ${hdxRes?.error}`);
  } catch (err) {
    console.warn(
      `⚠️ [OCHA HDX] Live feed fetch failed (${err instanceof Error ? err.message : String(err)}).`,
    );
  }

  // Fallback to local cached HDX CSV if present
  if (fs.existsSync(baselineHdxPath)) {
    console.log(
      "📁 [OCHA HDX] Using cached baseline HDX feed from server/pipeline/data/baseline-hdx.csv",
    );
    try {
      const csvText = fs.readFileSync(baselineHdxPath, "utf-8");
      const parsed = parseHdxConsolidatedCsv(csvText, new Date().toISOString(), { strict: false });
      if (parsed.observations.length > 0) {
        return parsed.observations;
      }
    } catch (e) {
      console.warn("Could not read cached baseline HDX CSV:", e);
    }
  }

  return [];
}

async function sync() {
  const isDryRun = process.argv.includes("--dry-run");
  console.log(
    `🔄 [Data Ingestion] Running unified ingestion transaction${isDryRun ? " (DRY-RUN MODE)" : ""}...`,
  );

  const result = await runOutbreakSync({
    storageDir,
    targetFile,
    fetchMinistry: resolveDrcSitrep,
    fetchHdx: () => resolveHdxFeed(isDryRun),
    fetchCurve: resolveWhoWeeklyCurve,
    dryRun: isDryRun,
  });
  if (result.sourceMode === "cache") {
    console.warn(
      `⚠️ [Data Ingestion] Live source failed: ${result.sourceError}. Retaining validated snapshot ${result.snapshotId} as STALE; source dates unchanged.`,
    );
  }

  if (result.operationalLogs && result.operationalLogs.length > 0) {
    for (const log of result.operationalLogs) {
      console.log(log);
    }
  }

  if (!result.success) {
    throw new Error(result.error || "Ingestion pipeline failed");
  }

  if (isDryRun) {
    const snap = result.candidateSnapshot;
    console.log(
      `📋 [Dry Run Candidate] Cases: ${snap?.summary?.totalCases?.toLocaleString()} | Deaths: ${snap?.summary?.totalDeaths?.toLocaleString()} | Date: ${snap?.summary?.lastReportDate} | Changed: ${result.changed}`,
    );
    console.log("✅ [Data Ingestion] Dry run completed successfully with zero mutations.");
    return;
  }

  if (result.changed) {
    const legacyData = getPrerenderData(storageDir);
    console.log(
      `✅ [Data Ingestion] Published new snapshot (${result.snapshotId}): ${legacyData.summary.totalCases.toLocaleString()} cases, ${legacyData.summary.totalDeaths.toLocaleString()} deaths.`,
    );
  } else {
    console.log(
      `ℹ️ [Data Ingestion] Unchanged content. Snapshot ${result.snapshotId} remains active.`,
    );
  }
}

sync().catch((err) => {
  console.error("❌ [Data Ingestion Error]:", err);
  process.exit(1);
});
