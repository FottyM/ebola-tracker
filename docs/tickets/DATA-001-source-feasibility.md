# DATA-001: Verify authoritative sources and geographic coverage

Status: Complete  
Priority: Blocker  
Dependencies: None
Resolution: Verified source feasibility matrix, implemented server/pipeline/sources.js and unit tests, verified HDX stable identifiers, established city-level prohibition rule, and created legally compliant synthetic/factual fixtures without raw PDF redistribution.

## Objective

Identify exact authoritative resources for every supported epidemiological field and establish the maximum defensible geographic precision.

## Scope

- Inspect DRC Ministry/INSP, WHO, Uganda Ministry, France, Germany, Africa CDC, ReliefWeb, and HDX resources.
- Follow HDX catalog results to their underlying files and inspect actual records.
- Record format, cadence, reporting dates, identifiers, licensing, provenance, geographic grain, and failure modes.
- Distinguish affected countries from treatment or medical-evacuation destinations.

## Non-goals

- Implementing parsers or changing runtime data.
- Treating publisher reputation or HTTP success as record validation.
- Promising city-level detail without a city-level source.

## Deliverables

- [Source feasibility matrix](../live-data-source-feasibility.md).
- Exact canonical and fallback resources for each field.
- A supported/unsupported field list.
- Legally usable source fixtures or fixture-generation instructions.

## Acceptance criteria

- Every recommended resource has been inspected at record level.
- Country, province, health-zone, and city coverage are separately documented.
- HDX ingestion uses a stable package/resource identity rather than search rank.
- Imported and medically evacuated cases have an explicit classification rule.
- Licensing implications for committed fixtures are documented.
- Reviewers approve the source precedence recommendation.

## Verification

Recheck the Ministry index, exact HDX package/resource metadata and CSV reporting date, WHO country classification, and national authority pages before approval.

## Completion gate

Do not close until the Ministry fixture redistribution question is resolved or fixture-generation avoids redistributing the PDF.
