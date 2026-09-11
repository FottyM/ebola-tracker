/**
 * @fileoverview Authoritative Epidemiological Source Registry and Coverage Specification.
 * Implements DATA-001 requirements for verified publishers, exact endpoints,
 * stable identities, geographic support levels, and precedence rules.
 */

/**
 * @typedef {"country" | "province" | "health-zone" | "city"} GeographicLevel
 * @typedef {"affected" | "medical-evacuation" | "monitoring"} CountryClassificationType
 */

/**
 * Registry of authoritative source specifications inspected at record level.
 */
export const AUTHORITATIVE_SOURCES = Object.freeze({
  "drc-insp-sitrep": {
    id: "drc-insp-sitrep",
    name: "DRC Ministry of Public Health / INSP Daily Situation Report",
    publisher: "Ministère de la Santé Publique, Hygiène et Prévoyance Sociale / INSP",
    exactUrl: "https://sante.gouv.cd/documents/sitreps",
    format: "PDF (Daily epidemiological bulletin)",
    cadence: "Daily (reporting cutoff 23:59)",
    geographicCoverage: ["country", "province", "health-zone"],
    role: "Canonical source for DRC national, provincial totals; ground-truth verification for health zones",
    licensingPolicy:
      "Public government publication; factual data usable under attribution; raw PDF redistribution prohibited in repository.",
  },
  "hdx-consolidated": {
    id: "hdx-consolidated",
    name: "OCHA HDX Consolidated DRC Ebola Outbreak Time Series",
    publisher: "UN OCHA Humanitarian Data Exchange",
    exactUrl:
      "https://data.humdata.org/dataset/e902b209-b7bc-42f9-893a-294276d7cc62/resource/d90385d3-5339-4a3f-ac63-2699361edbe0/download/drc_ebola_cases_consolidated.csv",
    format: "CSV",
    cadence: "Daily sync from INSP reports",
    geographicCoverage: ["health-zone"],
    role: "Preferred machine-readable feed for health-zone observations, pcodes, and daily incidence",
    licensingPolicy:
      "Creative Commons Attribution for Intergovernmental Organisations (CC BY-IGO).",
  },
  "who-acute-event": {
    id: "who-acute-event",
    name: "WHO Daily Acute Event Tracking Table",
    publisher: "World Health Organization",
    exactUrl: "https://www.who.int/emergencies/alert-and-response",
    format: "HTML / JSON structured table",
    cadence: "Daily / Event-driven",
    geographicCoverage: ["country"],
    role: "Canonical global cross-country reconciliation and official international classifications",
    licensingPolicy: "Open WHO emergency public health data.",
  },
  "who-don": {
    id: "who-don",
    name: "WHO Disease Outbreak News (DON)",
    publisher: "World Health Organization",
    exactUrl: "https://www.who.int/emergencies/disease-outbreak-news",
    format: "HTML Narrative & Tables",
    cadence: "Periodic (major epidemiological milestones)",
    geographicCoverage: ["country", "province"],
    role: "Authoritative narrative validation, genomic sequencing context, PHEIC declarations",
    licensingPolicy: "WHO Open Access.",
  },
  "uganda-moh": {
    id: "uganda-moh",
    name: "Uganda Ministry of Health Outbreak Surveillance",
    publisher: "Ministry of Health Uganda",
    exactUrl: "https://evd-daily.health.go.ug/",
    format: "HTML Dashboard",
    cadence: "Event-driven (Outbreak declared over 25 August 2026)",
    geographicCoverage: ["country", "district"],
    role: "Canonical authority for Uganda containment and 42-day surveillance completion",
    licensingPolicy: "Uganda Ministry of Health public information.",
  },
  "france-gov": {
    id: "france-gov",
    name: "Ministère du Travail, de la Santé et des Solidarités (France)",
    publisher: "Gouvernement de la République Française",
    exactUrl:
      "https://www.info.gouv.fr/actualite/ebola-point-de-situation-et-mesures-mises-en-oeuvre",
    format: "HTML Situation Point",
    cadence: "Event-driven",
    geographicCoverage: ["country"],
    role: "Verification for solitary medical evacuation to Military Hospital Bégin (Paris)",
    licensingPolicy: "Licence Ouverte / Open Licence 2.0 (Etalab).",
  },
  "germany-bmg": {
    id: "germany-bmg",
    name: "Bundesministerium für Gesundheit / Charité Berlin",
    publisher: "Bundesministerium für Gesundheit (Germany)",
    exactUrl:
      "https://www.bundesgesundheitsministerium.de/en/service/begriffe-von-a-z/e/ebola-disease/page",
    format: "HTML Public Health Notice",
    cadence: "Event-driven",
    geographicCoverage: ["country"],
    role: "Verification for specialized clinical evacuation (patients counted in DRC origin)",
    licensingPolicy: "Data licence Germany – zero – Version 2.0.",
  },
  "africa-cdc": {
    id: "africa-cdc",
    name: "Africa Centres for Disease Control and Prevention Epidemic Briefs",
    publisher: "Africa CDC",
    exactUrl: "https://africacdc.org/disease/ebola-virus-disease/",
    format: "PDF Weekly Epidemiological Briefs",
    cadence: "Weekly",
    geographicCoverage: ["country", "province"],
    role: "Continental cross-check, cross-border surveillance protocols, laboratory confirmation benchmarks",
    licensingPolicy: "Africa CDC public distribution.",
  },
  "inrb-open-data": {
    id: "inrb-open-data",
    name: "INRB/INSP Epidemiological & Geographic Data Repository",
    publisher: "Institut National de Recherche Biomédicale (INRB)",
    exactUrl: "https://github.com/INRB-UMIE/BDBV2026-Data/",
    format: "Git (GeoJSON, CSV)",
    cadence: "Periodic QA batches",
    geographicCoverage: ["health-zone", "province"],
    role: "Health-zone geometry crosswalk, pcode mapping, DHIS2 orgunit verification",
    licensingPolicy: "Open research data with attribution.",
  },
});

