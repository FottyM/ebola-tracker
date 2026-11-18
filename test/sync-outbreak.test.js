import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runOutbreakSync } from "../server/pipeline/sync-outbreak.js";
import { executeSnapshotPipeline, loadLatestSnapshot } from "../server/pipeline/snapshot-store.js";
import { generateManifest } from "../server/pipeline/manifest.js";
import { mapSnapshotToLegacyState } from "../server/pipeline/contracts.js";

let storageDir;
let targetFile;
const parsed = {
  valid: true,
  reportNumber: 137,
  reportingDate: "2026-09-29",
  publicationDate: "2026-09-30T00:00:00.000Z",
  national: { confirmedCases: 100, confirmedDeaths: 20, newConfirmedCases: 2 },
  provinces: [{ name: "Ituri", cases: 100, deaths: 20, newCases: 2 }],
  healthZones: [{ province: "Ituri", name: "Bunia", cases: 100, deaths: 20, newCases: 2 }],
};
const unavailable = async () => {
  throw new Error("network unavailable");
};
const options = (extra = {}) => ({
  storageDir,
  targetFile,
  fetchMinistry: unavailable,
  fetchInternational: async () => [],
  ...extra,
});
function seed() {
  return executeSnapshotPipeline({ storageDir, drcParsed: parsed, internationalObservations: [] })
    .snapshot;
}
function files() {
  return Object.fromEntries(
    fs
      .readdirSync(storageDir, { recursive: true })
      .filter((name) => fs.statSync(path.join(storageDir, name)).isFile())
      .map((name) => [name, fs.readFileSync(path.join(storageDir, name), "utf8")]),
  );
}
beforeEach(() => {
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-outbreak-"));
  targetFile = path.join(storageDir, "outbreak-data.js");
});
afterEach(() => fs.rmSync(storageDir, { recursive: true, force: true }));

it("dry run retains valid cache without any writes when the new report is invalid", async () => {
  const original = seed();
  const before = files();
  const result = await runOutbreakSync(
    options({
      dryRun: true,
      fetchMinistry: async () => ({ valid: false, errors: ["date missing"] }),
    }),
  );
  expect(result.sourceMode).toBe("cache");
  expect(result.candidateSnapshot.status).toBe("stale");
  expect(result.candidateSnapshot.observations).toEqual(original.observations);
  expect(files()).toEqual(before);
});

it.each(["missing", "corrupt", "empty", "bad-summary"])(
  "rejects %s cache instead of using the historical baseline",
  async (kind) => {
    if (kind !== "missing") {
      const good = seed();
      const value =
        kind === "empty"
          ? { ...good, observations: [] }
          : { ...good, summary: { ...good.summary, totalCases: 999999 } };
      fs.writeFileSync(
        path.join(storageDir, "latest-snapshot.json"),
        kind === "corrupt" ? "not json" : JSON.stringify(value),
      );
    }
    const before = files();
    await expect(runOutbreakSync(options())).rejects.toThrow(/validated.*snapshot/i);
    expect(files()).toEqual(before);
  },
);

it("recovers from stale cache through live ingestion, but does not regress to an older report", async () => {
  seed();
  await runOutbreakSync(options());
  const result = await runOutbreakSync(
    options({
      fetchMinistry: async () => parsed,
      fetchCurve: async () => [],
      fetchHdx: async () => [],
    }),
  );
  expect(result.sourceMode).toBe("live");
  expect(loadLatestSnapshot(storageDir).status).toBe("current");
  const current = loadLatestSnapshot(storageDir);
  const old = await runOutbreakSync(
    options({ fetchMinistry: async () => ({ ...parsed, reportingDate: "2026-09-09" }) }),
  );
  expect(old.sourceMode).toBe("cache");
  expect(loadLatestSnapshot(storageDir).summary).toEqual(current.summary);
});

