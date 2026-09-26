/** WHO AFRO weekly Ebola bulletin adapter. */

const DEFAULT_INDEX_URL =
  "https://www.afro.who.int/health-topics/disease-outbreaks/ebola-who-african-region?page=0";

const MONTHS = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

function decodeHtml(text) {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanNumber(raw) {
  return Number.parseInt(String(raw || "").replace(/[^\d]/g, ""), 10) || 0;
}

function parseEnglishDate(raw) {
  const match = String(raw).match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!match) return "";
  const month = MONTHS[match[2].toLowerCase()];
  return month ? `${match[3]}-${month}-${match[1].padStart(2, "0")}` : "";
}

export function discoverWhoWeeklyReports(indexHtml, baseUrl = "https://www.afro.who.int") {
  const reports = [];
  const linkRegex =
    /href=["']([^"']+)["'][^>]*>([^<]*Weekly External Situation Report\s+(\d+),\s*Data as of\s*([^<]+))</gi;
  let match;
  while ((match = linkRegex.exec(indexHtml || "")) !== null) {
    const reportingDate = parseEnglishDate(match[4]);
    if (!reportingDate || reports.some((report) => report.reportNumber === Number(match[3])))
      continue;
    reports.push({
      url: new URL(match[1], baseUrl).href,
      reportNumber: Number(match[3]),
      reportingDate,
      title: decodeHtml(match[2]),
    });
  }
  return reports.sort((a, b) => a.reportingDate.localeCompare(b.reportingDate));
}

export function parseWhoWeeklyReport(html, report) {
  const text = decodeHtml(html || "");
  const incrementMatch = text.match(
    /Since External Situation Report[^.]{0,80}?(?:a\s+)?(?:further|additional|total of)\s+([\d, ]+)\s+(?:new\s+)?confirmed cases\s+and\s+([\d, ]+)l?\s+confirmed deaths/i,
  );
  if (!incrementMatch) return null;
  const weeklyCases = cleanNumber(incrementMatch[1]);
  const weeklyDeaths = cleanNumber(incrementMatch[2]);
  if (!weeklyCases || !weeklyDeaths) return null;
  return {
    week: `W${String(report.reportNumber).padStart(2, "0")}`,
    reportingDate: report.reportingDate,
    weeklyCases,
    weeklyDeaths,
    sourceUrl: report.url,
  };
}

export async function fetchWhoWeeklyCurve({
  indexUrl = DEFAULT_INDEX_URL,
  timeoutMs = 20000,
  limit = 10,
} = {}) {
  const indexResponse = await fetch(indexUrl, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "EbolaTracker/1.0 (Public Health Surveillance)" },
  });
  if (!indexResponse.ok)
    throw new Error(`WHO bulletin index returned HTTP ${indexResponse.status}`);
  const reports = discoverWhoWeeklyReports(await indexResponse.text()).slice(-limit);
  const points = await Promise.all(
    reports.map(async (report) => {
      const response = await fetch(report.url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "User-Agent": "EbolaTracker/1.0 (Public Health Surveillance)" },
      });
      return response.ok ? parseWhoWeeklyReport(await response.text(), report) : null;
    }),
  );
  const curve = points.filter(Boolean);
  if (curve.length < 2)
    throw new Error("WHO weekly bulletins did not yield enough validated curve points");
  return curve;
}
