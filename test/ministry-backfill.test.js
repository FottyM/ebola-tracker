import { it, expect } from "vite-plus/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { backfillMinistryReports } from "../server/pipeline/backfill-ministry.js";
import { parseMinistrySitrepText } from "../server/pipeline/parsers/sitrep-parser.js";

it("backfills missed reports in date order, preserves the active snapshot, and keeps dry runs read-only", async () => {
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "ministry-backfill-"));
  const report = parseMinistrySitrepText(
    fs.readFileSync(
      new URL("./fixtures/sitrep/sitrep-176-2026-11-06.txt", import.meta.url),
      "utf8",
    ),
  );
  const retained = JSON.stringify({ summary: { lastReportDate: "2026-11-04" } });
  fs.writeFileSync(path.join(storageDir, "latest-snapshot.json"), retained);
  const calls = [];
  const options = {
    storageDir,
    fetchFn: async () => ({
      ok: true,
      text: async () =>
        [6, 5]
          .map((day) => `https://example.com/SitRep_MVE_RDC_N_${170 + day}_0${day}-11-2026.pdf`)
          .join(" "),
    }),
    fetchReport: async ({ directPdfUrl }) => {
      const day = directPdfUrl.includes("_05-") ? "05" : "06";
      calls.push(day);
      return {
        ...report,
        reportNumber: 170 + Number(day),
        reportingDate: `2026-11-${day}`,
        sourceUrl: directPdfUrl,
      };
    },
  };
  try {
    await backfillMinistryReports({ ...options, dryRun: true });
    expect(fs.readdirSync(storageDir)).toEqual(["latest-snapshot.json"]);
    expect(calls).toEqual(["05", "06"]);
    await backfillMinistryReports(options);
    const archive = path.join(storageDir, "snapshots");
    const files = fs.readdirSync(archive);
    expect(files).toHaveLength(2);
    const before = files.map((file) => fs.readFileSync(path.join(archive, file), "utf8"));
    await backfillMinistryReports(options);
    expect(files.map((file) => fs.readFileSync(path.join(archive, file), "utf8"))).toEqual(before);
    expect(fs.readFileSync(path.join(storageDir, "latest-snapshot.json"), "utf8")).toBe(retained);
    await expect(
      backfillMinistryReports({
        ...options,
        fetchReport: async () => ({ valid: false, errors: ["layout drift"] }),
      }),
    ).rejects.toThrow("layout drift");
    expect(fs.readFileSync(path.join(storageDir, "latest-snapshot.json"), "utf8")).toBe(retained);
  } finally {
    fs.rmSync(storageDir, { recursive: true, force: true });
  }
});

it("uses authoritative PDF date when filename date has a typo for the same report number, and rejects mismatched report numbers", async () => {
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "ministry-backfill-typo-"));
  const report = parseMinistrySitrepText(
    fs.readFileSync(
      new URL("./fixtures/sitrep/sitrep-176-2026-11-06.txt", import.meta.url),
      "utf8",
    ),
  );
  fs.writeFileSync(
    path.join(storageDir, "latest-snapshot.json"),
    JSON.stringify({ summary: { lastReportDate: "2026-11-21" } }),
  );
  try {
    const archived = await backfillMinistryReports({
      storageDir,
      fetchFn: async () => ({
        ok: true,
        text: async () =>
          "https://administration.sante.gouv.cd/wp-content/uploads/2026/11/SitRep_MVEBDB_192_22_12_2026.pdf",
      }),
      fetchReport: async ({ directPdfUrl }) => ({
        ...report,
        reportNumber: 192,
        reportingDate: "2026-11-22",
        sourceUrl: directPdfUrl,
      }),
    });
    expect(archived).toHaveLength(1);
    expect(archived[0].snapshotId).toBe("snapshot-2026-11-22-sitrep-192");
    expect(fs.readdirSync(path.join(storageDir, "snapshots"))).toEqual([
      "snapshot-2026-11-22-sitrep-192.json",
    ]);

    await expect(
      backfillMinistryReports({
        storageDir,
        dryRun: true,
        fetchFn: async () => ({
          ok: true,
          text: async () =>
            "https://administration.sante.gouv.cd/wp-content/uploads/2026/11/SitRep_MVEBDB_195_25_11_2026.pdf",
        }),
        fetchReport: async ({ directPdfUrl }) => ({
          ...report,
          reportNumber: 194,
          reportingDate: "2026-11-24",
          sourceUrl: directPdfUrl,
        }),
      }),
    ).rejects.toThrow("report date mismatch");
  } finally {
    fs.rmSync(storageDir, { recursive: true, force: true });
  }
});
