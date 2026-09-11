# Live Data Extraction and Reconciliation Contract

Status: Draft decision based on Ministry reports dated 6-9 September 2026  
Scope: Source discovery, extraction boundaries, aggregation, conflicts, and freshness  
Out of scope: Application design changes and implementation code

## Decision

Use a hybrid pipeline:

- DRC Ministry/INSP SitRep: canonical national and province totals.
- Exact OCHA HDX consolidated CSV: machine-readable DRC health-zone observations and pcodes.
- DRC Ministry/INSP SitRep: verification of HDX health-zone values and explicit unallocated values.
- WHO daily table: cross-country classification and reconciliation.
- National authority pages: country-specific status verification.

Do not wait for every source to share the same reporting date. Preserve the reporting date of each geographic level and mark mixed-date snapshots as `partial`.

## Extraction feasibility result

The Ministry reports for 6, 7, 8, and 9 September were inspected. Across those reports:

- the reporting and publication dates appear in the first-page header;
- national cases, deaths, recoveries, case-fatality ratio, affected provinces, and affected health-zone count appear in the first-page summary;
- the province table consistently contains new cases, cumulative cases, cumulative deaths, CFR, and affected-zone counts;
- the health-zone table consistently follows the province table and may span page boundaries;
- confirmed deaths awaiting health-zone assignment appear as `A ventiler` under a province;
- extracted text may split names such as `Boma Mangbetu` across lines and may insert control characters in names such as `Makiso-Kisangani`;
- spacing and punctuation vary, so extraction cannot rely on fixed character columns.

This is sufficiently stable for guarded extraction of national and province totals. Health-zone ingestion should prefer the HDX CSV because it already normalizes names and supplies pcodes. PDF health-zone extraction remains a verification/fallback path, not the first implementation path.

## Source discovery

### Ministry reports

Poll the public SitRep index:

```text
https://sante.gouv.cd/documents/sitreps
```

Extract all linked reports matching the Ebola SitRep title and retain:

- absolute PDF URL;
- visible reporting-date label;
- report number when present;
- content length, ETag, and Last-Modified headers when supplied;
- SHA-256 digest after download.

Select the newest report by the reporting date parsed from the document, not by filename, link order, HTTP Last-Modified, or report number alone.

### HDX resource

Call HDX `package_show` with the stable package identifier:

```text
republique-democratique-du-congo-cas-et-deces-d-ebola
```

Select the expected resource identifier:

```text
d90385d3-5339-4a3f-ac63-2699361edbe0
```

Reject the response if the resource disappears, changes away from CSV, or no longer matches the expected schema. Do not use `package_search` ranking to select a production source.

## Required extracted records

### Report identity

```text
publisher
reportNumber
reportingDate
publicationDate
sourceUrl
contentSha256
fetchedAt
```

Dates that have no source time remain date-only values. The pipeline must not invent midnight, noon, or end-of-day timestamps.

### National observation

```text
countryCode = COD
confirmedCases
confirmedDeaths
recovered
cfr
affectedProvinceCount
affectedHealthZoneCount
affectedHealthAreaCount
reportingDate
sourceUrl
```

### Province observation

```text
provinceName
newConfirmedCases
cumulativeConfirmedCases
cumulativeConfirmedDeaths
cfr
affectedHealthZones
totalHealthZones
reportingDate
sourceUrl
```

### Health-zone observation

Use the HDX schema fields as the source record and normalize them into:

```text
countryCode
provinceCode
provinceName
healthZonePcode
healthZoneName
referenceDate
measure
classification
timePeriod
value
source
sourceUrl
```

The province fields come from a versioned pcode lookup, not name guessing.

## Reconciliation rules

### Rule 1: national totals come from the national report

The headline DRC values must use the Ministry report's national values. Never calculate national deaths by summing health zones.

Required checks:

```text
national cases == sum(province cumulative cases)
national deaths == sum(province cumulative deaths)
national new cases == sum(province new cases)
reported CFR ~= national deaths / national cases
```

Allow only rounding tolerance for CFR. A cases/deaths mismatch blocks publication of the new report.

### Rule 2: province values come from the province table

Province totals must not be replaced with a health-zone sum. Health-zone allocation can be incomplete even when province totals are current.

