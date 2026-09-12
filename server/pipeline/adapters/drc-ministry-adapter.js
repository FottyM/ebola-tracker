/**
 * @fileoverview DRC Ministry of Health Official Source Adapter.
 * Implements DATA-004: Index discovery, guarded report ingestion,
 * content hashing, date-based prioritization, and normalized observation generation.
 */

import crypto from "node:crypto";
import { parseMinistrySitrepText } from "../parsers/sitrep-parser.js";
import { reconcileNationalWithProvinces } from "../reconciliation.js";

const FRENCH_MONTHS = {
  janvier: "01",
  février: "02",
  fevrier: "02",
  mars: "03",
  avril: "04",
  mai: "05",
  juin: "06",
  juillet: "07",
  août: "08",
  aout: "08",
  septembre: "09",
  octobre: "10",
  novembre: "11",
  décembre: "12",
  decembre: "12",
};

/**
 * Discovers the newest Ebola SitRep from the official index HTML page.
 * Sorts strictly by parsed epidemiological date, never by link order or filename.
 * @param {string} indexHtml
 * @param {string} baseUrl
 * @returns {{ url: string, reportNumber: number, reportingDate: string, title: string } | null}
 */
export function discoverLatestSitrep(indexHtml, baseUrl = "https://sante.gouv.cd") {
  if (!indexHtml || typeof indexHtml !== "string") return null;

  const candidates = [];
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(indexHtml)) !== null) {
    const rawHref = match[1];
    const linkText = match[2].replace(/<[^>]+>/g, "").trim();

    // Ignore non-Ebola reports (e.g. Cholera, Mpox)
    const combined = `${rawHref} ${linkText}`.toLowerCase();
    if (
      !combined.includes("sitrep") &&
      !combined.includes("ebola") &&
      !combined.includes("mvebdb")
    ) {
      continue;
    }
    if (
      combined.includes("cholera") ||
      combined.includes("mpox") ||
      combined.includes("rougeole")
    ) {
      continue;
    }

    // Extract Report Number
    const numMatch = combined.match(/sitrep[_\s-]*n?°?\s*(\d+)/i);
    const reportNumber = numMatch ? parseInt(numMatch[1], 10) : 0;

    // Extract Date (e.g. "09 Septembre 2026")
    const dateMatch = linkText.match(/(\d{1,2})\s+([a-zA-Z\u00C0-\u017F]+)\s+(\d{4})/i);
    let reportingDate = "";
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, "0");
      const monthStr = dateMatch[2].toLowerCase();
      const year = dateMatch[3];
      const month = FRENCH_MONTHS[monthStr];
      if (month) {
        reportingDate = `${year}-${month}-${day}`;
      }
    }

    if (!reportingDate) {
      // Extract date from filename if link text lacked it (e.g. SitRep_MVEBDB_118_09_09_2026.pdf)
      const fileDateMatch = rawHref.match(/(\d{1,2})_(\d{1,2})_(\d{4})/);
      if (fileDateMatch) {
        const day = fileDateMatch[1].padStart(2, "0");
        const month = fileDateMatch[2].padStart(2, "0");
        const year = fileDateMatch[3];
        reportingDate = `${year}-${month}-${day}`;
      }
    }

    if (reportingDate) {
      let fullUrl = rawHref;
      if (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://")) {
        fullUrl = new URL(rawHref, baseUrl).href;
      }

      candidates.push({
        url: fullUrl,
        reportNumber,
        reportingDate,
        title: linkText || path.basename(rawHref),
      });
    }
  }

  // Also scan for direct SitRep PDF URLs in HTML (e.g. Next.js / React Server Components payloads)
  const directPdfRegex =
    /https?:\/\/[^\s"'<>]+\/SitRep_MVEBDB_(\d+)_(\d{1,2})_(\d{1,2})_(\d{4})\.pdf/gi;
  let directMatch;
  while ((directMatch = directPdfRegex.exec(indexHtml)) !== null) {
    const url = directMatch[0];
    const reportNumber = parseInt(directMatch[1], 10);
    const day = directMatch[2].padStart(2, "0");
    const month = directMatch[3].padStart(2, "0");
    const year = directMatch[4];
    const reportingDate = `${year}-${month}-${day}`;

    if (!candidates.some((c) => c.url === url)) {
      candidates.push({
        url,
        reportNumber,
        reportingDate,
        title: `SitRep N°${reportNumber} (${reportingDate})`,
      });
    }
  }

  if (candidates.length === 0) return null;

  // Strict sorting: Newest reporting date first
  candidates.sort((a, b) => b.reportingDate.localeCompare(a.reportingDate));
  return candidates[0];
}

import path from "node:path";
import { PDFParse } from "pdf-parse";

/**
 * Downloads and extracts text from the latest official DRC Ministry SitRep PDF.
 * @param {Object} [options]
 * @param {string} [options.baseUrl]
 * @param {string} [options.directPdfUrl]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<ReturnType<typeof parseMinistrySitrepText> & { sourceUrl: string }>}
 */
