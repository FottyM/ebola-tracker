# DATA-005: Add country and subnational adapters and geography

Status: Blocked  
Priority: High  
Dependencies: DATA-004, DATA-011

## Objective

Add the verified HDX, WHO, and national-source adapters and resolve every supported health zone through stable geographic identifiers.

Use the verified identifier and alias decisions in [remaining-gaps-resolution.md](../remaining-gaps-resolution.md). The HDX outbreak codes and geometry DHIS2 IDs are different identifier systems and must be preserved separately.

## Scope

- Fetch the exact HDX package/resource and validate its CSV schema.
- Parse WHO global/country values and reporting dates.
- Verify Uganda and France through national sources.
- Consume the versioned crosswalk and representative points produced by DATA-011.

## Non-goals

- Selecting datasets by HDX search ranking.
- Treating health-zone representative points as city coordinates.
- Displaying Germany as an additional affected country.

## Deliverables

- HDX, WHO, Uganda, and France adapters with fixtures.
- Versioned pcode, province, polygon, and representative-point mapping.
- Alias handling with explicit unresolved-name errors.
- Coverage and lag report for every run.

## Acceptance criteria

- Every current HDX health-zone pcode resolves exactly once.
- No mapping relies solely on fuzzy or substring matching.
- Health-zone records retain their true reference dates.
- Missing zones remain missing rather than zero.
- City precision is emitted only when an authoritative source supplies it.
- Source disagreements feed DATA-003 conflict handling.

## Verification

Test current pcodes, duplicates, unresolved codes, aliases, and date lag. Run `vp check` and `vp test --run`.
