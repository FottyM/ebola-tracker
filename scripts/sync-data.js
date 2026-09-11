import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runIngestionPipeline } from "../server/pipeline/pipeline-ingest.js";
import { parseMinistrySitrepText } from "../server/pipeline/parsers/sitrep-parser.js";
import { getPrerenderData } from "../server/pipeline/prerender-loader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetFile = path.resolve(__dirname, "../src/data/outbreak-data.js");
const storageDir = path.resolve(__dirname, "../public/data");

async function sync() {
  const isDryRun = process.argv.includes("--dry-run");
  console.log(
    `🔄 [Data Ingestion] Running unified ingestion transaction${isDryRun ? " (DRY-RUN MODE)" : ""}...`,
  );

  // Load latest authoritative SitRep fixture or remote report
  const fixturePath = path.resolve(__dirname, "../test/fixtures/sitrep/sitrep-118-2026-09-09.txt");
  let drcParsed = null;
  if (fs.existsSync(fixturePath)) {
    const text = fs.readFileSync(fixturePath, "utf-8");
    drcParsed = parseMinistrySitrepText(text);
  }

  const result = await runIngestionPipeline({
    storageDir,
    drcParsed,
    hdxObservations: [],
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