export async function fetchLatestMinistrySitrepPdf({
  baseUrl = "https://sante.gouv.cd",
  directPdfUrl,
  timeoutMs = 15000,
} = {}) {
  let targetUrl = directPdfUrl;

  if (!targetUrl) {
    const indexRes = await fetch(`${baseUrl}/documents/sitreps`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "EbolaTracker/1.0 (Public Health Surveillance)" },
    });
    if (!indexRes.ok) {
      throw new Error(`Ministry index portal returned HTTP ${indexRes.status}`);
    }
    const html = await indexRes.text();
    const discovered = discoverLatestSitrep(html, baseUrl);
    if (!discovered) {
      throw new Error("No Ebola SitRep PDF discovered on Ministry portal");
    }
    targetUrl = discovered.url;
  }

  const pdfRes = await fetch(targetUrl, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "EbolaTracker/1.0 (Public Health Surveillance)" },
  });

  if (!pdfRes.ok) {
    throw new Error(`Failed to download SitRep PDF (${targetUrl}): HTTP ${pdfRes.status}`);
  }

  const arrayBuffer = await pdfRes.arrayBuffer();
  const parser = new PDFParse(new Uint8Array(arrayBuffer));
  const data = await parser.getText();

  const parsed = parseMinistrySitrepText(data.text);
  return {
    ...parsed,
    sourceUrl: targetUrl,
  };
}

/**
 * Ingests and normalizes DRC Ministry SitRep text defensively.
 * @param {{
 *   textContent: string,
 *   sourceUrl: string,
 *   fetchedAt?: string
 * }} params
 * @returns {{
 *   success: boolean,
 *   reportIdentity: {
 *     reportNumber: number,
 *     reportingDate: string,
 *     sourceUrl: string,
 *     contentSha256: string,
 *     fetchedAt: string
 *   },
 *   observations: Array<import('../contracts.js').NormalizedObservation>,
 *   conflicts: Array<import('../reconciliation.js').ConflictRecord>,
 *   errors: string[]
 * }}
 */
export function ingestMinistrySitrep({
  textContent,
  sourceUrl,
  fetchedAt = new Date().toISOString(),
}) {
  const contentSha256 = crypto
    .createHash("sha256")
    .update(textContent || "")
    .digest("hex");

  const parsed = parseMinistrySitrepText(textContent);
  if (!parsed.valid) {
    return {
      success: false,
      reportIdentity: {
        reportNumber: 0,
        reportingDate: "",
        sourceUrl,
        contentSha256,
        fetchedAt,
      },
      observations: [],
      conflicts: [],
      errors: parsed.errors,
    };
  }

  // Rule 1 Reconciliation check
  const reconciliation = reconcileNationalWithProvinces(parsed.national, parsed.provinces);
  if (reconciliation.blocking) {
    return {
      success: false,
      reportIdentity: {
        reportNumber: parsed.reportNumber,
        reportingDate: parsed.reportingDate,
        sourceUrl,
        contentSha256,
        fetchedAt,
      },
      observations: [],
      conflicts: reconciliation.conflicts,
      errors: reconciliation.conflicts.map((c) => c.message),
    };
  }

  const provenance = {
    sourceId: "drc-insp-sitrep",
    publisher: "Ministère de la Santé Publique / INSP",
    sourceUrl,
    recordIdentifier: `SitRep-${parsed.reportNumber}-${parsed.reportingDate}`,
  };

  const timestamps = {
    sourceUpdatedAt: parsed.reportingDate,
    publishedAt: parsed.publicationDate || `${parsed.reportingDate}T12:00:00.000Z`,
    fetchedAt,
  };

  const observations = [];

  // 1. National observation
  observations.push({
    id: `COD:National:${parsed.reportingDate}`,
    geographicPrecision: "country",
    country: { iso3: "COD", name: "Democratic Republic of the Congo" },
    province: null,
    healthZone: null,
    city: null,
    metrics: {
      confirmedCases: parsed.national.confirmedCases,
      confirmedDeaths: parsed.national.confirmedDeaths,
      newConfirmedCases: parsed.national.newConfirmedCases,
      recovered: parsed.national.recovered,
    },
    provenance,
    timestamps,
    classification: "affected",
  });

  // 2. Province observations
  for (const p of parsed.provinces) {
    observations.push({
      id: `COD:${p.name}:${parsed.reportingDate}`,
      geographicPrecision: "province",
      country: { iso3: "COD", name: "Democratic Republic of the Congo" },
      province: { name: p.name },
      healthZone: null,
      city: null,
      metrics: {
        confirmedCases: p.cases,
        confirmedDeaths: p.deaths,
        newConfirmedCases: p.newCases,
      },
      provenance,
      timestamps,
      classification: "affected",
    });
  }

  return {
    success: true,
    reportIdentity: {
      reportNumber: parsed.reportNumber,
      reportingDate: parsed.reportingDate,
      sourceUrl,
      contentSha256,
      fetchedAt,
    },
    observations,
    conflicts: reconciliation.conflicts,
    errors: [],
  };
}