/**
 * HDX Ingestion Configuration:
 * Strictly locks to verified stable package and resource identifiers.
 * Rejects dynamic search ranking selection to eliminate drift.
 */
export const HDX_CONFIG = Object.freeze({
  packageId: "republique-democratique-du-congo-cas-et-deces-d-ebola",
  resourceId: "d90385d3-5339-4a3f-ac63-2699361edbe0",
  disallowSearchRankingSelection: true,
  expectedFormat: "CSV",
  locationLevel: 3, // Health zones
});

/**
 * Specification of supported vs unsupported geographic levels.
 * City-level is explicitly unsupported for general case tracking.
 */
export const GEOGRAPHIC_LEVELS = Object.freeze({
  country: {
    supported: true,
    description: "National totals and international classification",
  },
  province: {
    supported: true,
    description: "Official administrative level 1 divisions (e.g. Ituri, North Kivu)",
  },
  "health-zone": {
    supported: true,
    description: "Epidemiological operational level 3 divisions with pcodes and DHIS2 IDs",
  },
  city: {
    supported: false,
    reason:
      "No general city-level case table is published by authoritative health ministries. DRC epidemiological surveillance operates by health zone (Zone de Santé). Labeling health zone data as city data is prohibited.",
  },
});

/**
 * Tests if a geographic level is supported by authoritative feeds.
 * @param {string} level
 * @returns {boolean}
 */
export function isGeographicLevelSupported(level) {
  return Boolean(GEOGRAPHIC_LEVELS[level]?.supported);
}

/**
 * Classifies an ISO3 country as an affected outbreak country vs a medical evacuation destination.
 * Medical evacuation cases are diagnosed in DRC and counted in DRC totals;
 * they MUST NOT be summed into global totals as separate affected countries.
 * @param {string} iso3
 * @returns {{ type: CountryClassificationType, role: string, includedInEpidemicTotal: boolean, note?: string }}
 */
export function classifyCountryStatus(iso3) {
  switch (iso3) {
    case "COD":
      return {
        type: "affected",
        role: "epicenter",
        includedInEpidemicTotal: true,
      };
    case "UGA":
      return {
        type: "affected",
        role: "cross-border-contained",
        includedInEpidemicTotal: true,
        note: "Declared outbreak over on 25 August 2026 after 42 days without cases.",
      };
    case "FRA":
      return {
        type: "medical-evacuation",
        role: "isolated-clinical-care",
        includedInEpidemicTotal: false,
        note: "Healthcare worker evacuated from DRC under biocontainment. Case is counted in DRC totals.",
      };
    case "DEU":
      return {
        type: "medical-evacuation",
        role: "isolated-clinical-care",
        includedInEpidemicTotal: false,
        note: "Patients treated in Germany were diagnosed in DRC and are counted in DRC confirmed figures. Germany must not be counted as a separate affected nation.",
      };
    default:
      return {
        type: "monitoring",
        role: "regional-preparedness",
        includedInEpidemicTotal: false,
      };
  }
}

/**
 * Returns source precedence order for a given metric and geographic scope.
 * @param {"DRC" | "UGANDA" | "GLOBAL"} geography
 * @param {"national-totals" | "province-totals" | "health-zone-observations" | "country-reconciliation"} metric
 * @returns {{ canonical: string, fallbacks: string[], verificationSource?: string }}
 */
export function getSourcePrecedenceForMetric(geography, metric) {
  if (geography === "DRC") {
    if (metric === "national-totals") {
      return {
        canonical: "drc-insp-sitrep",
        fallbacks: ["who-acute-event", "who-don"],
      };
    }
    if (metric === "province-totals") {
      return {
        canonical: "drc-insp-sitrep",
        fallbacks: ["hdx-consolidated", "who-don"],
      };
    }
    if (metric === "health-zone-observations") {
      return {
        canonical: "hdx-consolidated",
        fallbacks: ["inrb-open-data"],
        verificationSource: "drc-insp-sitrep",
      };
    }
  }

  if (geography === "GLOBAL" && metric === "country-reconciliation") {
    return {
      canonical: "who-acute-event",
      fallbacks: ["who-don"],
    };
  }

  return {
    canonical: "who-acute-event",
    fallbacks: [],
  };
}

/**
 * Repository licensing and fixture policy.
 * Protects against copyright infringement by prohibiting raw PDF commits.
 */
export const FIXTURE_LICENSING_POLICY = Object.freeze({
  allowRawPdfCommit: false,
  allowedFixtureFormats: ["json", "csv", "txt-synthetic"],
  attributionRequired: true,
  documentationUrl: "docs/live-data-source-feasibility.md",
});
