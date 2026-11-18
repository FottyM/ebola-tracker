import fs from "node:fs";
import path from "node:path";
import {
  discoverMinistrySitreps,
  fetchLatestMinistrySitrepPdf,
} from "./adapters/drc-ministry-adapter.js";
import { executeSnapshotPipeline, loadLatestSnapshot } from "./snapshot-store.js";
import { reconcileNationalWithProvinces } from "./reconciliation.js";

/** Archive each missed published report without moving the active snapshot backwards. */
export async function backfillMinistryReports({
  storageDir,
  dryRun = false,
  fetchFn = fetch,
  fetchReport = fetchLatestMinistrySitrepPdf,
}) {
  const latest = loadLatestSnapshot(storageDir);
  const since =
    latest?.observations?.find(
      (row) => row.country.iso3 === "COD" && row.geographicPrecision === "country",
    )?.timestamps.sourceUpdatedAt || latest?.summary?.lastReportDate;
  if (!since) return [];
  const response = await fetchFn("https://sante.gouv.cd/documents/sitreps", {
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`Ministry backfill index returned HTTP ${response.status}`);
  const reports = discoverMinistrySitreps(await response.text())
    .filter((report) => report.reportingDate > since)
    .sort((a, b) => a.reportingDate.localeCompare(b.reportingDate));
  const archive = path.join(storageDir, "snapshots");
  const results = [];
  for (const report of reports) {
    const parsed = await fetchReport({ directPdfUrl: report.url, timeoutMs: 25000 });
    if (!parsed.valid || parsed.reportingDate !== report.reportingDate)
      throw new Error(
        `Backfill ${report.reportingDate}: ${parsed.errors?.join("; ") || "report date mismatch"}`,
      );
    const reconciliation = reconcileNationalWithProvinces(parsed.national, parsed.provinces);
    if (reconciliation.blocking)
      throw new Error(
        `Backfill ${report.reportingDate}: ${reconciliation.conflicts.map((c) => c.message).join("; ")}`,
      );
    const result = executeSnapshotPipeline({ drcParsed: parsed, storageDir, save: false });
    if (!result.success)
      throw new Error(`Backfill ${report.reportingDate}: ${result.errors.join("; ")}`);
    const snapshot = {
      ...result.snapshot,
      snapshotId: `snapshot-${report.reportingDate}-sitrep-${parsed.reportNumber}`,
    };
    if (!dryRun) {
      fs.mkdirSync(archive, { recursive: true });
      const destination = path.join(archive, `${snapshot.snapshotId}.json`);
      if (!fs.existsSync(destination))
        fs.writeFileSync(destination, JSON.stringify(snapshot, null, 2) + "\n");
    }
    console.log(
      `[Backfill] ${report.reportingDate}: ${parsed.national.confirmedCases} cases, ${parsed.national.confirmedDeaths} deaths (${dryRun ? "validated" : "archived"})`,
    );
    results.push(snapshot);
  }
  return results;
}
