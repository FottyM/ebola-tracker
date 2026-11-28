import { describe, it, expect } from "vite-plus/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverLatestSitrep,
  discoverLiveMinistrySitreps,
  discoverMinistrySitreps,
  discoverMinistrySitrepsFromWpMedia,
  ingestMinistrySitrep,
} from "../server/pipeline/adapters/drc-ministry-adapter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("DATA-004: DRC Ministry Authoritative Source Adapter", () => {
  const sampleIndexHtml = `
    <html>
      <body>
        <div class="documents-list">
          <!-- Out of order links to prove date sorting -->
          <a href="/wp-content/uploads/2026/09/SitRep_116.pdf">SitRep 116 - 07 Septembre 2026</a>
          <a href="/wp-content/uploads/2026/09/SitRep_118_latest.pdf">SitRep 118 - 09 Septembre 2026</a>
          <a href="/wp-content/uploads/2026/09/SitRep_115.pdf">SitRep 115 - 06 Septembre 2026</a>
          <a href="/wp-content/uploads/2026/09/SitRep_117.pdf">SitRep 117 - 08 Septembre 2026</a>
          <a href="/wp-content/uploads/2026/05/Cholera_Report.pdf">Cholera SitRep 04</a>
        </div>
      </body>
    </html>
  `;

  describe("Index Discovery", () => {
    it("selects newest report strictly by parsed reporting date, not link order or filename", () => {
      const discovered = discoverLatestSitrep(sampleIndexHtml, "https://sante.gouv.cd");

      expect(discovered).toBeDefined();
      expect(discovered.reportNumber).toBe(118);
      expect(discovered.reportingDate).toBe("2026-09-09");
      expect(discovered.url).toBe(
        "https://sante.gouv.cd/wp-content/uploads/2026/09/SitRep_118_latest.pdf",
      );
    });

    it("ignores non-Ebola reports during discovery", () => {
      const nonEbolaHtml = `<a href="/cholera.pdf">Cholera SitRep - 10 Septembre 2026</a>`;
      const discovered = discoverLatestSitrep(nonEbolaHtml, "https://sante.gouv.cd");
      expect(discovered).toBeNull();
    });

    it("prefers portal title dates over mistyped filenames in RSC payloads and HTML tables", () => {
      const portalHtml = `
        <script>self.__next_f.push([1,"{\\"documents\\":[{\\"title\\":\\"Rapport de Situation de la 17ème Épidémie de la Maladie à Virus EBOLA /RDC 24/11/2026\\",\\"type\\":\\"fichier\\",\\"lien\\":null,\\"fichier\\":{\\"url\\":\\"https://administration.sante.gouv.cd/wp-content/uploads/2026/11/SitRep_MVEBDB_194_24_11_2026.pdf\\",\\"size\\":938105}},{\\"title\\":\\"Rapport de Situation de la 17ème Épidémie de la Maladie à Virus EBOLA /RDC 22/11/2026\\",\\"type\\":\\"fichier\\",\\"lien\\":null,\\"fichier\\":{\\"url\\":\\"https://administration.sante.gouv.cd/wp-content/uploads/2026/11/SitRep_MVEBDB_192_22_12_2026.pdf\\",\\"size\\":956574}}]}"])</script>
        <table>
          <tr>
            <td><p>Rapport de Situation de la 17ème Épidémie de la Maladie à Virus EBOLA /RDC 22/11/2026</p></td>
            <td><a href="https://administration.sante.gouv.cd/wp-content/uploads/2026/11/SitRep_MVEBDB_192_22_12_2026.pdf">Télécharger</a></td>
          </tr>
        </table>
      `;
      const reports = discoverMinistrySitreps(portalHtml, "https://sante.gouv.cd");
      expect(reports.map((r) => [r.reportNumber, r.reportingDate])).toEqual([
        [194, "2026-11-24"],
        [192, "2026-11-22"],
      ]);
      expect(discoverLatestSitrep(portalHtml, "https://sante.gouv.cd").reportNumber).toBe(194);
    });

    it("extracts table row dates when the download anchor only says Télécharger without RSC JSON", () => {
      const tableOnlyHtml = `
        <table>
          <tr>
            <td><p>Rapport de Situation de la 17ème Épidémie de la Maladie à Virus EBOLA /RDC 22/11/2026</p></td>
            <td><a href="https://administration.sante.gouv.cd/wp-content/uploads/2026/11/SitRep_MVEBDB_192_22_12_2026.pdf">Télécharger</a></td>
          </tr>
        </table>
      `;
      const discovered = discoverLatestSitrep(tableOnlyHtml, "https://sante.gouv.cd");
      expect(discovered).toMatchObject({
        reportNumber: 192,
        reportingDate: "2026-11-22",
      });
    });

    it("discovers SitReps from WordPress media JSON and corrects future filename typos using upload dates", () => {
      const reports = discoverMinistrySitrepsFromWpMedia([
        {
          date: "2026-11-26T16:34:35",
          mime_type: "application/pdf",
          title: { rendered: "SitRep_MVEBDB_194_24_11_2026" },
          link: "https://administration.sante.gouv.cd/document/rapport-ebola-rdc-24-11-2026/sitrep_194/",
          source_url:
            "https://administration.sante.gouv.cd/wp-content/uploads/2026/11/SitRep_MVEBDB_194_24_11_2026.pdf",
        },
        {
          date: "2026-11-25T21:41:12",
          mime_type: "application/pdf",
          title: { rendered: "SitRep_MVEBDB_192_22_12_2026" },
          link: "https://administration.sante.gouv.cd/document/rapport-ebola-rdc-22-11-2026/sitrep_192/",
          source_url:
            "https://administration.sante.gouv.cd/wp-content/uploads/2026/11/SitRep_MVEBDB_192_22_12_2026.pdf",
        },
        {
          date: "2026-11-23T16:37:16",
          mime_type: "application/pdf",
          title: { rendered: "SitRep_MVEBDB_191_21_11_2026" },
          link: "https://administration.sante.gouv.cd/document/rapport-ebola-rdc-19-11-2026/sitrep_191/",
          source_url:
            "https://administration.sante.gouv.cd/wp-content/uploads/2026/11/SitRep_MVEBDB_191_21_11_2026.pdf",
        },
      ]);
      expect(reports.map((r) => [r.reportNumber, r.reportingDate])).toEqual([
        [194, "2026-11-24"],
        [192, "2026-11-22"],
        [191, "2026-11-21"],
      ]);
    });

    it("falls back to WordPress media API when the portal HTML returns zero SitReps", async () => {
      const urlsCalled = [];
      const reports = await discoverLiveMinistrySitreps({
        fetchFn: async (url) => {
          urlsCalled.push(url);
          if (url.includes("/documents/sitreps")) {
            return { ok: true, status: 200, text: async () => "<html><title>Empty</title></html>" };
          }
          return {
            ok: true,
            status: 200,
            json: async () => [
              {
                date: "2026-11-26T16:34:35",
                mime_type: "application/pdf",
                title: { rendered: "SitRep_MVEBDB_194_24_11_2026" },
                link: "https://administration.sante.gouv.cd/document/rapport-24-11-2026/",
                source_url:
                  "https://administration.sante.gouv.cd/wp-content/uploads/2026/11/SitRep_MVEBDB_194_24_11_2026.pdf",
              },
            ],
          };
        },
      });
      expect(urlsCalled).toHaveLength(2);
      expect(reports).toHaveLength(1);
      expect(reports[0]).toMatchObject({ reportNumber: 194, reportingDate: "2026-11-24" });
    });
  });

  describe("Guarded Ingestion & Normalization", () => {
    it("ingests and normalizes SitRep 118 into compliant observations with hash and provenance", () => {
      const fixtureText = fs.readFileSync(
        path.resolve(__dirname, "fixtures/sitrep/sitrep-118-2026-09-09.txt"),
        "utf-8",
      );

      const result = ingestMinistrySitrep({
        textContent: fixtureText,
        sourceUrl:
          "https://administration.sante.gouv.cd/wp-content/uploads/2026/09/SitRep_MVEBDB_118_09_09_2026.pdf",
        fetchedAt: "2026-09-11T14:00:00.000Z",
      });

      expect(result.success).toBe(true);
      expect(result.reportIdentity.reportNumber).toBe(118);
      expect(result.reportIdentity.reportingDate).toBe("2026-09-09");
      expect(result.reportIdentity.contentSha256).toMatch(/^[a-f0-9]{64}$/);

      // Verify national observation
      const nationalObs = result.observations.find((o) => o.geographicPrecision === "country");
      expect(nationalObs).toBeDefined();
      expect(nationalObs.metrics.confirmedCases).toBe(6942);
      expect(nationalObs.metrics.confirmedDeaths).toBe(3349);
      expect(nationalObs.provenance.sourceId).toBe("drc-insp-sitrep");

      // Verify province observations
      const provinceObs = result.observations.filter((o) => o.geographicPrecision === "province");
      expect(provinceObs).toHaveLength(6);
    });

    it("is completely idempotent: re-ingesting identical content yields identical output", () => {
      const fixtureText = fs.readFileSync(
        path.resolve(__dirname, "fixtures/sitrep/sitrep-117-2026-09-08.txt"),
        "utf-8",
      );

      const run1 = ingestMinistrySitrep({
        textContent: fixtureText,
        sourceUrl: "https://sante.gouv.cd/sitrep117.pdf",
        fetchedAt: "2026-09-11T14:00:00.000Z",
      });

      const run2 = ingestMinistrySitrep({
        textContent: fixtureText,
        sourceUrl: "https://sante.gouv.cd/sitrep117.pdf",
        fetchedAt: "2026-09-11T14:05:00.000Z",
      });

      expect(run1.success).toBe(true);
      expect(run2.success).toBe(true);
      expect(run1.reportIdentity.contentSha256).toBe(run2.reportIdentity.contentSha256);
      expect(run1.observations.length).toBe(run2.observations.length);
      expect(run1.observations[0].metrics).toEqual(run2.observations[0].metrics);
    });

    it("fails closed on corrupted or malformed content without generating observations", () => {
      const malformed = fs.readFileSync(
        path.resolve(__dirname, "fixtures/sitrep/sitrep-malformed-drift.txt"),
        "utf-8",
      );

      const result = ingestMinistrySitrep({
        textContent: malformed,
        sourceUrl: "https://sante.gouv.cd/corrupted.pdf",
        fetchedAt: "2026-09-11T14:00:00.000Z",
      });

      expect(result.success).toBe(false);
      expect(result.observations).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
