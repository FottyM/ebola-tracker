import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runIngestionPipeline } from "../server/pipeline/pipeline-ingest.js";
import { parseMinistrySitrepText } from "../server/pipeline/parsers/sitrep-parser.js";
import { fetchLatestMinistrySitrepPdf } from "../server/pipeline/adapters/drc-ministry-adapter.js";
import {
  fetchLatestHdxFeed,
  parseHdxConsolidatedCsv,
} from "../server/pipeline/adapters/hdx-adapter.js";
import { getPrerenderData } from "../server/pipeline/prerender-loader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetFile = path.resolve(__dirname, "../src/data/outbreak-data.js");
const storageDir = path.resolve(__dirname, "../public/data");
const baselineSitrepPath = path.resolve(__dirname, "../server/pipeline/data/baseline-sitrep.txt");
const baselineHdxPath = path.resolve(__dirname, "../server/pipeline/data/baseline-hdx.csv");

/**
 * Resolves DRC Ministry SitRep data via live portal scraping or local production baseline.
 */
async function resolveDrcSitrep() {
  console.log(
    "📡 [DRC Ministry] Checking official portal (https://sante.gouv.cd/documents/sitreps)...",
  );
  try {
    const liveSitrep = await fetchLatestMinistrySitrepPdf({ timeoutMs: 25000 });
    if (liveSitrep && liveSitrep.valid) {
      console.log(
        `✅ [DRC Ministry] Successfully fetched and parsed SitRep #${liveSitrep.reportNumber} (${liveSitrep.reportingDate}) from ${liveSitrep.sourceUrl}`,
      );
      return liveSitrep;
    }
    console.warn(
      `⚠️ [DRC Ministry] Live SitRep returned invalid payload: ${liveSitrep?.errors?.join("; ")}`,
    );
  } catch (err) {
    console.warn(
      `⚠️ [DRC Ministry] Live SitRep fetch failed (${err instanceof Error ? err.message : String(err)}). Falling back to production baseline.`,
    );
  }

  // Fallback to local baseline cache
  if (fs.existsSync(baselineSitrepPath)) {
    console.log(
      "📁 [DRC Ministry] Using cached baseline SitRep from server/pipeline/data/baseline-sitrep.txt",
    );
    const text = fs.readFileSync(baselineSitrepPath, "utf-8");
    const parsed = parseMinistrySitrepText(text);
    if (parsed.valid) {
      return parsed;
    }
  }

  throw new Error(
    "DRC Ministry SitRep could not be resolved from live portal or local baseline cache.",
  );
}

/**
 * Resolves UN OCHA HDX consolidated health-zone observations via live download or local cache.
 */
async function resolveHdxFeed() {
  console.log("📡 [OCHA HDX] Checking consolidated health-zone feed...");
  try {
    const hdxRes = await fetchLatestHdxFeed({ timeoutMs: 25000, strict: false });
    if (hdxRes && hdxRes.success && hdxRes.parsed?.observations?.length > 0) {
      console.log(
        `✅ [OCHA HDX] Successfully fetched ${hdxRes.parsed.observations.length} health-zone observations (refDate: ${hdxRes.parsed.referenceDate})`,
      );
      if (hdxRes.csvText) {
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

  const drcParsed = await resolveDrcSitrep();
  const hdxObservations = await resolveHdxFeed();

  const result = await runIngestionPipeline({
    storageDir,
    drcParsed,
    hdxObservations,
    dryRun: isDryRun,
  });

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
    const fileContent = `/** @type {import('../../server/etl.js').DynamicOutbreakState} */\nexport const defaultOutbreakData = ${JSON.stringify(legacyData, null, 2)};\n\nexport default defaultOutbreakData;\n`;
    fs.writeFileSync(targetFile, fileContent, "utf-8");
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
