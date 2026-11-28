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

function parseIsoDate(rawYear, rawMonth, rawDay) {
  const yearNum = Number(String(rawYear).length === 2 ? `20${rawYear}` : rawYear);
  const monthNum = Number(rawMonth);
  const dayNum = Number(rawDay);
  if (
    !Number.isInteger(yearNum) ||
    !Number.isInteger(monthNum) ||
    !Number.isInteger(dayNum) ||
    monthNum < 1 ||
    monthNum > 12 ||
    dayNum < 1 ||
    dayNum > 31
  ) {
    return "";
  }
  const utc = new Date(Date.UTC(yearNum, monthNum - 1, dayNum));
  if (
    utc.getUTCFullYear() !== yearNum ||
    utc.getUTCMonth() !== monthNum - 1 ||
    utc.getUTCDate() !== dayNum
  ) {
    return "";
  }
  return `${String(yearNum).padStart(4, "0")}-${String(monthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
}

function isEbolaSitrep(text) {
  const combined = String(text || "").toLowerCase();
  if (!combined.includes("sitrep") && !combined.includes("ebola") && !combined.includes("mvebdb")) {
    return false;
  }
  if (combined.includes("cholera") || combined.includes("mpox") || combined.includes("rougeole")) {
    return false;
  }
  return true;
}

function extractDateFromText(text) {
  if (!text) return "";
  const frenchMatch = text.match(/(\d{1,2})(?:er)?\s+([a-zA-Z\u00C0-\u017F]+)\s+(\d{4})/i);
  if (frenchMatch) {
    const month = FRENCH_MONTHS[frenchMatch[2].toLowerCase()];
    if (month) {
      return parseIsoDate(frenchMatch[3], month, frenchMatch[1]);
    }
  }
  const numericMatch = text.match(/(?<!\d)(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?!\d)/);
  if (numericMatch) {
    return parseIsoDate(numericMatch[3], numericMatch[2], numericMatch[1]);
  }
  return "";
}

function extractIdentityFromUrl(url) {
  const identity = url.match(
    /(?:N[_-]?)?(\d+)[_-](\d{1,2})[_-](\d{1,2})[_-](\d{4}|\d{2})(?=[_.-])/i,
  );
  if (identity) {
    return {
      reportNumber: Number(identity[1]),
      reportingDate: parseIsoDate(identity[4], identity[3], identity[2]),
    };
  }
  const numMatch = url.match(/sitrep[_\s-]*(?:mvebdbd?[_-]|mve[_-]rdc[_-])?n?°?[_-\s]*(\d+)/i);
  const reportNumber = numMatch ? parseInt(numMatch[1], 10) : 0;
  const fileDateMatch = url.match(/(\d{1,2})[_-](\d{1,2})[_-](\d{4})/);
  const reportingDate = fileDateMatch
    ? parseIsoDate(fileDateMatch[3], fileDateMatch[2], fileDateMatch[1])
    : "";
  return { reportNumber, reportingDate };
}

function isGenericLinkText(text) {
  return !text || /^(?:t[ée]l[ée]charger|download|voir|ouvrir)$/i.test(text.trim());
}

/**
 * Discovers Ebola SitReps from the official index HTML page.
 * Prefers structured portal titles over raw filenames to guard against filename typos,
 * and sorts strictly by parsed epidemiological date.
 * @param {string} indexHtml
 * @param {string} baseUrl
 * @returns {Array<{ url: string, reportNumber: number, reportingDate: string, title: string }>}
 */
export function discoverMinistrySitreps(indexHtml, baseUrl = "https://sante.gouv.cd") {
  if (!indexHtml || typeof indexHtml !== "string") return [];

  const byUrl = new Map();
  const upsertCandidate = ({ url, reportNumber, reportingDate, title, dateSource }) => {
    if (!url || !reportingDate) return;
    const existing = byUrl.get(url);
    if (!existing) {
      byUrl.set(url, { url, reportNumber, reportingDate, title, dateSource });
      return;
    }
    if (reportNumber && !existing.reportNumber) {
      existing.reportNumber = reportNumber;
    }
    if (dateSource === "title" && existing.dateSource !== "title") {
      existing.reportingDate = reportingDate;
      existing.dateSource = "title";
    }
    if (!isGenericLinkText(title) && isGenericLinkText(existing.title)) {
      existing.title = title;
    }
  };

  const resolveUrl = (rawHref) => {
    if (rawHref.startsWith("http://") || rawHref.startsWith("https://")) return rawHref;
    return new URL(rawHref, baseUrl).href;
  };

  // 1. Structured Next.js RSC / JSON document entries expose every document's portal title alongside its PDF URL.
  const rscDocPatterns = [
    /\\"title\\"\s*:\s*\\"((?:[^"\\]|\\[^"])*)\\"[^{}]*?\\"fichier\\"\s*:\s*\{[^}]*?\\"url\\"\s*:\s*\\"(https?:\/\/[^"'<>\\]+\.pdf)\\"/gi,
    /"title"\s*:\s*"((?:[^"\\]|\\.)*)"[^{}]*?"fichier"\s*:\s*\{[^}]*?"url"\s*:\s*"(https?:\/\/[^"'<>\\]+\.pdf)"/gi,
  ];
  for (const rscDocRegex of rscDocPatterns) {
    for (const match of indexHtml.matchAll(rscDocRegex)) {
      const title = match[1].replace(/\\"/g, '"').trim();
      const url = match[2];
      if (!isEbolaSitrep(`${title} ${url}`)) continue;
      const titleDate = extractDateFromText(title);
      const urlIdentity = extractIdentityFromUrl(url);
      const numMatch = `${title} ${url}`.match(
        /sitrep[_\s-]*(?:mvebdbd?[_-]|mve[_-]rdc[_-])?n?°?[_-\s]*(\d+)/i,
      );
      const reportNumber = urlIdentity.reportNumber || (numMatch ? parseInt(numMatch[1], 10) : 0);
      upsertCandidate({
        url,
        reportNumber,
        reportingDate: titleDate || urlIdentity.reportingDate,
        title,
        dateSource: titleDate ? "title" : "filename",
      });
    }
  }

  // 2. HTML table rows pair a visible document title cell with a generic "Télécharger" anchor.
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  for (const rowMatch of indexHtml.matchAll(rowRegex)) {
    const rowHtml = rowMatch[1];
    const rowLink = rowHtml.match(/<a[^>]+href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>/i);
    if (!rowLink) continue;
    const rawHref = rowLink[1];
    const rowText = rowHtml
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!isEbolaSitrep(`${rawHref} ${rowText}`)) continue;
    const rowDate = extractDateFromText(rowText);
    if (!rowDate) continue;
    const fullUrl = resolveUrl(rawHref);
    const urlIdentity = extractIdentityFromUrl(fullUrl);
    const numMatch = `${rawHref} ${rowText}`.match(
      /sitrep[_\s-]*(?:mvebdbd?[_-]|mve[_-]rdc[_-])?n?°?[_-\s]*(\d+)/i,
    );
    const reportNumber = urlIdentity.reportNumber || (numMatch ? parseInt(numMatch[1], 10) : 0);
    const titleCell = rowHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const title = titleCell ? titleCell[1].replace(/<[^>]+>/g, "").trim() : rowText;
    upsertCandidate({
      url: fullUrl,
      reportNumber,
      reportingDate: rowDate,
      title,
      dateSource: "title",
    });
  }

  // 3. Direct anchor tags (standalone HTML lists where title and date live in the link text or filename).
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(indexHtml)) !== null) {
    const rawHref = match[1];
    const linkText = match[2].replace(/<[^>]+>/g, "").trim();
    if (!isEbolaSitrep(`${rawHref} ${linkText}`)) continue;

    const fullUrl = resolveUrl(rawHref);
    const urlIdentity = extractIdentityFromUrl(fullUrl);
    const numMatch = `${rawHref} ${linkText}`.match(
      /sitrep[_\s-]*(?:mvebdbd?[_-]|mve[_-]rdc[_-])?n?°?[_-\s]*(\d+)/i,
    );
    const reportNumber = urlIdentity.reportNumber || (numMatch ? parseInt(numMatch[1], 10) : 0);
    const linkDate = extractDateFromText(linkText);
    const reportingDate = linkDate || urlIdentity.reportingDate;

    if (reportingDate) {
      upsertCandidate({
        url: fullUrl,
        reportNumber,
        reportingDate,
        title: linkText || path.basename(rawHref),
        dateSource: linkDate ? "title" : "filename",
      });
    }
  }

  // 4. Raw PDF URLs embedded in server payloads or plain link lists.
  const directPdfRegex = /https?:\/\/[^\s"'<>\\]+sitrep[^\s"'<>\\]*\.pdf/gi;
  for (const directMatch of indexHtml.matchAll(directPdfRegex)) {
    const url = directMatch[0];
    if (!isEbolaSitrep(url)) continue;
    const { reportNumber, reportingDate } = extractIdentityFromUrl(url);
    if (!reportingDate) continue;
    upsertCandidate({
      url,
      reportNumber,
      reportingDate,
      title: `SitRep N°${reportNumber} (${reportingDate})`,
      dateSource: "filename",
    });
  }

  if (byUrl.size === 0) return [];

  const candidates = [...byUrl.values()].map(({ dateSource: _dateSource, ...entry }) => entry);

  // Strict sorting: Newest reporting date first, then highest report number
  candidates.sort(
    (a, b) => b.reportingDate.localeCompare(a.reportingDate) || b.reportNumber - a.reportNumber,
  );
  return candidates;
}

export function discoverLatestSitrep(indexHtml, baseUrl = "https://sante.gouv.cd") {
  return discoverMinistrySitreps(indexHtml, baseUrl)[0] || null;
}

const DEFAULT_WP_MEDIA_API_URL =
  "https://administration.sante.gouv.cd/wp-json/wp/v2/media?search=SitRep&per_page=100&orderby=date&order=desc";

/**
 * Discovers Ebola SitReps from the Ministry's official WordPress media REST API.
 * Guarded against mistyped future filenames by validating against each item's upload date.
 * @param {Array<any>} items
 * @returns {Array<{ url: string, reportNumber: number, reportingDate: string, title: string }>}
 */
export function discoverMinistrySitrepsFromWpMedia(items) {
  if (!Array.isArray(items)) return [];
  const byDate = new Map();
  for (const item of items) {
    const url = item?.source_url;
    if (!url || typeof url !== "string" || !url.toLowerCase().endsWith(".pdf")) continue;
    if (item?.mime_type && item.mime_type !== "application/pdf") continue;
    const rawTitle = item?.title?.rendered || "";
    const link = item?.link || "";
    if (!isEbolaSitrep(`${rawTitle} ${url} ${link}`)) continue;
    const urlIdentity = extractIdentityFromUrl(url);
    const uploadDate =
      typeof item?.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(item.date)
        ? item.date.slice(0, 10)
        : "";
    let reportingDate = urlIdentity.reportingDate;
    if (!reportingDate || (uploadDate && reportingDate > uploadDate)) {
      const linkDate = extractDateFromText(link);
      if (linkDate && (!uploadDate || linkDate <= uploadDate)) {
        reportingDate = linkDate;
      }
    }
    if (!reportingDate) continue;
    if (!byDate.has(reportingDate)) {
      byDate.set(reportingDate, {
        url,
        reportNumber: urlIdentity.reportNumber,
        reportingDate,
        title: rawTitle || `SitRep N°${urlIdentity.reportNumber} (${reportingDate})`,
      });
    }
  }
  return [...byDate.values()].sort(
    (a, b) => b.reportingDate.localeCompare(a.reportingDate) || b.reportNumber - a.reportNumber,
  );
}

/**
 * Fetches the Ministry SitRep index, falling back to the official WordPress media API
 * if the Next.js portal intermittently returns an empty document list or fails.
 */
export async function discoverLiveMinistrySitreps({
  baseUrl = "https://sante.gouv.cd",
  wpApiUrl = DEFAULT_WP_MEDIA_API_URL,
  timeoutMs = 15000,
  fetchFn = fetch,
} = {}) {
  const headers = { "User-Agent": "EbolaTracker/1.0 (Public Health Surveillance)" };
  let primaryError = "";

  try {
    const indexRes = await fetchFn(`${baseUrl}/documents/sitreps`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers,
    });
    if (!indexRes.ok) {
      primaryError = `Ministry index portal returned HTTP ${indexRes.status}`;
    } else {
      const html = await indexRes.text();
      const reports = discoverMinistrySitreps(html, baseUrl);
      if (reports.length > 0) return reports;
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const pageTitle = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim().slice(0, 80) : "";
      primaryError = `No Ebola SitRep PDF discovered on Ministry portal (HTTP ${indexRes.status}, ${html.length} bytes${pageTitle ? `, title="${pageTitle}"` : ""})`;
    }
  } catch (err) {
    primaryError = err instanceof Error ? err.message : String(err);
  }

  console.warn(
    `⚠️ [DRC Ministry] ${primaryError}; falling back to official WordPress media API...`,
  );

  if (wpApiUrl) {
    try {
      const wpRes = await fetchFn(wpApiUrl, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { ...headers, Accept: "application/json" },
      });
      if (wpRes.ok && typeof wpRes.json === "function") {
        const wpReports = discoverMinistrySitrepsFromWpMedia(await wpRes.json());
        if (wpReports.length > 0) return wpReports;
      }
    } catch {
      // Surface the primary portal error below when both endpoints fail.
    }
  }

  throw new Error(primaryError || "No Ebola SitRep PDF discovered on Ministry portal");
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
    const reports = await discoverLiveMinistrySitreps({ baseUrl, timeoutMs });
    const discovered = reports[0];
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
  const parser = new PDFParse({ data: new Uint8Array(arrayBuffer) });
  let data;
  try {
    data = await parser.getText();
  } finally {
    await parser.destroy();
  }

  const parsed = parseMinistrySitrepText(data.text);
  const reconciliation = reconcileNationalWithProvinces(parsed.national, parsed.provinces);
  const errors = [
    ...parsed.errors,
    ...reconciliation.conflicts
      .filter((conflict) => conflict.severity === "blocking")
      .map((conflict) => conflict.message),
  ];
  return {
    ...parsed,
    valid: errors.length === 0,
    errors,
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
