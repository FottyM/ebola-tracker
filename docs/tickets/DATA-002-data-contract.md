# DATA-002: Define normalized observations and snapshot contract

Status: Complete  
Priority: Blocker  
Dependencies: DATA-001
Resolution: Defined versioned runtime-validatable schemas in server/pipeline/contracts.js, enforced provenance and geographic precision rules, separated sourceUpdatedAt/publishedAt/fetchedAt timestamps, implemented snapshot aggregation, and mapped snapshots to the existing UI legacy state.

## Objective

Create versioned, runtime-validatable contracts for source records, normalized observations, geographic identities, provenance, conflicts, ingestion runs, and the public snapshot.

## Scope

- Define country, province, health-zone, unallocated, and medical-evacuation records.
- Define explicit geographic precision and nullability.
- Separate reporting, publication, fetch, and scheduling dates.
- Define source and snapshot version identifiers.
- Map normalized fields to existing UI consumers without changing the design.

## Required semantics

- `sourceUpdatedAt`: source reporting date/time, at its published precision.
- `publishedAt`: source publication date/time, when supplied.
- `fetchedAt`: successful retrieval time.
- `scheduledCadenceMinutes`: declared polling cadence, not a guaranteed next-run time.
- `status`: `current`, `partial`, `unchanged`, `stale`, or `failed`.

## Deliverables

- Runtime schemas and corresponding static types/JSDoc.
- Contract documentation with representative valid and invalid examples.
- Snapshot versioning and migration rules.
- Mapping from current renderer inputs to derived normalized values.

## Acceptance criteria

- Every epidemiological observation requires publisher and source provenance.
- Missing geography remains null and cannot be silently converted to zero or a city.
- Validation rejects negative counts, invalid dates, duplicate identities, and impossible parent relationships.
- An unallocated value can exist at province precision without a fake marker.
- Imported cases and treatment destinations cannot be double-counted.
- Tests cover every status and geographic precision.

## Verification

Run schema tests, `vp check`, and `vp test --run`.
