/**
 * @fileoverview DRC Ministry Situation Report Text Parser.
 * Guarded extraction engine for Ministry SitRep text/tables.
 * Handles French number formatting (spaces, decimal commas),
 * control characters, split names, and unallocated values.
 */

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
 * Cleans numbers with French spacing and decimal commas.
 * e.g. "6 942" -> 6942, "48,2%" -> "48.2%"
 * @param {string} raw
 * @returns {number}
 */
function cleanInt(raw) {
  if (!raw) return 0;
  const digitsOnly = raw.replace(/[^\d]/g, "");
  return digitsOnly ? parseInt(digitsOnly, 10) : 0;
}

/**
 * Parses Ministry SitRep text defensively.
 * @param {string} rawText
 * @returns {{
 *   valid: boolean,
 *   reportNumber: number,
 *   reportingDate: string,
 *   publicationDate?: string,
 *   national: {
 *     confirmedCases: number,
 *     confirmedDeaths: number,
 *     newConfirmedCases: number,
 *     recovered: number,
 *     cfr: string
 *   },
 *   provinces: Array<{ name: string, newCases: number, cases: number, deaths: number, cfr: string }>,
 *   healthZones: Array<{ name: string, province: string, newCases: number, cases: number, deaths: number, cfr: string }>,
 *   hasUnallocatedValues: boolean,
 *   errors: string[]
 * }}
 */
