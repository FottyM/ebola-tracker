import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  generateManifest,
  validateManifest,
  writeManifestAtomically,
  resolveDataUrl,
  resolveManifestUrl,
  resolveSnapshotUrl,
} from "../server/pipeline/manifest.js";
import { createStaticRefreshController } from "../src/pipeline/static-client-refresh.js";
import { createSnapshotFromObservations } from "../server/pipeline/contracts.js";

describe("DATA-013: Manifest Generation and Schema", () => {
  const sampleObservations = [
    {
      id: "COD:National:2026-09-07",
      geographicPrecision: "country",
      country: { iso3: "COD", name: "Democratic Republic of the Congo" },
      province: null,
      healthZone: null,
      city: null,
      metrics: {
        confirmedCases: 4153,
        confirmedDeaths: 2341,
        newConfirmedCases: 12,
        recovered: 1200,
      },
      provenance: {
        sourceId: "drc-insp-sitrep",
        publisher: "Ministère de la Santé Publique",
        sourceUrl: "https://sante.gouv.cd/sitrep-118",
        recordIdentifier: "SitRep-118",
      },
      timestamps: {
        sourceUpdatedAt: "2026-09-07",
        publishedAt: "2026-09-07T12:00:00.000Z",
        fetchedAt: "2026-09-07T14:00:00.000Z",
      },
      classification: "affected",
    },
  ];

  const sampleSnapshot = createSnapshotFromObservations({
    snapshotId: "snapshot-2026-09-07-COD-sitrep-118",
    status: "current",
    scheduledCadenceMinutes: 30,
    observations: sampleObservations,
  });

  it("generates a valid manifest conforming to the static delivery specification", () => {
    const manifest = generateManifest(sampleSnapshot);

    expect(manifest.schemaVersion).toBe("2026-09-11");
    expect(manifest.snapshotId).toBe("snapshot-2026-09-07-COD-sitrep-118");
    expect(manifest.snapshotPath).toBe("snapshots/snapshot-2026-09-07-COD-sitrep-118.json");
    expect(manifest.snapshotUrl).toBe("data/snapshots/snapshot-2026-09-07-COD-sitrep-118.json");
    expect(manifest.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.sourceUpdatedAt).toBe("2026-09-07");
    expect(manifest.snapshotPublishedAt).toBe("2026-09-07T12:00:00.000Z");
    expect(manifest.scheduledCadenceMinutes).toBe(30);
    expect(manifest.status).toBe("current");
    expect(manifest.summary).toEqual({
      totalCases: 4153,
      totalDeaths: 2341,
      affectedCountriesCount: 1,
    });

    const validation = validateManifest(manifest);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it("rejects invalid or incomplete manifests", () => {
    expect(validateManifest(null).valid).toBe(false);
    expect(validateManifest({}).valid).toBe(false);
    expect(
      validateManifest({
        schemaVersion: "2026-09-11",
        snapshotId: "",
        status: "invalid-status",
      }).valid,
    ).toBe(false);
  });

  it("atomically writes manifest to storage directory without leaving partial files", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ebola-manifest-test-"));
    try {
      const manifest = generateManifest(sampleSnapshot);
      const manifestPath = writeManifestAtomically(manifest, tempDir);

      expect(fs.existsSync(manifestPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(content.snapshotId).toBe(sampleSnapshot.snapshotId);
      expect(content.summary.totalCases).toBe(4153);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("saveSnapshotAtomically automatically generates manifest.json and content snapshot", async () => {
    const { saveSnapshotAtomically } = await import("../server/pipeline/snapshot-store.js");
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ebola-store-manifest-test-"));
    try {
      saveSnapshotAtomically(sampleSnapshot, tempDir);

      const manifestPath = path.join(tempDir, "manifest.json");
      const snapshotPath = path.join(tempDir, "snapshots", `${sampleSnapshot.snapshotId}.json`);

      expect(fs.existsSync(manifestPath)).toBe(true);
      expect(fs.existsSync(snapshotPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.snapshotId).toBe(sampleSnapshot.snapshotId);
      expect(manifest.snapshotPath).toBe(`snapshots/${sampleSnapshot.snapshotId}.json`);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("DATA-013: Base-Path Aware URL Resolution", () => {
  it("resolves manifest URL correctly across development and production base paths", () => {
    // Root path (standard Vite dev)
    expect(resolveManifestUrl("/")).toBe("/data/manifest.json");

    // Relative path (default vite base "./")
    expect(resolveManifestUrl("./")).toBe("data/manifest.json");
    expect(resolveManifestUrl("")).toBe("data/manifest.json");

    // GitHub Pages repository path
    expect(resolveManifestUrl("/ebola-tracker/")).toBe("/ebola-tracker/data/manifest.json");
    // Trailing slash normalization
    expect(resolveManifestUrl("/ebola-tracker")).toBe("/ebola-tracker/data/manifest.json");
  });

  it("resolves snapshot URL correctly across development and production base paths", () => {
    const snapshotPath = "snapshots/snapshot-123.json";

    expect(resolveSnapshotUrl(snapshotPath, "/")).toBe("/data/snapshots/snapshot-123.json");
    expect(resolveSnapshotUrl(snapshotPath, "./")).toBe("data/snapshots/snapshot-123.json");
    expect(resolveSnapshotUrl(snapshotPath, "/ebola-tracker/")).toBe(
      "/ebola-tracker/data/snapshots/snapshot-123.json",
    );
    expect(resolveSnapshotUrl(snapshotPath, "/ebola-tracker")).toBe(
      "/ebola-tracker/data/snapshots/snapshot-123.json",
    );

    // If snapshotPath already includes data/ prefix
    expect(resolveSnapshotUrl("data/snapshots/snapshot-123.json", "/ebola-tracker/")).toBe(
      "/ebola-tracker/data/snapshots/snapshot-123.json",
    );
  });

  it("resolves generic data paths correctly avoiding double slashes", () => {
    expect(resolveDataUrl("data/manifest.json", "/ebola-tracker/")).toBe(
      "/ebola-tracker/data/manifest.json",
    );
    expect(resolveDataUrl("/data/manifest.json", "/ebola-tracker/")).toBe(
      "/ebola-tracker/data/manifest.json",
    );
    expect(resolveDataUrl("data/manifest.json", "./")).toBe("data/manifest.json");
  });
});

describe("DATA-013: Browser Polling and Visibility-Refresh Controller", () => {
  let fakeDocument;
  let listeners;

  beforeEach(() => {
    listeners = {};
    fakeDocument = {
      visibilityState: "visible",
      addEventListener: vi.fn((event, cb) => {
        listeners[event] = cb;
      }),
      removeEventListener: vi.fn((event, cb) => {
        if (listeners[event] === cb) {
          delete listeners[event];
        }
      }),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validSnapshotPayload = {
    schemaVersion: "2026-09-11",
    snapshotId: "snapshot-v2",
    status: "current",
    cadence: { scheduledCadenceMinutes: 30 },
    summary: {
      totalCases: 4200,
      totalDeaths: 2400,
      affectedCountriesCount: 1,
      overallCfr: "57.1",
    },
    observations: [],
    provenanceSources: [],
  };

  it("does not download snapshot if manifest snapshotId is unchanged", async () => {
    const fetchFn = vi.fn();
    const onUpdate = vi.fn();
    const onError = vi.fn();

    // Manifest matches current active snapshotId
    fetchFn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        schemaVersion: "2026-09-11",
        snapshotId: "snapshot-v1",
        snapshotPath: "snapshots/snapshot-v1.json",
        status: "current",
      }),
    });

    const controller = createStaticRefreshController({
      baseUrl: "/ebola-tracker/",
      currentSnapshotId: "snapshot-v1",
      onUpdate,
      onError,
      fetchFn,
      documentRef: fakeDocument,
    });

    const result = await controller.checkForUpdates();

    expect(result.updated).toBe(false);
    expect(result.reason).toBe("unchanged");
    expect(fetchFn).toHaveBeenCalledTimes(1); // Only checked manifest, did NOT fetch snapshot
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();

    controller.destroy();
  });

  it("downloads newer snapshot and fires onUpdate when manifest snapshotId changes", async () => {
    const fetchFn = vi.fn();
    const onUpdate = vi.fn();
    const onError = vi.fn();

    // 1. Fetch manifest (new snapshotId)
    fetchFn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        schemaVersion: "2026-09-11",
        snapshotId: "snapshot-v2",
        snapshotPath: "snapshots/snapshot-v2.json",
        status: "current",
      }),
    });

    // 2. Fetch snapshot
    fetchFn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => validSnapshotPayload,
    });

    const controller = createStaticRefreshController({
      baseUrl: "/ebola-tracker/",
      currentSnapshotId: "snapshot-v1",
      onUpdate,
      onError,
      fetchFn,
      documentRef: fakeDocument,
    });

    const result = await controller.checkForUpdates();

    expect(result.updated).toBe(true);
    expect(result.snapshot.snapshotId).toBe("snapshot-v2");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenCalledWith(validSnapshotPayload, expect.anything());
    expect(controller.getCurrentSnapshotId()).toBe("snapshot-v2");

    controller.destroy();
  });

  it("preserves current snapshot when manifest fetch fails or is offline", async () => {
    const fetchFn = vi.fn();
    const onUpdate = vi.fn();
    const onError = vi.fn();

    fetchFn.mockRejectedValueOnce(new Error("Network offline"));

    const controller = createStaticRefreshController({
      baseUrl: "/ebola-tracker/",
      currentSnapshotId: "snapshot-v1",
      onUpdate,
      onError,
      fetchFn,
      documentRef: fakeDocument,
    });

    const result = await controller.checkForUpdates();

    expect(result.updated).toBe(false);
    expect(result.reason).toBe("fetch_failed");
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(controller.getCurrentSnapshotId()).toBe("snapshot-v1");

    controller.destroy();
  });

  it("rejects incompatible schema versions without modifying current state", async () => {
    const fetchFn = vi.fn();
    const onUpdate = vi.fn();
    const onError = vi.fn();

    fetchFn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        schemaVersion: "1999-01-01", // Incompatible future/past version
        snapshotId: "snapshot-incompatible",
        snapshotPath: "snapshots/snapshot-incompatible.json",
        status: "current",
      }),
    });

    const controller = createStaticRefreshController({
      baseUrl: "/ebola-tracker/",
      currentSnapshotId: "snapshot-v1",
      onUpdate,
      onError,
      fetchFn,
      documentRef: fakeDocument,
    });

    const result = await controller.checkForUpdates();

    expect(result.updated).toBe(false);
    expect(result.reason).toBe("incompatible_schema");
    expect(onError).toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(controller.getCurrentSnapshotId()).toBe("snapshot-v1");

    controller.destroy();
  });

  it("triggers check when document visibility is restored", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        schemaVersion: "2026-09-11",
        snapshotId: "snapshot-v1",
        snapshotPath: "snapshots/snapshot-v1.json",
        status: "current",
      }),
    });

    const controller = createStaticRefreshController({
      baseUrl: "/ebola-tracker/",
      currentSnapshotId: "snapshot-v1",
      fetchFn,
      documentRef: fakeDocument,
    });

    expect(fakeDocument.addEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );

    // Simulate tab becoming visible
    fakeDocument.visibilityState = "visible";
    await listeners["visibilitychange"]();

    expect(fetchFn).toHaveBeenCalledTimes(1);

    controller.destroy();
    expect(fakeDocument.removeEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
  });
});
