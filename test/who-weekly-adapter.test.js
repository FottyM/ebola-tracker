import { describe, expect, it } from "vite-plus/test";
import {
  discoverWhoWeeklyReports,
  parseWhoWeeklyReport,
} from "../server/pipeline/adapters/who-weekly-adapter.js";

describe("WHO AFRO weekly bulletin adapter", () => {
  it("discovers and orders official weekly reports", () => {
    const reports = discoverWhoWeeklyReports(`
      <a href="/report-19">Weekly External Situation Report 19, Data as of 20 September 2026</a>
      <a href="/report-18">Weekly External Situation Report 18, Data as of 13 September 2026</a>
    `);
    expect(reports.map((report) => report.reportNumber)).toEqual([18, 19]);
    expect(reports[0].reportingDate).toBe("2026-09-13");
  });

  it("parses authoritative weekly increments, including the source typo in report 18", () => {
    const point = parseWhoWeeklyReport(
      `<p>Since External Situation Report #17, a further 572 confirmed cases and
      284l confirmed deaths have been reported.</p>`,
      { reportNumber: 18, reportingDate: "2026-09-13", url: "https://example.test/18" },
    );
    expect(point).toEqual({
      week: "W18",
      reportingDate: "2026-09-13",
      weeklyCases: 572,
      weeklyDeaths: 284,
      sourceUrl: "https://example.test/18",
    });
  });
});