export function parseMinistrySitrepText(rawText) {
  const errors = [];

  if (!rawText || typeof rawText !== "string") {
    return {
      valid: false,
      reportNumber: 0,
      reportingDate: "",
      national: {
        confirmedCases: 0,
        confirmedDeaths: 0,
        newConfirmedCases: 0,
        recovered: 0,
        cfr: "",
      },
      provinces: [],
      healthZones: [],
      hasUnallocatedValues: false,
      errors: ["Input must be a non-empty string."],
    };
  }

  // Clean common OCR and extraction control artifacts (e.g. \u0007 bell character)
  // eslint-disable-next-line no-control-regex
  const clean = rawText.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const normalizedHeader = clean
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  // Guardrail: Verify official header markers
  const hasHeader =
    (normalizedHeader.includes("situation epidemiologique") ||
      normalizedHeader.includes("epidemie de la maladie a virus ebola") ||
      normalizedHeader.includes("mvebdb") ||
      normalizedHeader.includes("mve-bdbv")) &&
    /(?:situation report|sitrep)\s*n\s*[°º]?\s*\d+/i.test(clean);

  if (!hasHeader) {
    return {
      valid: false,
      reportNumber: 0,
      reportingDate: "",
      national: {
        confirmedCases: 0,
        confirmedDeaths: 0,
        newConfirmedCases: 0,
        recovered: 0,
        cfr: "",
      },
      provinces: [],
      healthZones: [],
      hasUnallocatedValues: false,
      errors: ["Format drift: Missing official DRC Ministry SitRep header markers."],
    };
  }

  // Extract Report Number
  const numMatch = clean.match(/(?:Situation Report|SitRep)\s*N\s*[°º]?\s*(\d+)/i);
  const reportNumber = numMatch ? parseInt(numMatch[1], 10) : 0;
  if (!reportNumber) errors.push("Missing report number.");

  // Extract Notification Date (e.g. "Date de notification: 09 Septembre 2026" or "Date de rapportage : 09 septembre 2026")
  const dateMatch = clean.match(
    /Date de (?:notification|rapportage)\s*:\s*(\d{1,2})\s+([a-zA-Z\u00C0-\u017F]+)\s+(\d{4})/i,
  );
  let reportingDate = "";
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, "0");
    const monthStr = dateMatch[2].toLowerCase();
    const year = dateMatch[3];
    const month = FRENCH_MONTHS[monthStr];
    if (month) {
      reportingDate = `${year}-${month}-${day}`;
    } else {
      errors.push(`Unrecognized French month name '${dateMatch[2]}'.`);
    }
  } else {
    errors.push("Missing or unparsable reporting date.");
  }

  const publicationDateMatch = clean.match(
    /Date de publication\s*:\s*(\d{1,2})\s+([a-zA-Z\u00C0-\u017F]+)\s+(\d{4})/i,
  );
  let publicationDate;
  if (publicationDateMatch) {
    const month = FRENCH_MONTHS[publicationDateMatch[2].toLowerCase()];
    if (month) {
      publicationDate = `${publicationDateMatch[3]}-${month}-${publicationDateMatch[1].padStart(2, "0")}T12:00:00.000Z`;
    }
  }

  // Extract National Summary Metrics
  const casesMatch = clean.match(/Cumul des cas confirmés\s*:\s*([0-9\s]+)/i);
  const newCasesMatch = clean.match(/Nouveaux cas confirmés\s*:\s*([0-9\s]+)/i);
  const deathsMatch = clean.match(/Cumul des décès confirmés\s*:\s*([0-9\s]+)/i);
  const recoveredMatch = clean.match(/Cumul des guéris\s*:\s*([0-9\s]+)/i);
  const cfrMatch = clean.match(/Létalité\s*(?:globale)?\s*:\s*([0-9.,]+)%/i);

  let confirmedCases = casesMatch ? cleanInt(casesMatch[1]) : 0;
  let newConfirmedCases = newCasesMatch ? cleanInt(newCasesMatch[1]) : 0;
  let confirmedDeaths = deathsMatch ? cleanInt(deathsMatch[1]) : 0;
  let recovered = recoveredMatch ? cleanInt(recoveredMatch[1]) : 0;
  let cfr = cfrMatch ? `${cfrMatch[1].replace(",", ".")}%` : "";

  // Fallback for extracted PDF narrative / table layout
  if (!confirmedCases || !confirmedDeaths) {
    const narrativeMatch = clean.match(
      /(?:cumul[^\d]{0,30}(?:s['’]?établit\s+à\s+)?)?([\d][\d \u00a0]*)\s+cas confirmés et\s+([\d][\d \u00a0]*)\s+décès/i,
    );
    if (narrativeMatch) {
      confirmedCases = confirmedCases || cleanInt(narrativeMatch[1]);
      confirmedDeaths = confirmedDeaths || cleanInt(narrativeMatch[2]);
    }
    const pdfNewMatch = clean.match(/(\d+)\s+nouveaux cas confirmés/i);
    if (pdfNewMatch) {
      newConfirmedCases = newConfirmedCases || cleanInt(pdfNewMatch[1]);
    }
    const pdfRecoveredMatch = clean.match(/GU[ÉE]RIS[\s\S]{0,30}?(\d[\d\s]*)/i);
    if (pdfRecoveredMatch) {
      recovered = recovered || cleanInt(pdfRecoveredMatch[1]);
    }
    const pdfCfrMatch = clean.match(/létalité\s*(?:globale)?\s*(?:de)?\s*([0-9.,]+)\s*%/i);
    if (pdfCfrMatch) {
      cfr = cfr || `${pdfCfrMatch[1].replace(",", ".")}%`;
    }
  }

  const national = {
    confirmedCases,
    newConfirmedCases,
    confirmedDeaths,
    recovered,
    cfr,
  };

  if (!national.confirmedCases) errors.push("Missing confirmed cases in national summary.");
  if (!national.confirmedDeaths) errors.push("Missing confirmed deaths in national summary.");

  // Extract Provincial Table
  const provinces = [];
  const knownProvinces = [
    "Ituri",
    "Nord-Kivu",
    "Haut-Uélé",
    "Haut-Uele",
    "Tshopo",
    "Bas-Uélé",
    "Bas-Uele",
    "Bas Uélé",
    "Bas Uele",
    "Sud-Kivu",
    "Sud Ubangi",
    "Sud-Ubangi",
  ];
  const lines = clean.split("\n");

  for (const line of lines) {
    if (line.includes("|")) {
      const parts = line.split("|").map((p) => p.trim());
      const pName = parts[0];

      if (knownProvinces.some((kp) => kp.toLowerCase() === pName.toLowerCase())) {
        provinces.push({
          name: pName
            .replace("Uélé", "Uele")
            .replace("Bas Uélé", "Bas-Uele")
            .replace("Sud Ubangi", "Sud-Ubangi"),
          newCases: cleanInt(parts[1] || "0"),
          cases: cleanInt(parts[2] || "0"),
          deaths: cleanInt(parts[3] || "0"),
          cfr: (parts[4] || "").replace(",", "."),
        });
      }
    }
  }

  // If no pipe-delimited lines found, extract from space-delimited table (e.g. from PDF)
  if (provinces.length === 0) {
    const normalizedTables = clean.replace(/(Bas|Haut|Nord|Sud)-\s*\n\s*/gi, "$1-");
    const provinceTableStart = normalizedTables.search(
      /TABLEAU\s+1[^\n]*RÉPARTITION DES CAS ET DÉCÈS CONFIRMÉS PAR PROVINCE/i,
    );
    const provinceTableRemainder =
      provinceTableStart >= 0 ? normalizedTables.slice(provinceTableStart) : normalizedTables;
    const provinceTableEnd = provinceTableRemainder.search(/^Total\s+/im);
    const tableText =
      provinceTableEnd >= 0
        ? provinceTableRemainder.slice(0, provinceTableEnd)
        : provinceTableRemainder;
    const provRegex =
      /^[ \t]*(Ituri|Nord-Kivu|Haut-U[ée]l[ée]|Tshopo|Bas\s*-?U[ée]l[ée]|Sud-Kivu|Sud\s*-?Ubangi)\s+(\d+)\s+(\d{1,3}(?:\s\d{3})*|\d+)\s+(\d{1,3}(?:\s\d{3})*|\d+)\s+([\d.,]+\s*%)/gim;
    let m;
    while ((m = provRegex.exec(tableText)) !== null) {
      provinces.push({
        name: m[1]
          .replace("Uélé", "Uele")
          .replace("Bas Uélé", "Bas-Uele")
          .replace("Bas-Uélé", "Bas-Uele")
          .replace("Sud Ubangi", "Sud-Ubangi"),
        newCases: cleanInt(m[2] || "0"),
        cases: cleanInt(m[3] || "0"),
        deaths: cleanInt(m[4] || "0"),
        cfr: (m[5] || "").replace(",", ".").replace(/\s+/g, ""),
      });
    }
  }

  const hasUnallocatedValues =
    clean.includes("A ventiler") || clean.includes("en cours d'attribution");

  // Extract the detailed province/health-zone table when the PDF exposes it as text.
  const healthZones = [];
  const detailedTableText = clean
    .replace(/(Bas|Haut|Nord|Sud|Makiso)-\s*\n\s*/gi, "$1-")
    .replace(/\r/g, "");
  const detailedStart = detailedTableText.search(/Province\s*\/\s*Zone\s+de santé/i);
  if (detailedStart >= 0) {
    const detail = detailedTableText.slice(detailedStart);
    const knownProvinceKeys = new Map([
      ["ituri", "Ituri"],
      ["nord-kivu", "Nord-Kivu"],
      ["haut-uélé", "Haut-Uele"],
      ["tshopo", "Tshopo"],
      ["sud-kivu", "Sud-Kivu"],
      ["bas uélé", "Bas-Uele"],
      ["bas-uélé", "Bas-Uele"],
      ["sud ubangi", "Sud-Ubangi"],
      ["sud-ubangi", "Sud-Ubangi"],
    ]);
    let currentProvince = "";
    const rowRegex =
      /^[ \t]*([A-Za-zÀ-ſ][A-Za-zÀ-ſ'\-’ ]*?)\s+(\d{1,3}(?:[ \u00a0]\d{3})+|\d+)\s+(\d{1,3}(?:[ \u00a0]\d{3})+|\d+)\s+([\d.,]+)\s*%\s*(\d+)?/gim;
    let row;
    while ((row = rowRegex.exec(detail)) !== null) {
      const rawName = row[1].trim().replace(/\s+/g, " ");
      const provinceKey = rawName.toLowerCase();
      if (provinceKey === "total") break;
      if (knownProvinceKeys.has(provinceKey)) {
        currentProvince = knownProvinceKeys.get(provinceKey);
        continue;
      }
      if (!currentProvince || /^a ventiler/i.test(rawName)) continue;
      healthZones.push({
        name: rawName,
        province: currentProvince,
        cases: cleanInt(row[2]),
        deaths: cleanInt(row[3]),
        cfr: `${row[4].replace(",", ".")}%`,
        newCases: cleanInt(row[5] || "0"),
      });
    }
  }

  return {
    valid: errors.length === 0,
    reportNumber,
    reportingDate,
    ...(publicationDate ? { publicationDate } : {}),
    national,
    provinces,
    healthZones,
    hasUnallocatedValues,
    errors,
  };
}