it("retains observations and timestamps on network failure, publishing a distinct stale artifact", async () => {
  const original = seed();
  const archive = fs.readFileSync(
    path.join(storageDir, "snapshots", `${original.snapshotId}.json`),
    "utf8",
  );
  const result = await runOutbreakSync(options());
  const retained = loadLatestSnapshot(storageDir);
  expect(mapSnapshotToLegacyState(retained).status).toBe("stale");
  expect(result.sourceMode).toBe("cache");
  expect(retained.status).toBe("stale");
  expect(retained.snapshotId).not.toBe(original.snapshotId);
  expect(retained.observations).toEqual(original.observations);
  expect(retained.summary).toEqual(original.summary);
  expect(retained.generatedAt).toBe(original.generatedAt);
  expect(retained.sourceHealth[0].lastSuccessAt).toBe(original.sourceHealth[0].lastSuccessAt);
  expect(retained.sourceHealth[0].status).toBe("Stale (last-known-good)");
  expect(
    fs.readFileSync(path.join(storageDir, "snapshots", `${original.snapshotId}.json`), "utf8"),
  ).toBe(archive);
  expect(JSON.parse(fs.readFileSync(path.join(storageDir, "manifest.json"), "utf8"))).toEqual(
    generateManifest(retained),
  );
  expect(
    JSON.parse(
      fs.readFileSync(path.join(storageDir, "snapshots", `${retained.snapshotId}.json`), "utf8"),
    ),
  ).toEqual(retained);
  const generated = fs.readFileSync(targetFile, "utf8");
  expect(generated).toContain(
    JSON.stringify(
      { ...mapSnapshotToLegacyState(retained), snapshotId: retained.snapshotId },
      null,
      2,
    ),
  );
  const before = files();
  expect((await runOutbreakSync(options())).changed).toBe(false);
  expect(files()).toEqual(before);
});

function whoCountry(iso3, name, cases, deaths, date = "2026-10-01") {
  return {
    id: `${iso3}:National:${date}`,
    geographicPrecision: "country",
    country: { iso3, name },
    province: null,
    healthZone: null,
    city: null,
    metrics: { confirmedCases: cases, confirmedDeaths: deaths },
    classification: "affected",
    provenance: {
      sourceId: "who-acute-event",
      publisher: "WHO",
      sourceUrl: "https://www.who.int/emergencies/alert-and-response",
    },
    timestamps: { sourceUpdatedAt: date, publishedAt: date, fetchedAt: "2026-10-02T00:00:00Z" },
  };
}

it("updates newly discovered countries and keeps DRC source dates independent", async () => {
  seed();
  const countries = [
    whoCountry("KEN", "Kenya", 9, 2),
    whoCountry("NGA", "Nigeria", 1, 0),
    whoCountry("FRA", "France", 1, 0),
  ];
  const fetchInternational = async () => countries;
  const result = await runOutbreakSync(
    options({ fetchMinistry: async () => parsed, fetchInternational }),
  );
  expect(result.sourceMode).toBe("live");
  expect(result.snapshot.summary).toMatchObject({
    totalCases: 111,
    totalDeaths: 22,
    affectedCountriesCount: 4,
  });
  const legacy = mapSnapshotToLegacyState(result.snapshot);
  expect(legacy.locations.find((row) => row.countryCode === "KEN").sourceUrl).toContain("who.int");
  expect(legacy.demographics).toBeNull();
  expect(legacy.corridors).toEqual([]);
  const repeat = await runOutbreakSync(
    options({ fetchMinistry: async () => parsed, fetchInternational }),
  );
  expect(repeat.sourceMode).toBe("live");
  expect(repeat.changed).toBe(false);
});

it("retains validated international figures when WHO fails, loses a country, or regresses dates", async () => {
  seed();
  const original = await runOutbreakSync(
    options({
      fetchMinistry: async () => parsed,
      fetchInternational: async () => [whoCountry("KEN", "Kenya", 9, 2)],
    }),
  );
  for (const fetchInternational of [
    unavailable,
    async () => [],
    async () => [whoCountry("KEN", "Kenya", 9, 2, "2026-09-30")],
  ]) {
    const result = await runOutbreakSync(
      options({ dryRun: true, fetchMinistry: async () => parsed, fetchInternational }),
    );
    expect(result.sourceMode).toBe("cache");
    expect(result.snapshot.status).toBe("stale");
    expect(result.snapshot.observations).toEqual(original.snapshot.observations);
    expect(result.snapshot.summary).toEqual(original.snapshot.summary);
  }
});
