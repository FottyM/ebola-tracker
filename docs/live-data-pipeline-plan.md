# Live Epidemiological Data Pipeline Plan

Status: Draft for review  
Scope: Data ingestion, validation, delivery, freshness, and operational reliability  
Out of scope: Redesigning or simplifying the existing user interface

## Objective

Replace the mutable, hardcoded outbreak state with a traceable pipeline that derives countries, provinces, health zones, and cities from authoritative source records. The application must never present a successful network request, a locally generated timestamp, or inferred geography as proof that epidemiological data is current.

## Non-negotiable rules

1. Preserve the existing design, layout, styling, maps, charts, and interactions.
2. Every epidemiological value must be traceable to a publisher, source URL, source record, and reporting date.
3. HDX catalog availability is not evidence that a dataset is current. A specific package resource must be selected, downloaded, parsed, and validated.
4. Missing geographic detail stays missing. City or health-zone values must not be invented, proportionally allocated, or inferred from coordinates.
5. `sourceUpdatedAt` and `fetchedAt` are separate timestamps.
6. Failed ingestion must not advance the source timestamp or report a live status.
7. Previously validated data may be served during an outage only when clearly marked stale.
8. A scheduled check must publish only when validated source data or its provenance changes.

## Target pipeline

```text
Official publishers and validated HDX resources
                    |
                    v
            Source-specific adapters
                    |
                    v
          Normalized observations
 country -> province -> health zone -> city
                    |
                    v
      Validation, reconciliation, provenance
                    |
                    v
       Atomic, versioned data snapshot
                    |
                    v
       API / static build / existing UI
```

## Delivery phases

### 1. Source feasibility

Produce a source matrix covering WHO, DRC Ministry/COUSP, Uganda and other relevant national authorities, Africa CDC, and candidate HDX resources. Record authority, exact resource URL, format, geographic coverage, reporting fields, cadence, history, licensing, and failure characteristics.

The output must identify which fields can be supported reliably and explicitly identify unavailable fields.

### 2. Canonical data contract

Define normalized observations and snapshot metadata. At minimum, an observation must support:

- country name and ISO code;
- province;
- health zone;
- city, when explicitly provided by the source;
- cases, deaths, and recoveries;
- reporting period and publication date;
- publisher, source URL, and source record identifier;
- `sourceUpdatedAt` and `fetchedAt`;
- geographic precision and validation status.

### 3. Precedence and reconciliation

Define which source owns each geographic level and how reports with different cutoff times are handled. Parent and child totals must be reconciled without double-counting imported, transferred, or medically evacuated cases.

Conflicts must be recorded as data-quality events rather than silently overwritten.

### 4. First vertical slice

Implement one authoritative source end to end:

```text
retrieve -> parse -> normalize -> validate -> snapshot -> API
```

This slice must prove accurate freshness and failure behavior before additional adapters are added.

### 5. Geographic expansion

Add independently tested adapters for other authoritative sources and validated HDX resources. Country, province, health-zone, and city records are included only at the precision actually supplied by each source.

### 6. State and delivery replacement

Remove `liveOutbreakState` as the source of truth. Both static builds and runtime APIs must consume the latest validated snapshot. The previous validated snapshot becomes an explicit stale fallback, not a mutable seed.

Development, production, and optional edge deployments must return the same data contract.

### 7. Truthful freshness presentation

Expose:

- source reporting time;
- snapshot publication time;
- scheduled check cadence;
- current, unchanged, stale, partial, or failed state.

Add a compact last-update treatment using the existing design system without restructuring the interface.

### 8. Scheduling and publication

Check sources every 30 minutes. Do not imply that publishers update every 30 minutes. Skip commits and deployments when the normalized data and provenance are unchanged.

Writes must be atomic, and overlapping ingestion runs must be prevented.

### 9. Verification and rollout

Add fixture-based parser tests, schema-change detection, reconciliation tests, stale/failure tests, API contract tests, and UI regression coverage. Roll out behind a verification step that compares generated results with the authoritative reports before the new snapshot becomes public.

## Completion criteria

The project is complete when:

- no displayed epidemiological value originates from a manually authored dashboard total;
- every displayed value has machine-readable provenance;
- unsupported geographic detail is visibly absent instead of inferred;
- outages retain the last validated report with an accurate stale state;
- 30-minute checks do not create timestamp-only deployments;
- API, static deployment, and client rendering use the same validated snapshot;
- the existing visual design remains intact apart from the approved freshness indicator.

## Execution backlog

The implementation is divided into ordered tickets in [live-data-pipeline-tickets.md](./live-data-pipeline-tickets.md). Work begins with `DATA-001`; implementation must not begin before its source recommendation is reviewed.

The initial source investigation and recommendation are recorded in [live-data-source-feasibility.md](./live-data-source-feasibility.md).

The extraction, freshness, and reconciliation rules are defined in [live-data-reconciliation-contract.md](./live-data-reconciliation-contract.md).

The production delivery sequence for the existing GitHub Pages deployment is defined in [github-pages-data-delivery-plan.md](./github-pages-data-delivery-plan.md).

The remaining implementation gaps and their chosen resolutions are recorded in [remaining-gaps-resolution.md](./remaining-gaps-resolution.md).
