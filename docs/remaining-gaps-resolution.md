# Remaining Data Pipeline Gaps and Resolutions

Status: Planning complete; implementation pending  
Checked: 11 September 2026  
Production host: GitHub Pages

## Outcome

Every known architectural gap now has a defined treatment. The only deliberately unsupported feature is generalized city-level epidemiological data because no authoritative city-level case feed was verified.

This is a source limitation, not an implementation gap. It requires no further planning work unless an authoritative city-level source becomes available.

These decisions do not make the current ETL correct. They define how implementation must solve the known problems without inventing data or redesigning the application.

## 1. Missing city-level case data

### Problem

The official DRC sources provide country, province, and health-zone observations. Some health zones have the same names as cities, but a health-zone total is not automatically a city total.

### Resolution

- The supported epidemiological hierarchy is `country -> province -> health zone`.
- Do not emit `city` unless an authoritative source explicitly labels a record at city precision.
- Display health-zone markers as health zones, even when their names match cities.
- Medical-evacuation destinations remain a separate event layer and do not become affected-city counts.

### Verification

The current Ministry SitRep contains province and health-zone tables but no general city case table. City remains nullable and absent in the normalized contract.

## 2. Mismatched geographic identifiers

### Problem

The HDX outbreak CSV labels codes such as `CD540202` as pcodes. The verified INRB/INSP health-zone geometry uses DHIS2 organization IDs such as `GPi6i83o7l6`. These identifiers cannot be joined directly.

### Verified coverage

The latest inspected HDX date contained 61 confirmed-case health-zone rows and 61 unique source codes.

- 57 health zones matched the 519-feature geometry uniquely after deterministic normalization of accents, punctuation, and whitespace.
- Four require explicit reviewed aliases:

| HDX source code | HDX source name | Geometry name    | Province | Geometry DHIS2 ID |
| --------------- | --------------- | ---------------- | -------- | ----------------- |
| `CD540203`      | Gethy           | Gety             | Ituri    | `X8zFJ7DJlRD`     |
| `CD910703`      | Lubunga         | Lubunga (Tshopo) | Tshopo   | `I9d1F9TGn33`     |
| `CD540510`      | Mongbalu        | Mongbwalu        | Ituri    | `nv8tx681Gjd`     |
| `CD540205`      | Nyakunde        | Nyankunde        | Ituri    | `mGTaa8TFifO`     |

### Resolution

- Create a versioned crosswalk containing both source identifier systems.
- Seed it from exact normalized-name matches and the two explicit aliases above.
- Require `sourceCode + sourceName + province + geometryDhids2Id` to remain unique.
- New or changed source names fail closed until a reviewed crosswalk entry is added.
- Never use fuzzy matching in publication code.

### Representative map points

- Preserve the source polygon geometry separately.
- Generate a deterministic point guaranteed to lie on/in the health-zone feature using a tested point-on-feature operation.
- Do not use an unchecked polygon centroid because a centroid may fall outside a concave or multi-part polygon.
- Label the result `healthZoneRepresentativePoint`, not city coordinates.

## 3. Large and mixed-purpose geometry source

### Problem

The verified INRB/INSP GeoJSON contains 519 health-zone features and many unrelated nested indicators. Shipping the full source merely to place markers would unnecessarily enlarge the Pages payload and mix geometry with stale indicators.

### Resolution

Generate two versioned artifacts during ingestion/build:

```text
geography/health-zone-crosswalk.json
geography/health-zone-points.json
```

The crosswalk retains source names, province, both identifier systems, and provenance. The points artifact contains only the geometry identity and representative coordinates needed by the existing marker design. Province polygons continue to use the existing province-boundary layer.

Do not copy epidemiological properties embedded in the source GeoJSON into these geography artifacts.

## 4. Ministry PDF redistribution and test fixtures

### Problem

The reports are publicly downloadable, but no explicit permission to redistribute complete PDF copies in this repository was verified. Committing raw PDFs would create avoidable licensing risk.

### Resolution

- Do not commit Ministry PDFs.
- Store the public report URL, report identity, content hash, and attribution.
- Unit-test extraction with synthetic text/JSON fixtures representing the observed table structures and edge cases.
- Keep an optional, non-CI integration command that downloads current public reports and runs the parser locally.
- Commit only minimal factual normalized fixtures needed for reconciliation tests, with source citations.

This is a risk-minimizing engineering policy, not a legal opinion.

## 5. PDF layout and source drift

### Problem

Recent reports are structurally similar, but whitespace, line breaks, punctuation, and names vary. Tables cross page boundaries and extracted text can contain control characters.

### Resolution

- Select reports by the reporting date parsed from content.
- Anchor extraction on semantic French labels and known table headings, not fixed character positions.
- Normalize Unicode, whitespace, thousands separators, and decimal commas before parsing.
- Extract national and province tables independently and reconcile them.
- Prefer the HDX CSV for health-zone ingestion; use PDF health-zone rows for verification/fallback.
- Validate required headings, expected columns, row uniqueness, and totals.
- Any unknown structure fails closed and preserves the last-known-good snapshot.

## 6. Unallocated deaths and other unresolved values

### Problem

National and province death totals exceed allocated health-zone deaths because the Ministry explicitly reports deaths awaiting assignment. For 8 September, health-zone death rows sum to 2,902 while the national total is 3,310.

### Resolution

- National headline values come from the Ministry national summary.
- Province values come from the Ministry province table.
- Health-zone values remain exactly as allocated by the source.
- Store the difference as an `unallocated` observation at province precision when the province is known.
- Do not create a marker or fake health zone for unallocated values.
- A source-provided `A ventiler` value must reconcile with the calculated gap; disagreement creates a conflict.

