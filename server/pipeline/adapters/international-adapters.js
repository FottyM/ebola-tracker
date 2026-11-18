/** WHO country reporting: membership, counts, and dates come from the live table. */
import geography from "../../../src/data/country-geography.json" with { type: "json" };
import { classifyCountryStatus } from "../sources.js";

export const WHO_COUNTRY_URL = "https://www.who.int/emergencies/alert-and-response";
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function text(html) {
  return html
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&ndash;|&mdash;/g, "–")
    .replace(/\s+/g, " ")
    .trim();
}
function number(raw, optional = false) {
  if (optional && /^(?:-|–|—|n\/?a)$/i.test(raw)) return undefined;
  if (!/^\d+(?:[ ,\u00a0]\d{3})*$/.test(raw)) throw new Error(`Invalid WHO count: ${raw}`);
  return Number(raw.replace(/[ ,\u00a0]/g, ""));
}
function date(raw) {
  const match = raw.match(/Data as of\s+(\d{1,2})\s+([a-z]+)\s+(\d{4})/i);
  if (!match) throw new Error(`Missing WHO reporting date: ${raw}`);
  const month = MONTHS.indexOf(match[2].toLowerCase()) + 1;
  const iso = `${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  if (!month || new Date(iso).toISOString().slice(0, 10) !== iso)
    throw new Error(`Invalid WHO date: ${raw}`);
  return iso;
}
function countryForName(name) {
  const normalize = (value) =>
    value
      .toLowerCase()
      .replace(/^the\s+/, "")
      .replace(/[^a-z]/g, "");
  const target = normalize(name.replace(/[*#$]+$/g, "").trim());
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const entry = Object.entries(geography).find(([, country]) =>
    [country.name, names.of(country.iso2)].some((value) => normalize(value) === target),
  );
  if (!entry) throw new Error(`Unrecognized WHO country: ${name}`);
  return { iso3: entry[0], name: entry[1].name };
}

/** Classification follows supplied evidence, never a country-code whitelist. */
export function parseWhoAcuteEventTable(payload) {
  const countries = [],
    errors = [];
  for (const row of payload?.countries || []) {
    const classification = classifyCountryStatus(row.iso3, row);
    if (
      !Number.isInteger(row.cases) ||
      row.cases < 0 ||
      !Number.isInteger(row.deaths) ||
      row.deaths < 0 ||
      row.deaths > row.cases
    )
      errors.push(`Invalid counts for ${row.iso3}`);
    if (
      row.recovered !== undefined &&
      (!Number.isInteger(row.recovered) ||
        row.recovered < 0 ||
        row.recovered + row.deaths > row.cases)
    )
      errors.push(`Invalid recoveries for ${row.iso3}`);
    countries.push({ ...row, classification: classification.type });
  }
  if (!countries.length) errors.push("WHO country table is empty");
  if (new Set(countries.map((row) => row.iso3)).size !== countries.length)
    errors.push("Duplicate WHO country");
  return {
    valid: errors.length === 0,
    referenceDate: payload?.referenceDate || "",
    countries,
    affectedCountries: countries
      .filter((row) => row.classification === "affected")
      .map((row) => row.iso3),
    evacuations: countries
      .filter((row) => row.classification === "medical-evacuation")
      .map((row) => row.iso3),
    errors,
  };
}

/** Parse only the Bundibugyo table and reconcile every country against WHO's total. */
export function parseWhoCountryHtml(html) {
  const heading = html.search(
    /<h[23]\b[^>]*>[^<]*(?:Ebola disease \(Bundibugyo|Bundibugyo virus disease outbreak)/i,
  );
  if (heading < 0) throw new Error("WHO Bundibugyo event heading missing");
  const table = html.slice(heading).match(/<table\b[^>]*>[\s\S]*?<\/table>/i)?.[0];
  if (!table) throw new Error("WHO country table missing");
  let columns, reportingDate, total;
  const countries = [];
  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
      text(cell[1]),
    );
    if (cells.some((cell) => /^Affected countries$/i.test(cell))) {
      columns = cells.map((cell) => cell.toLowerCase());
      continue;
    }
    if (cells.length === 1 && /Data as of/i.test(cells[0])) {
      reportingDate = date(cells[0]);
      continue;
    }
    if (!columns || cells.length < 2) continue;
    if (cells.length !== columns.length) throw new Error("WHO table column count changed");
    const value = (label, optional = false) => {
      const index = columns.indexOf(label);
      if (index < 0) throw new Error(`WHO column missing: ${label}`);
      return number(cells[index], optional);
    };
    const metrics = {
      cases: value("confirmed cases"),
      deaths: value("confirmed deaths"),
      recovered: value("recovered", true),
    };
    if (/^Total$/i.test(cells[0])) {
      total = metrics;
      continue;
    }
    if (!reportingDate) throw new Error(`WHO reporting date missing for ${cells[0]}`);
    const country = countryForName(cells[0]);
    countries.push({ ...country, ...metrics, reportingDate, status: "affected" });
  }
  const parsed = parseWhoAcuteEventTable({ countries });
  if (!parsed.valid) throw new Error(parsed.errors.join("; "));
  if (
    !total ||
    ["cases", "deaths"].some(
      (key) => countries.reduce((sum, row) => sum + row[key], 0) !== total[key],
    )
  )
    throw new Error("WHO country totals do not reconcile");
  return {
    ...parsed,
    referenceDate: countries.reduce(
      (latest, row) => (row.reportingDate > latest ? row.reportingDate : latest),
      "",
    ),
  };
}

export async function fetchWhoCountryObservations({
  fetchFn = fetch,
  timeoutMs = 25000,
  fetchedAt = new Date().toISOString(),
} = {}) {
  const response = await fetchFn(WHO_COUNTRY_URL, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "EbolaTracker/1.0 (Public Health Surveillance)" },
  });
  if (!response.ok) throw new Error(`WHO country table returned HTTP ${response.status}`);
  const report = parseWhoCountryHtml(await response.text());
  return report.countries.map((row) => ({
    id: `${row.iso3}:National:${row.reportingDate}`,
    geographicPrecision: "country",
    country: { iso3: row.iso3, name: row.name },
    province: null,
    healthZone: null,
    city: null,
    metrics: {
      confirmedCases: row.cases,
      confirmedDeaths: row.deaths,
      ...(row.recovered !== undefined ? { recovered: row.recovered } : {}),
    },
    provenance: {
      sourceId: "who-acute-event",
      publisher: "World Health Organization",
      sourceUrl: WHO_COUNTRY_URL,
      recordIdentifier: `${row.iso3}-${row.reportingDate}`,
    },
    timestamps: { sourceUpdatedAt: row.reportingDate, publishedAt: null, fetchedAt },
    classification: row.classification,
    note: `WHO country report as of ${row.reportingDate}. Country totals; subnational locations are not reported by this source.`,
  }));
}
