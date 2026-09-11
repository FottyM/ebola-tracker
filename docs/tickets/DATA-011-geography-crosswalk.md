# DATA-011: Build the verified health-zone geography crosswalk

Status: Complete  
Priority: Blocker  
Dependencies: DATA-001
Resolution: Implemented deterministic health-zone crosswalk in server/pipeline/geography/health-zone-crosswalk.js mapping all 61 active health zones, incorporating the four reviewed aliases without fuzzy matching, generating guaranteed representative points, and producing stripped artifacts in public/geography/.

## Objective

Create a deterministic, versioned join between HDX outbreak health-zone records and the geometry used by the map without fuzzy matching or city mislabelling.

## Scope

- Preserve the HDX source code and geometry DHIS2 ID as separate identifiers.
- Generate exact normalized-name matches against the 519-feature health-zone geometry.
- Add explicit reviewed mappings for `Gethy -> Gety (Ituri)`, `Lubunga -> Lubunga (Tshopo)`, `Mongbalu -> Mongbwalu (Ituri)`, and `Nyakunde -> Nyankunde (Ituri)`.
- Derive province membership from the verified geometry/crosswalk.
- Generate a deterministic representative point guaranteed to lie on or within each health-zone feature.
- Produce minimal crosswalk and point artifacts without copying unrelated epidemiological properties from the source GeoJSON.

## Non-goals

- Fuzzy, phonetic, or substring matching in publication code.
- Calling representative health-zone points cities.
- Shipping the full mixed-purpose 8 MB source GeoJSON merely to place markers.

## Deliverables

- Versioned `health-zone-crosswalk` artifact.
- Versioned `health-zone-points` artifact.
- Crosswalk generator with source provenance and checksums.
- Coverage, duplicate, alias, and point-on-feature tests.

## Acceptance criteria

- All 61 current outbreak health-zone records resolve exactly once.
- The 57 direct matches remain deterministic.
- The four explicit aliases resolve to the reviewed province and DHIS2 IDs.
- Any new, missing, duplicate, or changed mapping fails closed.
- Every representative point passes a point-in/on-feature check.
- Output labels records as health zones, never cities.

## Verification

Run the generator twice and require byte-equivalent output, 61/61 coverage, unique identifiers, valid geometry points, `vp check`, and `vp test --run`.