## 7. Upstream corrections and contradictions

### Problem

Official reports can correct cumulative values, lag between geographic levels, or contradict their own narrative. The 9 September report flags a recovery allocation mismatch and mentions new Bulu/Sud-Ubangi geography not yet included in its consolidated six-province table.

### Resolution

- Accept corrections only from a newer identified source and retain previous/new provenance.
- National/province table reconciliation is blocking.
- Narrative-only discrepancies and lagging health-zone coverage produce `partial`, not `current`.
- Never repair an authority's discrepancy by inventing allocations.
- Publish section-specific reporting dates.

## 8. GitHub Actions is not an exact scheduler

### Problem

GitHub Actions scheduled workflows may start late or be skipped during platform congestion. A cron expression cannot guarantee an exact service-level interval.

### Resolution

- Schedule checks with `7,37 * * * *` and describe this as a twice-hourly best-effort check. This avoids the start-of-hour congestion window documented by GitHub while preserving a 30-minute interval.
- Use one concurrency group for ingestion and Pages deployment.
- Allow at most one running and one current pending run; superseded queued checks need not publish.
- Bound network and total job duration.
- Keep manual dispatch on the same command path.
- Do not display a guaranteed “next check at” time.

## 9. Honest timestamps on a static site

### Problem

When an unchanged scheduled check does not deploy, GitHub Pages cannot know that it occurred. Publishing a new page merely to advance “last checked” would cause timestamp-only deployments and imply more freshness than the source provides.

### Resolution

The public snapshot/manifest exposes:

- `sourceUpdatedAt`: when the authority says the data applies;
- `sourcePublishedAt`: when the authority published it, if known;
- `snapshotPublishedAt`: when this validated snapshot was deployed;
- `scheduledCadenceMinutes: 30`;
- section-specific source dates and status.

Operational checks that produce no new deployment remain in GitHub Actions logs. The page does not claim those checks occurred.

The browser derives age-based staleness from `sourceUpdatedAt`; it does not claim an outage cause it cannot observe.

## 10. GitHub Pages caching and base paths

### Problem

GitHub Pages serves static cached files under the repository base path. Root-relative data URLs and a permanently cached mutable file can prevent users from seeing a new deployment.

### Resolution

- Resolve data URLs from `import.meta.env.BASE_URL`.
- Publish a small mutable `data/manifest.json`.
- Fetch the manifest with `cache: "no-store"` and a cache-busting query value.
- Publish snapshots at content-addressed immutable URLs.
- Poll only the manifest every 30 minutes and immediately when a hidden page becomes visible.
- Download a snapshot only when its ID changes.
- Keep the currently displayed validated snapshot if refresh fails.

## 11. Minimal freshness UI without redesign

### Problem

Users need freshness and source status, but previous attempts changed the design beyond the ETL scope.

### Resolution

- Add one compact line within the existing source/status area.
- Reuse existing typography, spacing, colors, and responsive behavior.
- Primary label: `Data through <source date>`.
- Secondary status: current, partial, or stale, with source detail accessible without changing the dashboard layout.
- Protect every other visual element with desktop/mobile regression screenshots.

No card, modal, chart, map, navigation, layout, or typography redesign is authorized.

## 12. Rollback and last-known-good retention

### Problem

A bad source update or parser regression must not replace the only valid Pages deployment.

### Resolution

- Content-address snapshots and commit them only when validated epidemiological content/provenance changes.
- Keep the manifest pointer change in the same atomic commit as the new snapshot.
- Build and test before Pages deployment.
- A failed workflow never calls the Pages deployment step.
- Retain prior snapshot files and git history for audit and rollback.
- Roll back by rebuilding a selected prior validated manifest/snapshot pair.
- Add retention pruning only after a minimum history policy exists; never delete the only last-known-good snapshot.

## 13. Data-source health versus epidemiological freshness

### Problem

The current application uses HTTP 200 and labels such as `Live (200 OK)` as if connectivity proved current epidemiological content.

### Resolution

Track these separately:

```text
transportStatus: reachable | unreachable
parseStatus: valid | invalid
validationStatus: valid | conflict | blocking
freshnessStatus: current | partial | stale
```

Only validated source reporting dates determine epidemiological freshness. HTTP status is operational metadata and is not displayed as proof that figures are current.

## Implementation order

1. Commit the identifier crosswalk and representative-point generator with 61/61 coverage tests.
2. Finalize runtime schemas for observations, unallocated values, provenance, conflicts, and snapshots.
3. Implement Ministry report discovery and national/province extraction.
4. Implement exact HDX resource ingestion and crosswalk join.
5. Implement reconciliation and freshness states.
6. Generate content-addressed snapshots and the Pages manifest.
7. Wire the existing build and client to those artifacts.
8. Add the compact freshness line under visual-regression protection.
9. Implement the twice-hourly Actions workflow and rollback safeguards.
10. Verify the deployed Pages site end to end.

## Remaining external limitation

There is still no verified general city-level epidemiological feed. This is not an unresolved implementation bug: it is a source limitation. The truthful implementation omits city-level claims until an authoritative source provides them.

## References

- [DRC Ministry SitRep index](https://sante.gouv.cd/documents/sitreps)
- [OCHA HDX consolidated Ebola dataset](https://data.humdata.org/dataset/republique-democratique-du-congo-cas-et-deces-d-ebola)
- [INRB/INSP outbreak data and health-zone geometry](https://github.com/INRB-UMIE/BDBV2026-Data/)
- [GitHub documentation: scheduled events can be delayed or dropped](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [GitHub documentation: workflow concurrency](https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency)
- [GitHub documentation: custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