For each province:

```text
allocated zone cases <= province cases
allocated zone deaths <= province deaths
unallocated cases = province cases - allocated zone cases
unallocated deaths = province deaths - allocated zone deaths
```

Differences are explicit `unallocated` observations at province precision. They must never be assigned to a real health zone or marker.

If the report explicitly provides `A ventiler`, compare it with the calculated difference. A mismatch becomes a conflict and blocks a `current` status.

### Rule 3: health zones remain independently dated

The health-zone layer uses the newest fully validated HDX reference date. When that date lags the Ministry report:

- keep national and province values at the newer Ministry date;
- keep health-zone values at their actual HDX reference date;
- mark the snapshot `partial`;
- expose the separate dates;
- do not add national growth to health zones.

### Rule 4: missing is not zero

An absent health zone, missing measure, blank cell, `ND`, or unavailable geography is `null`/missing. It is never normalized to zero unless the source explicitly reports zero.

### Rule 5: corrections are allowed but recorded

Cumulative values may decrease after source reconciliation. Accept a decrease only when it comes from a newer identified report and record:

```text
correction = true
previousValue
newValue
previousSource
newSource
```

A monotonicity check may warn, but it must not rewrite the authority's corrected value.

### Rule 6: global totals use a common authority and cutoff

Do not create a global headline by summing countries whose latest reports have different cutoff dates. Use the WHO global total and its date when available.

Country cards may show fresher national values, but every card retains its own reporting date. The interface must not imply that all country values share a common cutoff.

### Rule 7: Germany is not an additional affected-country count

Patients diagnosed in DRC and treated in Germany remain DRC cases. A medical-evacuation destination may be represented separately from the epidemiological country count, without duplicating cases.

## Freshness states

### `current`

- newest Ministry report parsed successfully;
- national and province checks pass;
- health-zone feed matches the same reporting date;
- cross-country classification passes;
- no blocking conflict exists.

### `partial`

- national/province data is valid;
- health-zone data is valid but older, incomplete, or contains explicit unallocated values;
- each affected section exposes its own reporting date.

### `unchanged`

- all source content and normalized epidemiological values match the last validated run;
- `fetchedAt` may be logged operationally but must not trigger publication.

### `stale`

- the newest source could not be retrieved or validated;
- the last-known-good snapshot is served with its original reporting dates.

### `failed`

- no valid snapshot exists, or a blocking conflict makes publication unsafe;
- fabricated baseline values must not be served.

## Blocking validations

Do not publish a new snapshot when any of these occur:

- missing or unparsable reporting date;
- national cases or deaths missing;
- province cases/deaths do not reconcile with national totals;
- duplicate province or health-zone identity for the same date and measure;
- HDX schema or resource identity changes unexpectedly;
- negative count;
- death count exceeds case count at the same scope/classification;
- newer report link resolves to older report content;
- country classification double-counts an imported or medically evacuated case.

## Non-blocking validations

Publish as `partial` with recorded conflicts when:

- health-zone data lags a valid national/province report;
- zone allocations do not reach province totals and the difference is represented as unallocated;
- daily narrative values contain a discrepancy while cumulative national/province tables reconcile;
- WHO's cutoff lags the latest national cutoff.

## Tested recent sequence

| Reporting date | DRC cases | DRC deaths | New cases |      Provinces |    Health zones | Result                                                                      |
| -------------- | --------: | ---------: | --------: | -------------: | --------------: | --------------------------------------------------------------------------- |
| 6 September    |     6,686 |      3,226 |        82 |              6 |              61 | Structure extractable; national and province totals agree                   |
| 7 September    |     6,757 |      3,267 |        71 |              6 |              61 | Structure extractable; explicit unallocated deaths present                  |
| 8 September    |     6,843 |      3,310 |        86 |              6 |              61 | Structure extractable; matches the latest inspected HDX reference date      |
| 9 September    |     6,942 |      3,349 |        99 | 6 consolidated | 61 consolidated | Structure extractable; narrative flags recovery and new-geography conflicts |

## Outcome

The extraction hurdle is feasible with a fail-closed hybrid strategy. The next hurdle is defining and building the versioned pcode/geometry join so every HDX health zone maps to the correct province and representative map location without name guessing or city mislabelling.
