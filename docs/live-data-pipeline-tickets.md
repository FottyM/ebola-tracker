# Live Data Pipeline Tickets

These tickets implement the [Live Epidemiological Data Pipeline Plan](./live-data-pipeline-plan.md). They are ordered by dependency. Completing a later ticket does not waive the acceptance criteria of an earlier ticket.

> Planning status: complete as of 11 September 2026. The implementation backlog below covers all identified work. General city-level epidemiological data is intentionally unsupported until an authoritative city-level source is verified; health-zone data must not be relabelled as city data.

## Individual ticket files

| Ticket                                                 | Title                                                  | Status   |
| ------------------------------------------------------ | ------------------------------------------------------ | -------- |
| [DATA-001](./tickets/DATA-001-source-feasibility.md)   | Verify authoritative sources and geographic coverage   | Complete |
| [DATA-002](./tickets/DATA-002-data-contract.md)        | Define normalized observations and snapshot contract   | Complete |
| [DATA-003](./tickets/DATA-003-reconciliation.md)       | Implement source precedence and reconciliation rules   | Complete |
| [DATA-004](./tickets/DATA-004-first-source-adapter.md) | Build the first authoritative source adapter           | Complete |
| [DATA-005](./tickets/DATA-005-geographic-adapters.md)  | Add country and subnational adapters and geography     | Complete |
| [DATA-006](./tickets/DATA-006-snapshot-state.md)       | Replace mutable hardcoded outbreak state               | Complete |
| [DATA-007](./tickets/DATA-007-delivery-wiring.md)      | Unify API, static build, and client data wiring        | Complete |
| [DATA-008](./tickets/DATA-008-freshness-ui.md)         | Present truthful freshness and provenance              | Open     |
| [DATA-009](./tickets/DATA-009-scheduling.md)           | Schedule safe 30-minute ingestion                      | Open     |
| [DATA-010](./tickets/DATA-010-verification-rollout.md) | Add integrity tests, observability, and rollout checks | Blocked  |
| [DATA-011](./tickets/DATA-011-geography-crosswalk.md)  | Build the verified health-zone geography crosswalk     | Complete |
| [DATA-012](./tickets/DATA-012-pdf-fixtures.md)         | Create licensing-safe PDF extraction fixtures          | Complete |
| [DATA-013](./tickets/DATA-013-pages-manifest.md)       | Implement the GitHub Pages manifest and cache protocol | Complete |
| [DATA-014](./tickets/DATA-014-rollback-retention.md)   | Implement snapshot retention and rollback              | Blocked  |
| [DATA-015](./tickets/DATA-015-source-health.md)        | Separate source health from epidemiological freshness  | Blocked  |

## Global guardrails

- Do not redesign or simplify the current interface.
- Do not manually enter epidemiological totals to make a parser or test pass.
- Do not claim city-level precision unless the source explicitly supplies it.
- Do not treat HTTP success or HDX catalog search success as data validation.
- Preserve unrelated working-tree changes.

## DATA-001: Produce the authoritative source feasibility matrix

Priority: Blocker  
Dependencies: None

### Scope

Inspect exact source resources from WHO, DRC Ministry/COUSP, Uganda and other relevant national authorities, Africa CDC, ReliefWeb, and HDX. For HDX, follow catalog results to their underlying resources and inspect actual records and reporting dates.

### Deliverables

- A committed source matrix documenting publisher, exact endpoint/resource URL, format, authentication, geographic coverage, update cadence, source date, stable identifiers, licensing, and known failure modes.
- Sample responses or legally redistributable fixtures for viable sources.
- A recommended canonical source for every supported field and a fallback order.
- An explicit list of unsupported fields and geographic levels.

### Acceptance criteria

- Every recommended source has been inspected at the record level.
- No recommendation relies solely on a search result or HTTP 200 response.
- The matrix distinguishes country, province, health-zone, and city coverage.
- The recommendation explains how imported and medically evacuated cases are represented.
- The source recommendation is reviewed before parser implementation begins.

## DATA-002: Define the normalized observation and snapshot contracts

Priority: Blocker  
Dependencies: DATA-001

### Scope

Define versioned schemas for source observations, geographic identities, provenance, ingestion runs, validation results, and the public snapshot.

### Deliverables

- Runtime-validatable schemas.
- Documented nullability and geographic precision rules.
- Separate `sourceUpdatedAt`, `publishedAt`, and `fetchedAt` semantics.
- A migration mapping from normalized observations to the fields currently consumed by the UI.

### Acceptance criteria

- Missing geographic levels remain null and cannot be silently synthesized.
- Every observation requires publisher and source provenance.
- The contract represents current, unchanged, stale, partial, and failed states.
- Schema validation rejects negative counts, invalid dates, and impossible geographic relationships.

## DATA-003: Define precedence, identity, and reconciliation rules

Priority: Blocker  
Dependencies: DATA-001, DATA-002

### Scope

Specify source precedence by geography and metric, stable geographic identifiers, reporting-cutoff handling, correction handling, and aggregation rules.

### Deliverables

- A precedence policy.
- Rules for imported, transferred, duplicate, and medically evacuated cases.
- Parent/child reconciliation checks.
- A conflict record format and severity levels.

### Acceptance criteria

- Country totals cannot accidentally mix reporting dates without a recorded warning.
- Geographic aggregation cannot double-count the same case population.
- Conflicts are retained with provenance rather than silently overwritten.
- A failed reconciliation prevents publication when it could materially mislead users.

## DATA-004: Implement the first authoritative vertical slice

Priority: High  
Dependencies: DATA-002, DATA-003

