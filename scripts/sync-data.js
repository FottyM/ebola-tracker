import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runETL } from "../server/etl.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetFile = path.resolve(__dirname, "../src/data/outbreak-data.js");

async function sync() {
  console.log(
    "🔄 [Data Ingestion] Fetching latest epidemiological feeds (WHO, HDX, Africa CDC)...",
  );
  const data = await runETL();
  const fileContent = `/** @type {import('../../server/etl.js').DynamicOutbreakState} */\nexport const defaultOutbreakData = ${JSON.stringify(data, null, 2)};\n\nexport default defaultOutbreakData;\n`;
  fs.writeFileSync(targetFile, fileContent, "utf-8");
  console.log(
    `✅ [Data Ingestion] Successfully updated: ${data.summary.totalCases.toLocaleString()} confirmed cases, ${data.summary.totalDeaths.toLocaleString()} deaths.`,
  );
}

sync().catch((err) => {
  console.error("❌ [Data Ingestion Error]:", err);
  process.exit(1);
});
