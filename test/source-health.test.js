import { describe, it, expect } from "vite-plus/test";
import {
  deriveSourceFreshness,
  recordSourceRunResult,
  checkFailureThresholds,
  formatOperationalLog,
} from "../server/pipeline/source-health.js";

describe("DATA-015: Separate Source Health from Epidemiological Freshness", () => {
  describe("Freshness Derivation Independence from HTTP 200", () => {
    it("proves reachable HTTP 200 with invalid parse yields failed, never current", () => {
      const result = deriveSourceFreshness({
        transportStatus: "reachable",
        httpStatus: 200,
        parseStatus: "invalid",
        validationStatus: "blocking",
        reportingDate: null,
      });

      expect(result.freshnessStatus).toBe("failed");
      expect(result.freshnessStatus).not.toBe("current");
      expect(result.reason).toContain("Parse failure");
    });

    it("proves reachable HTTP 200 with blocking validation conflict yields failed, never current", () => {
      const result = deriveSourceFreshness({
        transportStatus: "reachable",
        httpStatus: 200,
        parseStatus: "valid",
        validationStatus: "blocking",
        reportingDate: "2026-09-09",
      });

      expect(result.freshnessStatus).toBe("failed");
      expect(result.freshnessStatus).not.toBe("current");
      expect(result.reason).toContain("Validation failure");
    });

    it("proves unreachable transport yields unreachable failed state", () => {
      const result = deriveSourceFreshness({
        transportStatus: "unreachable",
        httpStatus: null,
        parseStatus: "invalid",
        validationStatus: "blocking",
        reportingDate: null,
      });

      expect(result.freshnessStatus).toBe("failed");
      expect(result.transportStatus).toBe("unreachable");
    });

    it("derives stale status when reportingDate is older than freshness threshold despite HTTP 200", () => {
      const result = deriveSourceFreshness({
        transportStatus: "reachable",
        httpStatus: 200,
        parseStatus: "valid",
        validationStatus: "valid",
        reportingDate: "2026-08-15", // 25 days old
        currentDate: "2026-09-09",
        staleThresholdDays: 7,
      });

      expect(result.freshnessStatus).toBe("stale");
      expect(result.reason).toContain("exceeds threshold");
    });

    it("derives current status only when transport, parse, validation, and cutoff date all succeed", () => {
      const result = deriveSourceFreshness({
        transportStatus: "reachable",
        httpStatus: 200,
        parseStatus: "valid",
        validationStatus: "valid",
        reportingDate: "2026-09-09",
        currentDate: "2026-09-09",
        staleThresholdDays: 7,
      });

      expect(result.freshnessStatus).toBe("current");
    });

    it("derives partial status when non-blocking conflict is present", () => {
      const result = deriveSourceFreshness({
        transportStatus: "reachable",
        httpStatus: 200,
        parseStatus: "valid",
        validationStatus: "conflict",
        reportingDate: "2026-09-09",
        currentDate: "2026-09-09",
      });

      expect(result.freshnessStatus).toBe("partial");
      expect(result.reason).toContain("conflict");
    });

    it("derives failed status when reportingDate is missing", () => {
      const result = deriveSourceFreshness({
        transportStatus: "reachable",
        httpStatus: 200,
        parseStatus: "valid",
        validationStatus: "valid",
        reportingDate: null,
      });

      expect(result.freshnessStatus).toBe("failed");
      expect(result.reason).toContain("Missing authoritative reporting date");
    });
  });

  describe("Structured Operational Run Logging", () => {
    it("produces standardized operational run log with all required states", () => {
      const entry = recordSourceRunResult({
        sourceId: "drc-insp-sitrep",
        sourceUrl: "https://sante.gouv.cd/sitrep-118",
        transportStatus: "reachable",
        httpStatus: 200,
        durationMs: 340,
        parseStatus: "valid",
        validationStatus: "valid",
        reportingDate: "2026-09-09",
        currentDate: "2026-09-09",
        contentHash: "sha256-abc12345",
      });

      expect(entry.sourceId).toBe("drc-insp-sitrep");
      expect(entry.transportStatus).toBe("reachable");
      expect(entry.parseStatus).toBe("valid");
      expect(entry.validationStatus).toBe("valid");
      expect(entry.reportingDate).toBe("2026-09-09");
      expect(entry.freshnessStatus).toBe("current");
      expect(typeof entry.timestamp).toBe("string");

      const formatted = formatOperationalLog(entry);
      expect(formatted).toContain("drc-insp-sitrep");
      expect(formatted).toContain("reachable");
    });
  });

  describe("Failure Thresholds and Alerting", () => {
    it("triggers warning on repeated consecutive transport failures", () => {
      const history = [
        { transportStatus: "unreachable", parseStatus: "invalid", validationStatus: "blocking" },
        { transportStatus: "unreachable", parseStatus: "invalid", validationStatus: "blocking" },
        { transportStatus: "unreachable", parseStatus: "invalid", validationStatus: "blocking" },
      ];

      const check = checkFailureThresholds(history);
      expect(check.alert).toBe(true);
      expect(check.level).toBe("warning");
      expect(check.reasons.some((r) => r.includes("consecutive transport failures"))).toBe(true);
    });

    it("triggers critical alert on repeated parse failures indicating format drift", () => {
      const history = [
        { transportStatus: "reachable", parseStatus: "invalid", validationStatus: "blocking" },
        { transportStatus: "reachable", parseStatus: "invalid", validationStatus: "blocking" },
      ];

      const check = checkFailureThresholds(history);
      expect(check.alert).toBe(true);
      expect(check.level).toBe("critical");
      expect(check.reasons.some((r) => r.includes("consecutive parse failures"))).toBe(true);
    });

    it("returns no alert when runs are healthy", () => {
      const history = [
        { transportStatus: "reachable", parseStatus: "valid", validationStatus: "valid" },
        { transportStatus: "reachable", parseStatus: "valid", validationStatus: "valid" },
      ];

      const check = checkFailureThresholds(history);
      expect(check.alert).toBe(false);
      expect(check.level).toBe("info");
      expect(check.reasons).toHaveLength(0);
    });
  });
});
