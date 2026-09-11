# Live Data Source Feasibility

Status: Initial investigation complete; source contract still requires review  
Checked: 11 September 2026  
Scope: Current Bundibugyo Ebola outbreak totals and geographic detail

## Decision

The required pipeline is feasible at country, province, and DRC health-zone level.

It is not currently supportable at a general city level. The official sources inspected report DRC subnational cases by **health zone**, not by city. Some health zones share names with cities, but that does not make every health-zone observation a city observation. City-level case counts must remain unavailable unless a source explicitly publishes them at that precision.

Use the following source roles:

1. DRC Ministry/INSP daily SitRep PDFs are the canonical source for DRC national and province totals and the authoritative verification source for health-zone values.
2. The exact OCHA HDX consolidated CSV is the preferred machine-readable feed for DRC health-zone observations and pcodes.
3. WHO's daily acute-event table is the canonical cross-country reconciliation source.
4. National ministry sources verify country-specific status where available, particularly Uganda and France.
5. WHO AFRO and Africa CDC reports are slower cross-checks and historical sources, not the primary 30-minute polling targets.

## Verified source matrix

| Source                             | Authority and exact resource                                                                                                                                                                                                                                                                   | Format and cadence                                             | Geographic coverage                                                  | Recommended role                                                                                | Limitations                                                                                                                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DRC Ministry/INSP SitReps          | [Ministry SitRep index](https://sante.gouv.cd/documents/sitreps) and [SitRep 118, reporting 9 September](https://administration.sante.gouv.cd/wp-content/uploads/2026/09/SitRep_MVEBDB_118_09_09_2026.pdf)                                                                                     | Public HTML index linking daily PDFs                           | DRC national, province, and health zone                              | Canonical DRC totals; verification source for all DRC observations                              | PDF tables require defensive extraction. The report can contain unresolved or internally flagged discrepancies. No general city-level case table was found.                                                             |
| OCHA HDX consolidated Ebola data   | [Dataset page](https://data.humdata.org/dataset/republique-democratique-du-congo-cas-et-deces-d-ebola) and [exact CSV resource](https://data.humdata.org/dataset/e902b209-b7bc-42f9-893a-294276d7cc62/resource/d90385d3-5339-4a3f-ac63-2699361edbe0/download/drc_ebola_cases_consolidated.csv) | CSV; metadata says daily; resource modified 11 September       | DRC health zones (`location_level=3`) with pcodes and daily measures | Preferred machine-readable health-zone adapter; validated against the corresponding INSP report | Latest records inspected were for 8 September. Data is manually transcribed from INSP reports. It does not provide a trustworthy national death total by summing zone rows because some deaths are awaiting allocation. |
| INRB/INSP open data repository     | [BDBV2026-Data](https://github.com/INRB-UMIE/BDBV2026-Data/) and [digitisation protocol](https://github.com/INRB-UMIE/BDBV2026-Data/blob/main/data/insp_sitrep/README.md)                                                                                                                      | Versioned CSV, GeoJSON, source PDFs, aliases, and QA artifacts | DRC national and health-zone time series plus health-zone geometry   | Provenance, fixtures, aliases, geometry, and cross-checking the HDX feed                        | Epidemiological tables are manually transcribed. Repository documentation warns that zone and national totals can disagree. Individual processed files may lag the newest PDF or HDX consolidation.                     |
| WHO daily acute-event table        | [WHO Alert and response](https://www.who.int/emergencies/alert-and-response)                                                                                                                                                                                                                   | Structured HTML table; updated when WHO reconciles new reports | Country-level DRC, Uganda, and France                                | Canonical global/country reconciliation and classification                                      | No province, health-zone, or city table. It can lag the DRC daily SitRep cutoff.                                                                                                                                        |
| WHO Disease Outbreak News          | [DON 617, published 10 September](https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON617)                                                                                                                                                                                      | Narrative HTML with tables and figures; periodic               | Global/country totals, selected DRC province and health-zone context | Authoritative narrative cross-check and event-status source                                     | Not a daily machine feed and not a complete health-zone dataset.                                                                                                                                                        |
| WHO AFRO weekly situation reports  | [Current and previous editions](https://www.afro.who.int/health-topics/disease-outbreaks/ebola-who-african-region?page=0)                                                                                                                                                                      | Weekly PDF reports                                             | DRC and Uganda; national, province, and selected health-zone detail  | Historical verification, weekly epidemiological curves, and contextual checks                   | Weekly cadence is too slow for the primary freshness path; PDF extraction required.                                                                                                                                     |
| Uganda Ministry of Health          | [Official Ebola Updates dashboard](https://evd-daily.health.go.ug/)                                                                                                                                                                                                                            | Public HTML dashboard; event-driven                            | Uganda national totals and response indicators                       | Canonical Uganda status, with WHO reconciliation                                                | Current page provides national totals but no dependable district/city case table. The outbreak was declared over on 28 July.                                                                                            |
| France government                  | [Official situation page](https://www.info.gouv.fr/actualite/ebola-point-de-situation-et-mesures-mises-en-oeuvre)                                                                                                                                                                              | Public narrative HTML; event-driven                            | France national case/status information                              | Verification for the single imported French case                                                | No publishable city-level case location was found or required. WHO is simpler for numeric reconciliation.                                                                                                               |
| Germany federal health information | [Federal Ministry Ebola information](https://www.bundesgesundheitsministerium.de/en/service/begriffe-von-a-z/e/ebola-disease/page)                                                                                                                                                             | Public narrative HTML; event-driven                            | Treatment status in Germany                                          | Classification check only                                                                       | The two patients treated in Germany were confirmed in DRC and remain included in DRC's count. Germany must not be added as a fourth affected country or counted again.                                                  |
| Africa CDC situation briefs        | [Africa CDC Knowledge Hub example](https://khub.africacdc.org/storage/uploads/publications/Tijb9rdGnOfOVGUICG2YsswYZH5jxwzsGhSC3Z4c.pdf)                                                                                                                                                       | Periodic PDF                                                   | Continental and country/province context                             | Secondary independent cross-check                                                               | No stable case-data API was found. Reports lag the DRC daily source and require PDF extraction.                                                                                                                         |

## Concrete findings

### The current HDX search is aimed at the wrong level

The current application calls:

```text
https://data.humdata.org/api/3/action/package_search?q=ebola+DRC&rows=3
```

That endpoint is useful for discovery, but the first three results inspected were older health-facility data, OpenStreetMap infrastructure exports, and a historical North Kivu outbreak dataset. The current 2026 consolidated case dataset appeared outside those first three results.

Production ingestion should use HDX `package_show` with the stable package identifier and then select the expected CSV resource by resource identifier or a validated schema. Search ranking must not choose the epidemiological source at runtime.

Verified package identifier:

```text
republique-democratique-du-congo-cas-et-deces-d-ebola
```

Verified resource identifier:

```text
d90385d3-5339-4a3f-ac63-2699361edbe0
```

### Current official DRC values

The Ministry's SitRep 118 has a reporting date of 9 September 2026 and a publication date of 10 September. It reports:

- 6,942 confirmed DRC cases;
- 3,349 confirmed deaths;
- 1,647 recovered patients;
- six affected provinces;
- 61 affected health zones;
- 349 affected health areas.

It provides a province table and a health-zone table. It does not provide case counts for 349 individual health areas or a general city table.

The report itself flags a daily recovery discrepancy: the headline says 36 recoveries while the listed provincial allocation totals 35. It also describes a recently imported case in Bulu health zone, Sud-Ubangi, while the consolidated six-province/61-zone table has not yet incorporated that geography. These are real upstream conflicts that require a `partial` or `conflict` validation state.

### What the HDX CSV contains

The current CSV has a normalized long-form schema with:

- country code;
- location level and name;
- source spelling;
- health-zone pcode;
- reference date;
- measure and case classification;
- cumulative/daily time period;
- value, source, and source URL.

For 8 September, it contains 61 health-zone confirmed-case records summing to 6,843. This explains the repository's 6,843 value: it is the DRC health-zone total for 8 September, not a global total and not a value derived by the current ETL.

The 61 confirmed-death rows sum to 2,902, not the national 3,310 reported for that date. The missing difference is caused by deaths that have not yet been allocated to individual health zones. Therefore:

- use the national report value for the DRC headline;
- use province values from the official province table;
- display health-zone values as reported;
- never manufacture health-zone allocations to make them sum to the national total;
- retain an explicit unallocated count where the source supplies or implies one.

### Country classification

WHO's latest inspected daily table reports affected countries as DRC, Uganda, and France. The two patients treated in Germany were diagnosed in DRC and are included in DRC's confirmed count. Germany is a treatment/medical-evacuation destination, not a fourth affected country for case aggregation.

### Geographic precision

The feasible geographic hierarchy is:

```text
country -> province -> health zone
```

Health-zone pcodes can be joined to the INRB/INSP health-zone geometry. A marker may be placed using the health-zone polygon or its representative point, but it must be labelled as a health zone. A city layer would require a separate authoritative city-level epidemiological source; no such general source was verified during this investigation.

## Recommended ingestion precedence

1. Discover the latest DRC SitRep from the Ministry index and parse its report/publication dates.
2. Fetch the exact HDX consolidated CSV resource for health-zone time series.
3. Require the HDX reference date to correspond to a known Ministry SitRep before publication.
4. Read national and province totals from the Ministry report; do not derive them from health-zone sums.
5. Reconcile DRC, Uganda, and France against the WHO daily table while preserving each source's reporting cutoff.
6. Verify Uganda and France status against their national sources.
7. Use WHO AFRO and Africa CDC only as secondary checks and historical context.
8. Preserve the previous validated snapshot as stale if required fields fail validation.

## Remaining hurdles before implementation

1. Implement and fixture-test the extraction rules defined in [live-data-reconciliation-contract.md](./live-data-reconciliation-contract.md).
2. Confirm redistribution terms before committing Ministry PDF fixtures to this repository; links and extracted factual values can be retained with attribution in the meantime.
3. Confirm how `unallocated` deaths and upstream conflicts appear in the existing UI without redesigning it.
4. Obtain or generate a stable pcode-to-province/geometry lookup from the verified health-zone geometry.
5. Define a strict policy for data corrections where cumulative values decrease between reports.

## Go/no-go result

Go for a country/province/health-zone pipeline. No-go for generalized city-level epidemiological data until a real city-level source is identified.