### Scope

Implement retrieval, parsing, normalization, validation, and snapshot generation for the strongest source selected in DATA-001.

### Deliverables

- A source-specific adapter with timeouts and bounded retries.
- Versioned source fixtures.
- Parser and normalization tests.
- A generated snapshot containing source provenance and freshness metadata.

### Acceptance criteria

- Generated values match the selected official report fixture.
- Network failure does not modify data or `sourceUpdatedAt`.
- Source format changes fail closed with an actionable error.
- Repeated ingestion of unchanged source data produces identical epidemiological output.

## DATA-005: Add country and subnational source adapters

Priority: High  
Dependencies: DATA-004

### Scope

Add adapters needed for supported countries, provinces, health zones, and cities. Include a specific HDX resource only if DATA-001 proves it is current, relevant, and structurally usable.

### Deliverables

- Independently tested adapters and fixtures.
- Geographic identity mapping based on stable codes where available.
- Precision metadata for every normalized location.
- Documented coverage gaps.

### Acceptance criteria

- Each adapter proves the reporting date of the data it emits.
- City records exist only when named by a source record.
- Adding a source cannot overwrite higher-precedence data without a conflict record.
- Combined output passes DATA-003 reconciliation rules.

## DATA-006: Replace mutable hardcoded outbreak state

Priority: High  
Dependencies: DATA-004; DATA-005 for full geographic coverage

### Scope

Remove `liveOutbreakState` as the application source of truth. Generate and load an atomic, versioned snapshot from validated normalized observations.

### Deliverables

- Atomic snapshot generation and replacement.
- Last-known-good snapshot retention.
- Explicit stale fallback behavior.
- Removal of timestamp mutation on unsuccessful or unchanged ingestion.

### Acceptance criteria

- Runtime data does not initialize from manually authored epidemiological totals.
- Interrupted writes cannot leave a partial snapshot.
- Failed ingestion serves the last validated snapshot as stale.
- Snapshot provenance identifies the source records used to derive every aggregate.

## DATA-007: Unify API, static build, and client data wiring

Priority: High  
Dependencies: DATA-006

### Scope

Make development, production, static builds, and any supported edge runtime consume the same validated contract. Repair the development JSON endpoint and define the GitHub Pages data-loading strategy.

### Deliverables

- A working `/api/ebola-data` JSON contract where a runtime API is supported.
- A generated-data strategy for static GitHub Pages.
- Removal or repair of unsupported deployment entry points.
- Client refresh behavior appropriate to the selected hosting model.

### Acceptance criteria

- Development API requests return JSON rather than application HTML.
- Static and runtime renderings agree for the same snapshot version.
- The client cannot silently fall back to fabricated baseline totals.
- Existing layout, styling, maps, charts, and interactions remain unchanged.

## DATA-008: Add truthful freshness and provenance presentation

Priority: High  
Dependencies: DATA-007

### Scope

Expose source reporting time, last successful check, next check, and freshness state. Add one compact indicator using the existing visual language.

### Deliverables

- Public freshness fields in the data contract.
- A compact last-update indicator.
- Accessible labels explaining stale, partial, and failed states.
- Links or references to underlying source provenance.

### Acceptance criteria

- “Updated” refers to the source reporting time, not merely process execution.
- A failed check is never displayed as live or current.
- The indicator works on existing desktop and mobile layouts.
- Visual regression review confirms that no other design changes occurred.

## DATA-009: Schedule safe 30-minute ingestion checks

Priority: Medium  
Dependencies: DATA-006, DATA-007

### Scope

Run ingestion every 30 minutes, prevent overlapping runs, and publish only validated changes.

### Deliverables

- Updated scheduler configuration.
- Concurrency protection.
- Content-based change detection that excludes check-time-only changes.
- Atomic publish and rollback behavior.

### Acceptance criteria

- The scheduler checks at 30-minute intervals while describing source cadence accurately.
- Unchanged source data creates no snapshot commit or deployment.
- Failed validation leaves the public snapshot unchanged and reports failure.
- Package-manager and build commands match the versions supported by the repository.

## DATA-010: Add integrity, regression, and operational coverage

Priority: High  
Dependencies: DATA-004 through DATA-009

### Scope

Replace literal-value smoke tests with source, schema, reconciliation, delivery, failure, and UI-regression coverage. Add ingestion-run observability.

### Deliverables

- Parser fixture tests and schema-change tests.
- Reconciliation and duplicate-detection tests.
- Stale, partial, timeout, and malformed-source tests.
- API/static parity and UI visual-regression tests.
- Structured ingestion logs and failure notification documentation.

### Acceptance criteria

- Tests prove values are derived from fixtures rather than hardcoded expectations.
- A source schema change cannot silently publish incorrect totals.
- CI runs formatting, linting, type checking, tests, and a representative ingestion dry run.
- Rollout includes a comparison of generated output with the latest authoritative reports.

## Recommended execution order

```text
DATA-001 -> DATA-011
    |
    +----> DATA-012
    |
DATA-002 -> DATA-003 -> DATA-004 -> DATA-005 -> DATA-006
                                                 |
                                                 +-> DATA-013 -> DATA-007 -> DATA-008
                                                 |                 |
                                                 +-> DATA-009 -----+-> DATA-014
                                                                   |
                                                                   +-> DATA-015
                                                                        |
                                                                        v
                                                                     DATA-010
```

## Next ticket

Start with `DATA-001`. Its source matrix is the decision gate for the rest of the work; no ETL rewrite should begin until that ticket identifies exact usable resources and documents the geographic detail they truly provide.
